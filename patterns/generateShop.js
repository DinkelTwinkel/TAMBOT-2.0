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
const applyConsumableBuff = require('./applyConsumeableBuff');

function seededRandom(seed) {
    return Math.sin(seed++) * 10000 % 1;
}

function formatDescription(str) {
    if (!str) return '';
    str = String(str);
    return str.startsWith('*') && str.endsWith('*') ? str.slice(1, -1) : `"${str}"`;
}

async function updateShopDescription(shopMessage, newDescriptions, attachment, thumbAttachment) {
    if (!shopMessage?.embeds?.length) return console.warn("No embeds found in shopMessage");

    const embed = EmbedBuilder.from(shopMessage.embeds[0]);
    const newDescription = newDescriptions[Math.floor(Math.random() * newDescriptions.length)];
    embed.setDescription('```' + formatDescription(newDescription) + '```');
    embed.setImage('attachment://shop.png');
    embed.setThumbnail('attachment://thumb.gif');

    await shopMessage.edit({ embeds: [embed], files: [attachment, thumbAttachment] });
}

function calculateRefreshText(nextRefresh) {
    const diffMs = Math.max(new Date(nextRefresh).getTime() - Date.now(), 0);
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);

    return diffHours > 0
        ? `    ✧      ✧   shop refreshing ${diffHours}h ${diffMinutes % 60}m    ✧      ✧`
        : `    ✧      ✧   shop refreshing in ${diffMinutes}m    ✧      ✧`;
}

function buildStatLine(item) {
    if (!Array.isArray(item.abilities) || !item.abilities.length) return '';
    return item.abilities
        .filter(a => a.powerlevel && a.powerlevel > 0)
        .map(a => `+${a.powerlevel} ${a.name}`)
        .join(', ');
}

function mapBuyOptions(buyPool) {
    return buyPool.map(id => {
        const item = itemSheet.find(i => i.id === String(id));
        const statLine = buildStatLine(item);
        return {
            label: item.name,
            description: `${item.description}${statLine ? ` | ${statLine}` : ''}`.slice(0, 100),
            value: String(item.id)
        };
    });
}

function mapSellOptions(itemIds) {
    return itemIds.map(itemId => {
        const item = itemSheet.find(i => i.id === String(itemId));
        return {
            label: item.name,
            description: `Sell price: ${Math.floor(item.value / 2)}`,
            value: String(itemId),
        };
    });
}

async function handleModalInteraction(i, type, item, userCurrency, userInv, shopMessage, attachment, thumbAttachment, shopInfo) {
    const maxQty = type === 'sell' ? userInv.items.find(it => it.itemId === item.id)?.quantity || 0 : undefined;
    const modal = new ModalBuilder()
        .setCustomId(`${type}_modal_${item.id}_${i.user.id}_${shopMessage.id}`)
        .setTitle(`${type === 'buy' ? 'Buy' : 'Sell'} ${item.name}`)
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('quantity')
                    .setLabel(type === 'buy'
                        ? `How many? Cost: ${item.value} each | Your balance: ${userCurrency.money}`
                        : `How many to sell? You have ${maxQty}`)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder(type === 'buy' ? 'Enter quantity' : `Max: ${maxQty}`)
            )
        );

    await i.showModal(modal);

    const submitted = await i.awaitModalSubmit({
        filter: sub => sub.customId === `${type}_modal_${item.id}_${i.user.id}_${shopMessage.id}` && sub.user.id === i.user.id,
        time: 15000
    }).catch(() => null);

    if (!submitted) return i.followUp({ content: '⏰ Time out for quantity input.', ephemeral: true });

    const quantity = Number(submitted.fields.getTextInputValue('quantity'));
    if (isNaN(quantity) || quantity <= 0 || (type === 'sell' && quantity > maxQty)) {
        await submitted.reply({ content: '❌ Invalid quantity.', ephemeral: true });
        updateShopDescription(shopMessage, shopInfo.failureOther, attachment, thumbAttachment);
        return;
    }

    const totalCostOrGain = type === 'buy' ? quantity * item.value : Math.floor(item.value / 2) * quantity;

    if (type === 'buy' && userCurrency.money < totalCostOrGain) {
        await submitted.reply({ content: `❌ You need ${totalCostOrGain} coins but only have ${userCurrency.money}.`, ephemeral: true });
        updateShopDescription(shopMessage, shopInfo.failureTooPoor, attachment, thumbAttachment);
        return;
    }

    if (type === 'buy') {
        userCurrency.money -= totalCostOrGain;
        await userCurrency.save();

        const existing = userInv.items.find(it => it.itemId === item.id);
        if (existing) existing.quantity += quantity;
        else userInv.items.push({ itemId: item.id, quantity });
        await userInv.save();

        await submitted.reply({ content: `✅ Purchased ${quantity} x ${item.name} for ${totalCostOrGain} coins!`, ephemeral: true });
        updateShopDescription(shopMessage, shopInfo.successBuy, attachment, thumbAttachment);
    } else {
        const ownedItem = userInv.items.find(it => it.itemId === item.id);
        if (ownedItem) {
            ownedItem.quantity -= quantity;
            if (ownedItem.quantity <= 0) userInv.items = userInv.items.filter(it => it.itemId !== item.id);
            await userInv.save();
        }

        userCurrency.money += totalCostOrGain;
        await userCurrency.save();

        await submitted.reply({ content: `💰 Sold ${quantity} x ${item.name} for ${totalCostOrGain} coins! Your new balance: ${userCurrency.money}`, ephemeral: true });
        updateShopDescription(shopMessage, shopInfo.successSell, attachment, thumbAttachment);
    }
}

async function generateShop(channel) {
    const matchingVC = await GachaVC.findOne({ channelId: channel.id }).lean();
    if (!matchingVC) return channel.send('❌ Not an active Gacha VC channel!');

    const shopInfo = shopData.find(s => s.id === gachaData.find(g => g.id === matchingVC.typeId)?.shop);
    if (!shopInfo) return channel.send('⚠ No shop data found for this VC!');

    // Generate buy pool
    let buyPool = [...shopInfo.staticItems];
    const amount = shopInfo.rotationalAmount || shopInfo.itemPool.length;
    let availableItems = shopInfo.itemPool.filter(id => !buyPool.includes(id));
    let seed = matchingVC.nextShopRefresh.getTime();
    for (let i = 0; i < amount && availableItems.length > 0; i++) {
        const index = Math.floor(seededRandom(seed++) * availableItems.length);
        buyPool.push(availableItems.splice(index, 1)[0]);
    }

    const pickShopDescription = shopInfo.idleDialogue[Math.floor(Math.random() * shopInfo.idleDialogue.length)];
    const imageBuffer = await generateShopImage(shopInfo, buyPool);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'shop.png' });
    const thumbAttachment = new AttachmentBuilder(`./assets/shops/${path.basename(shopInfo.image)}_shopKeeper.gif`, { name: 'thumb.gif' });

    const embed = new EmbedBuilder()
        .setTitle(`🛒 ${shopInfo.name}`)
        .setColor('Gold')
        .setDescription('```' + formatDescription(pickShopDescription) + '```')
        .setImage('attachment://shop.png')
        .setFooter({ text: calculateRefreshText(matchingVC.nextShopRefresh) })
        .setThumbnail('attachment://thumb.gif');

    // Remove old shop messages
    const messages = await channel.messages.fetch({ limit: 10 });
    messages.forEach(msg => {
        if (msg.embeds.length > 0 && msg.embeds[0].title === embed.data.title) {
            msg.delete().catch(() => {});
        }
    });

    const shopMessage = await channel.send({ embeds: [embed], files: [attachment, thumbAttachment] });
    registerBotMessage(shopMessage.guild.id, shopMessage.channel.id, shopMessage.id);

    const buyMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`shop_buy_select_${shopMessage.id}`)
            .setPlaceholder('Select an item to buy')
            .addOptions(mapBuyOptions(buyPool))
    );

    const sellMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`shop_sell_select_${shopMessage.id}`)
            .setPlaceholder('Select an item to sell')
            .addOptions(mapSellOptions(Array.from(new Set([...shopInfo.staticItems, ...shopInfo.itemPool]))))
    );

    await shopMessage.edit({ components: [buyMenu, sellMenu] });

    const collector = channel.createMessageComponentCollector({ time: 300000, componentType: 3 });
    collector.on('collect', async i => {
        if (!i.customId.endsWith(`_${shopMessage.id}`)) return;

        const userId = i.user.id;
        const selectedItemId = i.values[0];
        const item = itemSheet.find(it => it.id === selectedItemId);
        if (!item) return i.followUp({ content: '❌ Item not found', ephemeral: true });

        const userCurrency = await Currency.findOne({ userId }) || new Currency({ userId, money: 0 });
        const userInv = await PlayerInventory.findOne({ playerId: userId }) || new PlayerInventory({ playerId: userId, items: [] });

        if (i.customId.startsWith('shop_buy_select')) {
            if (item.type === 'consumable') {
                if (userCurrency.money < item.value) {
                    updateShopDescription(shopMessage, shopInfo.failureTooPoor, attachment, thumbAttachment);
                    return i.reply({ content: `❌ You need ${item.value} coins but only have ${userCurrency.money}.`, ephemeral: true });
                }
                userCurrency.money -= item.value;
                await userCurrency.save();
                await applyConsumableBuff(userId, item);
                await i.reply({ content: `✅ Used ${item.name}! Buff applied for ${item.duration} minutes.`, ephemeral: true });
                updateShopDescription(shopMessage, shopInfo.successBuy, attachment, thumbAttachment);
            } else {
                await handleModalInteraction(i, 'buy', item, userCurrency, userInv, shopMessage, attachment, thumbAttachment, shopInfo);
            }
        } else if (i.customId.startsWith('shop_sell_select')) {
            await handleModalInteraction(i, 'sell', item, userCurrency, userInv, shopMessage, attachment, thumbAttachment, shopInfo);
        }
    });

    collector.on('end', async () => {
        try {
            await shopMessage.edit({ embeds: [{ description: 'The shop is now closed.', color: 'Red' }], components: [] });
        } catch (err) {
            console.error('❌ Failed to close shop message:', err);
        }
    });
}

module.exports = generateShop;
