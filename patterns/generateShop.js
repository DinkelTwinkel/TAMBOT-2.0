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

    const shopInfo = shopData.find(s => s.id === gachaData.find(g => g.type === matchingVC.typeId)?.shop);
    if (!shopInfo) return channel.send('⚠ No shop data found for this VC!');

    // Always include staticItems
    let buyPool = [...shopInfo.staticItems];

    // Add rotational/random items on top of staticItems
    const amount = shopInfo.rotationalAmount || shopInfo.itemPool.length;
    let availableItems = shopInfo.itemPool.filter(id => !buyPool.includes(id));
    let seed = matchingVC.nextShopRefresh.getTime();

    for (let i = 0; i < amount && availableItems.length > 0; i++) {
        const index = Math.floor(seededRandom(seed++) * availableItems.length);
        buyPool.push(availableItems[index]);
        availableItems.splice(index, 1);
    }

    // The rest of your code (creating embed, menus, collectors) stays the same


    // Create the embed description:
    const itemDescriptions = buyPool.map(id => {
        const item = itemSheet.find(i => i.id === String(id));
        let statLine = item.powerlevel && item.powerlevel > 0 && item.ability ? `(+${item.powerlevel} ${item.ability})` : '';
        return `**${item.name}** — ${item.value} coins\n\`\`\`\n${item.description}\n${statLine}\n\`\`\``;
    }).join('\n');

    const embedDescription = `${shopInfo.description || ''}\n\n${itemDescriptions}`;

    const imageBuffer = await generateShopImage(
        shopInfo,
        buyPool,
    );

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'shop.png' });

    // Calculate time difference until next refresh
    const now = Date.now(); // current UTC in ms
    const nextRefreshTime = new Date(matchingVC.nextShopRefresh).getTime(); // UTC ms
    let diffMs = nextRefreshTime - now;

    if (diffMs < 0) diffMs = 0; // in case refresh time already passed

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);

    let refreshText;
    if (diffHours > 0) {
        refreshText = `    ✧      ✧   shop refreshing ${diffHours}h ${diffMinutes % 60}m    ✧      ✧`;
    } else {
        refreshText = `    ✧      ✧   shop refreshing in ${diffMinutes}m    ✧      ✧`;
    }

    const thumbAttachment = new AttachmentBuilder(`./assets/shops/${path.basename(shopInfo.image, path.extname(shopInfo.image))}_shopKeeper${path.extname(shopInfo.image)}`, { name: 'thumb.png' });

    const embed = new EmbedBuilder()
        .setTitle(`🛒 ${shopInfo.name}`)
        .setColor('Gold')
        .setDescription('```' + shopInfo.description + '```')
        .setImage('attachment://shop.png')
        .setFooter({
            text: refreshText,
        })
        .setThumbnail('attachment://thumb.png');

    // Remove any existing shop embed with same title
    const messages = await channel.messages.fetch({ limit: 10 });
    messages.forEach(msg => {
        if (msg.embeds.length > 0 && msg.embeds[0].title === embed.data.title) {
            msg.delete().catch(() => {});
        }
    });

const buyMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
        .setCustomId('shop_buy_select')
        .setPlaceholder('Select an item to buy')
        .addOptions(
            buyPool.map(id => {
                const item = itemSheet.find(i => i.id === String(id));

                // Build description + power info
                let statLine = '';
                if (item.powerlevel && item.powerlevel > 0 && item.ability) {
                    statLine = `+${item.powerlevel} ${item.ability}`;
                }

                const descriptionText = `${item.description}${statLine ? ` | ${statLine}` : ''}`;

                return {
                    label: item.name,
                    description: descriptionText.slice(0, 100), // Discord max 100 chars
                    value: String(item.id)
                };
            })
        )
);

    const sellOptions = shopInfo.itemPool.map(itemId => {
        const item = itemSheet.find(i => i.id === String(itemId));
        return {
            label: item.name,
            description: `Sell price: ${Math.floor(item.value / 2)}`,
            value: String(itemId),
        };
    });

    const sellMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('shop_sell_select')
            .setPlaceholder('Select an item to sell')
            .addOptions(sellOptions)
    );

    const shopMessage = await channel.send({ embeds: [embed], components: [buyMenu, sellMenu], files: [attachment, thumbAttachment]});

    registerBotMessage(shopMessage.guild.id, shopMessage.channel.id, shopMessage.id);

    // Collector for all users
    const collector = channel.createMessageComponentCollector({ time: 300000, componentType: 3 });

    collector.on('collect', async i => {
        const userId = i.user.id;
        const selectedItemId = i.values[0];
        const item = itemSheet.find(it => it.id === selectedItemId);
        if (!item) return i.followUp({ content: '❌ Item not found', ephemeral: true });

        let userCurrency = await Currency.findOne({ userId }) || new Currency({ userId, money: 0 });
        let userInv = await PlayerInventory.findOne({ playerId: userId }) || new PlayerInventory({ playerId: userId, items: [] });

        if (i.customId === 'shop_buy_select') {
            const modal = new ModalBuilder()
                .setCustomId(`buy_modal_${item.id}_${userId}`)
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
                filter: sub => sub.customId === `buy_modal_${item.id}_${userId}` && sub.user.id === userId,
                time: 15000
            }).catch(() => null);
            if (!submitted) return i.followUp({ content: '⏰ Time out for quantity input.', ephemeral: true });

            const quantity = Number(submitted.fields.getTextInputValue('quantity'));
            if (isNaN(quantity) || quantity <= 0) return submitted.reply({ content: '❌ Invalid quantity.', ephemeral: true });

            const totalCost = quantity * item.value;
            if (userCurrency.money < totalCost) return submitted.reply({ content: `❌ You need ${totalCost} coins but only have ${userCurrency.money}.`, ephemeral: true });

            userCurrency.money -= totalCost;
            await userCurrency.save();

            const existing = userInv.items.find(it => it.itemId === item.id);
            if (existing) existing.quantity += quantity;
            else userInv.items.push({ itemId: item.id, quantity });
            await userInv.save();

            await submitted.reply({ content: `✅ Purchased ${quantity} x ${item.name} for ${totalCost} coins!`, ephemeral: true });

        } else if (i.customId === 'shop_sell_select') {
            const ownedItem = userInv.items.find(it => it.itemId === selectedItemId);
            const maxQty = ownedItem?.quantity || 0;

            const modal = new ModalBuilder()
                .setCustomId(`sell_modal_${item.id}_${userId}`)
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
                filter: sub => sub.customId === `sell_modal_${item.id}_${userId}` && sub.user.id === userId,
                time: 15000
            }).catch(() => null);
            if (!submitted) return i.followUp({ content: '⏰ Time out for quantity input.', ephemeral: true });

            const quantity = Number(submitted.fields.getTextInputValue('quantity'));
            if (isNaN(quantity) || quantity <= 0 || quantity > maxQty) return submitted.reply({ content: `❌ Invalid quantity. You can sell between 0 and ${maxQty}.`, ephemeral: true });

            if (ownedItem) {
                ownedItem.quantity -= quantity;
                if (ownedItem.quantity <= 0) userInv.items = userInv.items.filter(it => it.itemId !== item.id);
                await userInv.save();
            }

            const totalSell = Math.floor(item.value / 2) * quantity;
            userCurrency.money += totalSell;
            await userCurrency.save();

            await submitted.reply({ content: `💰 Sold ${quantity} x ${item.name} for ${totalSell} coins! Your new balance: ${userCurrency.money}`, ephemeral: true });
        }
    });

    // collector.on('end', async () => {
    //     try {
    //         await shopMessage.edit({ embeds: [{ description: 'The shop is now closed.', color: 'Red' }], components: [] });
    //     } catch (err) {
    //         console.error('❌ Failed to close shop message:', err);
    //     }
    // });
}

module.exports = generateShop;
