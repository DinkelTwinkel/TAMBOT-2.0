const PlayerInventory = require('../../models/inventory');
const Currency = require('../../models/currency');
const generateShop = require('../generateShop');

// ---------------- Embed Helper ----------------
function createMessage(description) {
    return {
        content: '`' + description + '`', // optional main text
        // embeds: [
        //     {
        //         description,
        //         color: 0x808080, // grey
        //         timestamp: new Date()
        //     }
        // ],
        // Optional: you can also add buttons or other components
        // components: [...]
    };
}

// ---------------- Item Pool for findResource ----------------
const itemPool = [
    { itemId: "1", name: "Coal Ore", baseWeight: 50, boostedPowerLevel: 1 },
    { itemId: "2", name: "Topaz Gem", baseWeight: 20, boostedPowerLevel: 3 },
    // { itemId: "3", name: "Diamond", baseWeight: 5, boostedPowerLevel: 5 }
];

// Pick item based on weight and channel power level
function pickWeightedItem(powerLevel) {
    let totalWeight = 0;
    const weightedItems = itemPool.map(item => {
        let weight = item.baseWeight;
        if (powerLevel === item.boostedPowerLevel) weight *= 10; // boost for power level
        totalWeight += weight;
        return { ...item, weight };
    });

    let rand = Math.random() * totalWeight;
    for (const item of weightedItems) {
        if (rand < item.weight) return item;
        rand -= item.weight;
    }
    return weightedItems[0];
}

// ---------------- Weighted Event System ----------------
const miningEvents = [
    { func: giveFindResource, weight: 60 },
    { func: nothingHappens, weight: 10 },
    { func: sellCoalEvent, weight: 5 } // adjust as needed
];

// Utility to pick a function based on weights
function pickEvent(events) {
    const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const event of events) {
        if (rand < event.weight) return event.func;
        rand -= event.weight;
    }
    return events[0].func;
}

// ---------------- Event Functions ----------------
async function giveFindResource(player, channel, powerLevel = 1) {
    const item = pickWeightedItem(powerLevel);

    try {
        let inv = await PlayerInventory.findOne({ playerId: player.id, playerTag: player.user.tag });
        if (!inv) {
            inv = new PlayerInventory({
                playerId: player.id,
                playerTag: player.user.tag,
                items: [{ itemId: item.itemId, quantity: 1 }]
            });
        } else {
            const existing = inv.items.find(it => it.itemId === item.itemId);
            if (existing) existing.quantity += 1;
            else inv.items.push({ itemId: item.itemId, quantity: 1 });
        }
        await inv.save();

        const message = createMessage(`⛏️ MINED! ${player.displayName} found 『 ${item.name} 』!`);
        await channel.send(message);
    } catch (err) {
        console.error('Error giving item:', err);
    }
}

async function nothingHappens(player, channel) {
    const message = createMessage(`😐 ${player.displayName} swung their pickaxe but found nothing.`);
    await channel.send(message);
}

// Sell Coal Event (unchanged)
async function sellCoalEvent(player, channel) {
    const playerId = player.id;
    const coalItemId = "1";

    try {
        const inv = await PlayerInventory.findOne({ playerId });
        if (!inv) {
            const message = createMessage(`❌ ${player.displayName} Met a Coal Trader, but had no coal to sell...`);
            await channel.send(message);
            return;
        }

        const coal = inv.items.find(i => i.itemId === coalItemId);
        if (!coal || coal.quantity <= 0) {
            const message = createMessage(`❌ ${player.displayName} Met a Coal Trader, but had no coal to sell...`);
            await channel.send(message);
            return;
        }

        const sellAmount = Math.ceil(coal.quantity * Math.random());
        const pricePerCoal = 5;
        const total = sellAmount * pricePerCoal;

        coal.quantity = 0;
        inv.items = inv.items.filter(i => i.quantity > 0);
        await inv.save();

        // chance for the player to be scammed.
        const scamChance = 0.2;
        if (scamChance > Math.random()) return channel.send(createMessage(`⚠️ Scammed! ${player.displayName} tried to sell Coal, but the trader scammed them! They lost their coal and gained nothing.`))

        let currency = await Currency.findOne({ userId: playerId });
        if (!currency) {
            currency = new Currency({ userId: playerId, money: total });
        } else {
            currency.money += total;
        }
        await currency.save();

        const message = createMessage(`💰 Trader Event! ${player.displayName} met a Coal Trader! They sold ${sellAmount} Coal for ${total} coins!`);
        await channel.send(message);
    } catch (err) {
        console.error('Error selling coal in event:', err);
    }
}


// ---------------- Main Mining Event ----------------
module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();

    // Schedule next trigger
    dbEntry.nextTrigger = new Date(now + 60 * 1000 * Math.random());
    await dbEntry.save();

    // Check VC
    if (!channel || !channel.isVoiceBased()) return;

    // Get all non-bot members
    const humans = channel.members.filter(m => !m.user.bot);
    if (humans.size === 0) return;

    const powerLevel = json.power || 1;

    // Decide how many times to run (1 → humans.size)
    const timesToRun = Math.floor(Math.random() * humans.size) + 1;

    for (let i = 0; i < timesToRun; i++) {
        const winner = humans.random(); // pick a random human each time
        const eventFunc = pickEvent(miningEvents); // weighted event pick
        await eventFunc(winner, channel, powerLevel);
    }

    generateShop(channel);
};
