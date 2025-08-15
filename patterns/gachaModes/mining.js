const PlayerInventory = require('../../models/inventory');
const Currency = require('../../models/currency');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
const itemSheet = require('../../data/itemSheet.json');

// ---------------- Embed Helper ----------------
const createMessage = description => ({ content: `\`${description}\`` });

// ---------------- Item Pool for findResource ----------------
const itemPool = [
    { itemId: "1", name: "Coal Ore", baseWeight: 50, boostedPowerLevel: 1 },
    { itemId: "2", name: "Topaz Gem", baseWeight: 20, boostedPowerLevel: 3 },
];

// ---------------- Weighted Selection ----------------
function pickWeightedItem(powerLevel) {
    const weightedItems = itemPool.map(item => {
        const weight = item.baseWeight * (powerLevel === item.boostedPowerLevel ? 10 : 1);
        return { ...item, weight };
    });
    const totalWeight = weightedItems.reduce((sum, i) => sum + i.weight, 0);
    let rand = Math.random() * totalWeight;
    return weightedItems.find(i => (rand -= i.weight) < 0) || weightedItems[0];
}

function pickEvent(events) {
    const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * totalWeight;
    return events.find(e => (rand -= e.weight) < 0)?.func || events[0].func;
}

// ---------------- Inventory Helpers ----------------
async function addToInventory(player, itemId, quantity) {
    let inv = await PlayerInventory.findOne({ playerId: player.id, playerTag: player.user.tag });
    if (!inv) {
        inv = new PlayerInventory({ playerId: player.id, playerTag: player.user.tag, items: [{ itemId, quantity }] });
    } else {
        const existing = inv.items.find(i => i.itemId === itemId);
        if (existing) existing.quantity += quantity;
        else inv.items.push({ itemId, quantity });
    }
    await inv.save();
}

async function removeFromInventory(inv, itemRef, amount = 1) {
    itemRef.quantity = Math.max(0, itemRef.quantity - amount);
    inv.items = inv.items.filter(i => i.quantity > 0);
    await inv.save();
}

// ---------------- Event Functions ----------------
async function nothingHappens(player, channel, playerStats, item) {
    // If player has no mining ability, they might scavenge
    if (!playerStats.mining || playerStats.mining <= 0) {
        if (Math.random() < 0.3) { // 30% chance to scavenge
            await channel.send(createMessage(`🪓 Scavenged! ${player.displayName} found 『 ${item.name} 』x 1 on the floor...!`));
            await addToInventory(player, item.itemId, 1);
        } else {
            await channel.send(createMessage(`❌ ${player.displayName} failed to mine anything due to not having a pickaxe...`));
        }
    } else {
        // Player has mining ability, but failed
        await channel.send(createMessage(`😐 ${player.displayName} swung at the walls but found nothing.`));
    }
}

async function giveFindResource(player, channel, powerLevel) {
    const item = pickWeightedItem(powerLevel);
    const playerStats = await getPlayerStats(player.id);

    if (playerStats.mining && playerStats.mining > 0) {
        if (Math.random() > 0.95) {
            // Small chance to fail mining
            return nothingHappens(player, channel, playerStats, item);
        }
        const quantityFound = 1 + Math.floor(Math.random() * playerStats.mining);
        await channel.send(createMessage(`⛏️ MINED! ${player.displayName} found 『 ${item.name} 』x ${quantityFound}!`));
        await addToInventory(player, item.itemId, quantityFound);
    } else {
        // Player has no pickaxe → delegate to nothingHappens which handles scavenging chance
        return nothingHappens(player, channel, playerStats, item);
    }
}

async function sellCoalEvent(player, channel) {
    try {
        const inv = await PlayerInventory.findOne({ playerId: player.id });
        if (!inv) return channel.send(createMessage(`❌ ${player.displayName} Met a Coal Trader, but had no coal to sell...`));

        const coal = inv.items.find(i => i.itemId === "1" && i.quantity > 0);
        if (!coal) return channel.send(createMessage(`❌ ${player.displayName} Met a Coal Trader, but had no coal to sell...`));

        const sellAmount = Math.ceil(coal.quantity * Math.random());
        const pricePerCoal = Math.ceil(Math.random() * 5);
        const total = sellAmount * pricePerCoal;

        coal.quantity = 0;
        inv.items = inv.items.filter(i => i.quantity > 0);
        await inv.save();

        if (Math.random() < 0.2) {
            return channel.send(createMessage(`⚠️ Scammed! ${player.displayName} tried to sell Coal, but the trader scammed them! They lost ${sellAmount} coal and gained nothing.`));
        }

        const currency = await Currency.findOne({ userId: player.id }) || new Currency({ userId: player.id, money: 0 });
        currency.money += total;
        await currency.save();

        await channel.send(createMessage(`💰 Trader Event! ${player.displayName} sold ${sellAmount} Coal for ${total} coins!`));
    } catch (err) { console.error('Error selling coal in event:', err); }
}

async function pickaxeBreakEvent(player, channel, powerLevel) {
    const playerStats = await getPlayerStats(player.id);
    if (!playerStats.mining || playerStats.mining <= 0) return giveFindResource(player, channel, powerLevel);

    const inv = await PlayerInventory.findOne({ playerId: player.id });
    if (!inv) return console.log('Cannot find player inventory');

    const miningPickaxes = inv.items
        .map(invItem => ({ ...itemSheet.find(it => String(it.id) === String(invItem.itemId)), invRef: invItem }))
        .filter(i => i?.ability === "mining");

    if (miningPickaxes.length === 0) return nothingHappens(player, channel);

    const bestPickaxe = miningPickaxes.reduce((prev, curr) => (curr.powerlevel > prev.powerlevel ? curr : prev));

    const breakChance = Math.max(0.05, 0.5 - (bestPickaxe.powerlevel * 0.05));

    if (Math.random() < breakChance) {
        await removeFromInventory(inv, bestPickaxe.invRef, 1);
        await channel.send(createMessage(`💥 ${player.displayName}'s 『 ${bestPickaxe.name} 』 shattered into pieces!`));
    } else {
        await channel.send(createMessage(`⚒️ ${player.displayName} heard their 『 ${bestPickaxe.name} 』 creak... but it held together!`));
    }
}

// ---------------- Main Mining Event ----------------
const miningEvents = [
    { func: giveFindResource, weight: 60 },
    { func: sellCoalEvent, weight: 5 },
    { func: pickaxeBreakEvent, weight: 20 }
];

module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();

    dbEntry.nextTrigger = new Date(now + 60 * 1000 * Math.random());
    if (now > dbEntry.nextShopRefresh) dbEntry.nextShopRefresh = new Date(now + 60 * 1000 * 25);
    await dbEntry.save();

    if (!channel?.isVoiceBased()) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (!humans.size) return;

    const powerLevel = json.power || 1;
    const timesToRun = Math.floor(Math.random() * humans.size) + 1;

    for (let i = 0; i < timesToRun; i++) {
        const winner = humans.random();
        await pickEvent(miningEvents)(winner, channel, powerLevel);
    }

    generateShop(channel);
};
