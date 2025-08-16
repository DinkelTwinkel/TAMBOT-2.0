const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const PlayerInventory = require('../../models/inventory');
const Currency = require('../../models/currency');
const Vote = require('../../models/votes');
const GuildConfig = require('../../models/GuildConfig');

const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
const itemSheet = require('../../data/itemSheet.json');
const { db } = require('../../models/GuildConfig');

// ---------------- Helpers ----------------
const createMessage = desc => ({ content: `\`${desc}\`` });

const pickWeightedItem = (pool, powerLevel) => {
    const weightedItems = pool.map(i => ({
        ...i,
        weight: i.baseWeight * (i.boostedPowerLevel === powerLevel ? 10 : 1)
    }));
    const total = weightedItems.reduce((sum, i) => sum + i.weight, 0);
    let rand = Math.random() * total;
    return weightedItems.find(i => (rand -= i.weight) < 0) || weightedItems[0];
};

const pickEvent = events => {
    const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * totalWeight;
    return events.find(e => (rand -= e.weight) < 0)?.func || events[0].func;
};

async function addToInventory(player, itemId, quantity) {
    const inv = await PlayerInventory.findOne({ playerId: player.id }) 
               || new PlayerInventory({ playerId: player.id, playerTag: player.user.tag, items: [] });
    const item = inv.items.find(i => i.itemId === itemId);
    if (item) item.quantity += quantity;
    else inv.items.push({ itemId, quantity });
    await inv.save();
}

async function removeFromInventory(inv, itemRef, amount = 1) {
    itemRef.quantity = Math.max(0, itemRef.quantity - amount);
    inv.items = inv.items.filter(i => i.quantity > 0);
    await inv.save();
}

// ---------------- Mining Events ----------------
async function nothingHappens(player, channel, playerStats, item) {
    if (!playerStats.mining || playerStats.mining <= 0) {
        if (Math.random() < 0.3) {
            await addToInventory(player, item.itemId, 1);
            return channel.send(createMessage(`🪓 Scavenged! ${player.displayName} found 『 ${item.name} 』x1!`));
        }
        return channel.send(createMessage(`❌ ${player.displayName} failed to mine anything.`));
    }
    return channel.send(createMessage(`😐 ${player.displayName} swung but found nothing.`));
}

async function giveFindResource(player, channel, powerLevel) {
    const item = pickWeightedItem([
        { itemId: "1", name: "Coal Ore", baseWeight: 50, boostedPowerLevel: 1 },
        { itemId: "2", name: "Topaz Gem", baseWeight: 20, boostedPowerLevel: 3 }
    ], powerLevel);

    const stats = await getPlayerStats(player.id);
    if (stats.mining && stats.mining > 0 && Math.random() > 0.95) {
        return nothingHappens(player, channel, stats, item);
    }

    const quantity = stats.mining ? 1 + Math.floor(Math.random() * stats.mining) : 1;
    await addToInventory(player, item.itemId, quantity);
    await channel.send(createMessage(`⛏️ MINED! ${player.displayName} found 『 ${item.name} 』x${quantity}!`));
}

// ---------------- Main Event Handler ----------------
const miningEvents = [
    { func: giveFindResource, weight: 60 },
    { func: async (player, channel) => {
        const inv = await PlayerInventory.findOne({ playerId: player.id });
        if (!inv) return channel.send(createMessage(`❌ ${player.displayName} has no coal to sell.`));
        const coal = inv.items.find(i => i.itemId === "1" && i.quantity > 0);
        if (!coal) return channel.send(createMessage(`❌ ${player.displayName} has no coal.`));

        const sellAmount = Math.ceil(coal.quantity * Math.random());
        coal.quantity = 0;
        inv.items = inv.items.filter(i => i.quantity > 0);
        await inv.save();

        const total = sellAmount * Math.ceil(Math.random() * 5);
        if (Math.random() < 0.2) return channel.send(createMessage(`⚠️ ${player.displayName} got scammed! Lost ${sellAmount} coal.`));

        const currency = await Currency.findOne({ userId: player.id }) || new Currency({ userId: player.id, money: 0 });
        currency.money += total;
        await currency.save();
        await channel.send(createMessage(`💰 Sold ${sellAmount} Coal for ${total} coins!`));
    }, weight: 5 },
    { func: async (player, channel, powerLevel) => {
        const stats = await getPlayerStats(player.id);
        if (!stats.mining || stats.mining <= 0) return giveFindResource(player, channel, powerLevel);
        const inv = await PlayerInventory.findOne({ playerId: player.id });
        if (!inv) return console.log('Inventory not found');

        const miningPickaxes = inv.items
            .map(i => ({ ...itemSheet.find(it => String(it.id) === String(i.itemId)), invRef: i }))
            .filter(i => i?.ability === "mining");

        if (!miningPickaxes.length) return nothingHappens(player, channel, stats, itemSheet.find(it => it.id === '3'));
        const bestPickaxe = miningPickaxes.reduce((p, c) => (c.powerlevel > p.powerlevel ? c : p));
        if (Math.random() < Math.max(0.05, 0.5 - bestPickaxe.powerlevel * 0.05)) {
            await removeFromInventory(inv, bestPickaxe.invRef);
            return channel.send(createMessage(`💥 ${player.displayName}'s 『 ${bestPickaxe.name} 』 shattered!`));
        }
        return channel.send(createMessage(`⚒️ ${player.displayName}'s 『 ${bestPickaxe.name} 』 held together.`));
    }, weight: 20 }
];

module.exports = async (channel, dbEntry, json, client) => {
    if (!channel?.isVoiceBased()) return;

    const now = Date.now();
    if (dbEntry.gameData) await endThiefGame(channel, dbEntry);
    if (now > dbEntry.nextShopRefresh) dbEntry.nextShopRefresh = new Date(now + 25 * 60 * 1000);

    const humans = channel.members.filter(m => !m.user.bot);
    if (!humans.size) return;

    const powerLevel = json.power || 1;
    const timesToRun = Math.floor(Math.random() * humans.size) + 1;

    for (let i = 0; i < timesToRun; i++) {
        const winner = humans.random();
        await pickEvent(miningEvents)(winner, channel, powerLevel);
    }

    await generateShop(channel);

    if (now > dbEntry.nextLongBreak) {
        dbEntry.nextLongBreak = new Date(now + 125 * 60 * 1000);
        dbEntry.nextTrigger = new Date(now + 25 * 60 * 1000);
        channel.send('# 25 MIN BREAK, MINING PAUSED.');
        await startThiefGame(channel, dbEntry);
    }

    await dbEntry.save();
};
