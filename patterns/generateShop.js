// Updated generateShop.js - Removed collectors, relies on centralized handler
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
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
    const now = Date.now();
    if (new Date(matchingVC.nextShopRefresh).getTime() < now) matchingVC.nextShopRefresh = new Date(now + 25 * 60 * 1000);

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

    // Clean up old shop messages
    const messages = await channel.messages.fetch({ limit: 10 });
    messages.forEach(msg => {
        if (msg.embeds.length > 0 && msg.embeds[0].title === embed.data.title) {
            msg.delete().catch(() => {});
        }
    });

    // Send shop message first to get the message ID
    const shopMessage = await channel.send({ embeds: [embed], files: [attachment, thumbAttachment] });

    registerBotMessage(shopMessage.guild.id, shopMessage.channel.id, shopMessage.id);

    // Create buy menu with shop message ID in custom ID
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
                        label: `${item.name} [${item.value}c]`,
                        description: descriptionText.slice(0, 100),
                        value: String(item.id)
                    };
                })
            )
    );

    // Create sell menu - combine static and rotational items, remove duplicates
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

    // Edit the shop message to add the menus
    await shopMessage.edit({ components: [buyMenu, sellMenu] });

    // Note: No collectors needed! The centralized ShopHandler will handle all interactions
    console.log(`✅ Shop generated for channel ${channel.id} with message ID ${shopMessage.id}`);
    
    // Return the shop message so it can be closed later
    return shopMessage;

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

module.exports = generateShop;