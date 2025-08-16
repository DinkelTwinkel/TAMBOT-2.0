const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const Currency = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const GachaVC = require('../models/activevcs');
const gachaData = require('../data/gachaServers.json');
const shopData = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');
const registerBotMessage = require('../patterns/registerBotMessage');
const generateShopImage = require('./generateShopImage');
const path = require('path');

function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

async function generateShop(channel) {
    const matchingVC = await GachaVC.findOne({ channelId: channel.id }).lean();
    if (!matchingVC) return channel.send('❌ Not an active Gacha VC channel!');

    const shopInfo = shopData.find(s => s.id === gachaData.find(g => g.id === matchingVC.typeId)?.shop);
    if (!shopInfo) return channel.send('⚠ No shop data found for this VC!');

    let buyPool = [...shopInfo.staticItems];
    const amount = shopInfo.rotationalAmount || shopInfo.itemPool.length;
    let availableItems = shopInfo.itemPool.filter(id => !buyPool.includes(id));
    let seed = matchingVC.nextShopRefresh.getTime();

    for (let i = 0; i < amount && availableItems.length > 0; i++) {
        const index = Math.floor(seededRandom(seed++) * availableItems.length);
        buyPool.push(availableItems[index]);
        availableItems.splice(index, 1);
    }

    const pickShopDescription = shopInfo.idleDialogue[Math.floor(shopInfo.idleDialogue.length * Math.random())];
    const imageBuffer = await generateShopImage(shopInfo, buyPool);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'shop.png' });

    const now = Date.now();
    const nextRefreshTime = new Date(matchingVC.nextShopRefresh).getTime();
    let diffMs = nextRefreshTime - now;
    if (diffMs < 0) diffMs = 0;

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);

    let refreshText;
    if (diffHours > 0) {
        refreshText = `    ✧      ✧   shop refreshing ${diffHours}h ${diffMinutes % 60}m    ✧      ✧`;
    } else {
        refreshText = `    ✧      ✧   shop refreshing in ${diffMinutes}m    ✧      ✧`;
    }

    const thumbAttachment = new AttachmentBuilder(`./assets/shops/${path.basename(shopInfo.image)}_shopKeeper.gif`, { name: 'thumb.gif' });

    const embed = new EmbedBuilder()
        .setTitle(`🛒 ${shopInfo.name}`)
        .setColor('Gold')
        .setDescription('```' + formatDescription(pickShopDescription) + '```')
        .setImage('attachment://shop.png')
        .setFooter({ text: refreshText })
        .setThumbnail('attachment://thumb.gif');

    const messages = await channel.messages.fetch({ limit: 10 });
    messages.forEach(msg => {
        if (msg.embeds.length > 0 && msg.embeds[0].title === embed.data.title) {
            msg.delete().catch(() => {});
        }
    });

    // 🟢 Send shop message first so we have shopMessage.id
    const shopMessage = await channel.send({ embeds: [embed], files: [attachment, thumbAttachment] });

    registerBotMessage(shopMessage.guild.id, shopMessage.channel.id, shopMessage.id);

    // 🟢 Custom IDs include shopMessage.id
    const buyMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`shop_buy_select_${shopMessage.id}`)
            .setPlaceholder('Select an item to buy')
            .addOptions(
                buyPool.map(id => {
                    const item = itemSheet.find(i => i.id === String(id));

                    // Build stat line from all abilities
                    let statLine = '';
                    if (Array.isArray(item.abilities) && item.abilities.length > 0) {
                        const abilityStrings = item.abilities
                            .filter(a => a.powerlevel && a.powerlevel > 0)
                            .map(a => `+${a.powerlevel} ${a.name}`);
                        
                        if (abilityStrings.length > 0) {
                            statLine = abilityStrings.join(', ');
                        }
                    }

                    const descriptionText = `${item.description}${statLine ? ` | ${statLine}` : ''}`;

                    return {
                        label: `${item.name} [${item.value}c]`, // 🟢 cost added here
                        description: descriptionText.slice(0, 100),
                        value: String(item.id)
                    };
                })
            )
    );


    // Combine static and rotational items for selling, remove duplicates
    const sellItemIds = Array.from(new Set([...shopInfo.staticItems, ...shopInfo.itemPool]));

    const sellOptions = sellItemIds.map(itemId => {
        const item = itemSheet.find(i => i.id === String(itemId));
        return {
            label: item.name,
            description: `Sell price: ${Math.floor(item.value / 2)}`,
            value: String(itemId),
        };
    });


    const sellMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`shop_sell_select_${shopMessage.id}`)
            .setPlaceholder('Select an item to sell')
            .addOptions(sellOptions)
    );

    // 🟢 Edit the shop message to add menus now
    await shopMessage.edit({ components: [buyMenu, sellMenu] });

    const collector = channel.createMessageComponentCollector({ time: 300000, componentType: 3 });

    collector.on('collect', async i => {
        // 🟢 Only allow this shopMessage's menus
        if (!i.customId.endsWith(`_${shopMessage.id}`)) return;

        const userId = i.user.id;
        const selectedItemId = i.values[0];
        const item = itemSheet.find(it => it.id === selectedItemId);
        if (!item) return i.followUp({ content: '❌ Item not found', ephemeral: true });

        let userCurrency = await Currency.findOne({ userId }) || new Currency({ userId, money: 0 });
        let userInv = await PlayerInventory.findOne({ playerId: userId }) || new PlayerInventory({ playerId: userId, items: [] });

        if (i.customId.startsWith('shop_buy_select')) {

            if (item.type === 'consumable') {
            const totalCost = item.value;
            if (userCurrency.money < totalCost) {
                updateShopDescription(shopMessage, shopInfo.failureTooPoor, attachment, thumbAttachment);
                return i.reply({ content: `❌ You need ${totalCost} coins but only have ${userCurrency.money}.`, ephemeral: true });
            }

            // Deduct cost
            userCurrency.money -= totalCost;
            await userCurrency.save();

            // Apply buff
            const applyConsumableBuff = require('./applyConsumeableBuff');
            const buffResult = await applyConsumableBuff(userId, item);

            await i.reply({
                content: `✅ Used ${item.name}! Buff applied for ${item.duration} minutes.`,
                ephemeral: true
            });
            updateShopDescription(shopMessage, shopInfo.successBuy, attachment, thumbAttachment);
            return;
            }

            // 🟢 Non-consumable → open modal as before
            const modal = new ModalBuilder()
                .setCustomId(`buy_modal_${item.id}_${userId}_${shopMessage.id}`)
                .setTitle(`Buy ${item.name}`)
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('quantity')
                            .setLabel(`How many? Cost: ${item.value} each | Your balance: ${userCurrency.money}`)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('Enter quantity')
                    )
                );

            await i.showModal(modal);

            const submitted = await i.awaitModalSubmit({
                filter: sub => sub.customId === `buy_modal_${item.id}_${userId}_${shopMessage.id}` && sub.user.id === userId,
                time: 15000
            }).catch(() => null);
            if (!submitted) return i.followUp({ content: '⏰ Time out for quantity input.', ephemeral: true });

            const quantity = Number(submitted.fields.getTextInputValue('quantity'));
            if (isNaN(quantity) || quantity <= 0) {
                updateShopDescription(shopMessage, shopInfo.failureOther, attachment, thumbAttachment);  
                return submitted.reply({ content: '❌ Invalid quantity.', ephemeral: true });
            }
            const totalCost = quantity * item.value;
            if (userCurrency.money < totalCost) {
                updateShopDescription(shopMessage, shopInfo.failureTooPoor, attachment, thumbAttachment);   
                return submitted.reply({ content: `❌ You need ${totalCost} coins but only have ${userCurrency.money}.`, ephemeral: true });
            }
            userCurrency.money -= totalCost;
            await userCurrency.save();

            const existing = userInv.items.find(it => it.itemId === item.id);
            if (existing) existing.quantity += quantity;
            else userInv.items.push({ itemId: item.id, quantity });
            await userInv.save();

            await submitted.reply({ content: `✅ Purchased ${quantity} x ${item.name} for ${totalCost} coins!`, ephemeral: true });
            updateShopDescription(shopMessage, shopInfo.successBuy, attachment, thumbAttachment);
        } else if (i.customId.startsWith('shop_sell_select')) {
            const ownedItem = userInv.items.find(it => it.itemId === selectedItemId);
            const maxQty = ownedItem?.quantity || 0;

            const modal = new ModalBuilder()
                .setCustomId(`sell_modal_${item.id}_${userId}_${shopMessage.id}`)
                .setTitle(`Sell ${item.name}`)
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('quantity')
                            .setLabel(`How many to sell? You have ${maxQty}`)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder(`Max: ${maxQty}`)
                    )
                );

            await i.showModal(modal);

            const submitted = await i.awaitModalSubmit({
                filter: sub => sub.customId === `sell_modal_${item.id}_${userId}_${shopMessage.id}` && sub.user.id === userId,
                time: 15000
            }).catch(() => null);
            if (!submitted) return i.followUp({ content: '⏰ Time out for quantity input.', ephemeral: true });

            const quantity = Number(submitted.fields.getTextInputValue('quantity'));
            if (isNaN(quantity) || quantity <= 0 || quantity > maxQty) {    
                updateShopDescription(shopMessage, shopInfo.failureOther, attachment, thumbAttachment);          
                return submitted.reply({ content: `❌ Invalid quantity. You can sell between 0 and ${maxQty}.`, ephemeral: true });
            }
            if (ownedItem) {
                ownedItem.quantity -= quantity;
                if (ownedItem.quantity <= 0) userInv.items = userInv.items.filter(it => it.itemId !== item.id);
                await userInv.save();
            }

            const totalSell = Math.floor(item.value / 2) * quantity;
            userCurrency.money += totalSell;
            await userCurrency.save();

            await submitted.reply({ content: `💰 Sold ${quantity} x ${item.name} for ${totalSell} coins! Your new balance: ${userCurrency.money}`, ephemeral: true });
            updateShopDescription(shopMessage, shopInfo.successSell, attachment, thumbAttachment);      
        }
    });

    collector.on('end', async () => {
        try {
            await shopMessage.edit({ embeds: [{ description: 'The shop is now closed.', color: 'Red' }], components: [] });
        } catch (err) {
            console.error('❌ Failed to close shop message:');
        }
    });
}

module.exports = generateShop;

async function updateShopDescription(shopMessage, newDescriptions, attachment, thumbAttachment) {
    const newDescription = newDescriptions[Math.floor(Math.random() * newDescriptions.length)];
    if (!shopMessage?.embeds?.length) {
        console.warn("No embeds found in shopMessage");
        return;
    }

    // Helper to format description

    // Get the first embed and clone it so we can modify
    const existingEmbed = EmbedBuilder.from(shopMessage.embeds[0]);

    // Update the description with formatting
    existingEmbed.setDescription('```' + formatDescription(newDescription) + '```');

    existingEmbed.setImage('attachment://shop.png');
    existingEmbed.setThumbnail('attachment://thumb.gif');

    // Edit the message
    await shopMessage.edit({ embeds: [existingEmbed], files: [attachment, thumbAttachment] });
}

const formatDescription = (str) => {
        if (!str) return '';
        str = str.toString();
        // Remove surrounding * if present
        if (str.startsWith('*') && str.endsWith('*')) {
            return str.slice(1, -1);
        }
        return `"${str}"`; // wrap in quotes otherwise
};