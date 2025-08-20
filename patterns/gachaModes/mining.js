const PlayerInventory = require('../../models/inventory');
const Currency = require('../../models/currency');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
const itemSheet = require('../../data/itemSheet.json');
const { db } = require('../../models/GuildConfig');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const registerBotMessage = require('../registerBotMessage');
const gachaVC = require('../../models/activevcs');
const generateVoiceChannelImage = require('../generateLocationImage');
const path = require('path');

// ---------------- Expandable Item Pool for Mining ----------------
const miningItemPool = [
    { itemId: "1", name: "Coal Ore", baseWeight: 50, boostedPowerLevel: 1, value: 2 },   // Common starter ore
    { itemId: "21", name: "Copper Ore", baseWeight: 35, boostedPowerLevel: 1, value: 8 }, // Low-tier metal
    { itemId: "22", name: "Iron Ore", baseWeight: 25, boostedPowerLevel: 2, value: 15 },  // Sturdy metal

    { itemId: "2", name: "Topaz Gem", baseWeight: 20, boostedPowerLevel: 2, value: 25 },  // Semi-rare gem
    { itemId: "23", name: "Emerald Gem", baseWeight: 10, boostedPowerLevel: 3, value: 50 }, // Rare gem
    { itemId: "24", name: "Ruby Gem", baseWeight: 7, boostedPowerLevel: 3, value: 75 },    // Rare gem
    { itemId: "6", name: "Diamond Gem", baseWeight: 3, boostedPowerLevel: 4, value: 100 }, // Precious gem

    { itemId: "25", name: "Obsidian", baseWeight: 2, boostedPowerLevel: 5, value: 150 },   // Deep-tier rare
    { itemId: "26", name: "Mythril Ore", baseWeight: 1, boostedPowerLevel: 6, value: 200 } // Ultra-rare metal
];
// ---------------- Weighted Selection ----------------
function pickWeightedItem(powerLevel) {
    const weightedItems = miningItemPool.map(item => {
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

// ---------------- Atomic Database Operations ----------------

// Atomic minecart item addition
async function addItemToMinecart(dbEntry, playerId, itemId, amount) {
    const channelId = dbEntry.channelId;
    
    try {
        // Try the increment operation first
        await gachaVC.updateOne(
            { channelId: channelId },
            {
                $inc: {
                    [`gameData.minecart.items.${itemId}.quantity`]: amount,
                    [`gameData.minecart.items.${itemId}.contributors.${playerId}`]: amount,
                    [`gameData.minecart.contributors.${playerId}`]: amount
                }
            }
        );
    } catch (error) {
        // If it fails due to missing path, initialize the structure first
        if (error.code === 40 || error.message.includes('path') || error.message.includes('conflict')) {
            // Get current document to merge with new structure
            const currentDoc = await gachaVC.findOne({ channelId: channelId });
            
            // Initialize the minecart structure preserving existing data
            const existingItems = currentDoc?.gameData?.minecart?.items || {};
            const existingContributors = currentDoc?.gameData?.minecart?.contributors || {};
            
            // Set the new item structure
            existingItems[itemId] = existingItems[itemId] || { quantity: 0, contributors: {} };
            existingItems[itemId].quantity = (existingItems[itemId].quantity || 0) + amount;
            existingItems[itemId].contributors[playerId] = (existingItems[itemId].contributors[playerId] || 0) + amount;
            existingContributors[playerId] = (existingContributors[playerId] || 0) + amount;
            
            await gachaVC.updateOne(
                { channelId: channelId },
                {
                    $set: {
                        'gameData.minecart.items': existingItems,
                        'gameData.minecart.contributors': existingContributors
                    }
                },
                { upsert: true }
            );
        } else {
            throw error; // Re-throw if it's a different error
        }
    }
}

// Atomic break counter increment
async function incrementBreakCount(channelId) {
    try {
        const result = await gachaVC.findOneAndUpdate(
            { channelId: channelId },
            { $inc: { 'gameData.breakCount': 1 } },
            { returnDocument: 'after' }
        );
        return result.gameData.breakCount;
    } catch (error) {
        if (error.code === 40 || error.message.includes('conflict')) {
            // Initialize breakCount if it doesn't exist
            await gachaVC.updateOne(
                { channelId: channelId },
                {
                    $set: { 'gameData.breakCount': 1 }
                },
                { upsert: true }
            );
            return 1;
        } else {
            throw error;
        }
    }
}

// Atomic minecart reset
async function resetMinecart(channelId) {
    await gachaVC.updateOne(
        { channelId: channelId },
        {
            $set: {
                'gameData.minecart.items': {},
                'gameData.minecart.contributors': {},
                'gameData.sessionStart': new Date()
            }
        }
    );
}

// Atomic special event setup
async function setSpecialEvent(channelId, eventData) {
    await gachaVC.updateOne(
        { channelId: channelId },
        {
            $set: {
                'gameData.specialEvent': eventData
            }
        }
    );
}

// Atomic special event cleanup
async function clearSpecialEvent(channelId) {
    await gachaVC.updateOne(
        { channelId: channelId },
        {
            $unset: {
                'gameData.specialEvent': 1
            }
        }
    );
}

// Atomic time updates
async function updateTimers(channelId, nextTrigger, nextShopRefresh) {
    const updateFields = {};
    if (nextTrigger) updateFields.nextTrigger = nextTrigger;
    if (nextShopRefresh) updateFields.nextShopRefresh = nextShopRefresh;
    
    await gachaVC.updateOne(
        { channelId: channelId },
        { $set: updateFields }
    );
}

// ---------------- Game Data Helpers ----------------
function initializeGameData(dbEntry) {
    if (!dbEntry.gameData || dbEntry.gameData.gamemode !== 'mining') {
        dbEntry.gameData = {
            gamemode: 'mining',
            minecart: {
                items: {}, // itemId -> { quantity, contributors: { playerId -> amount } }
                contributors: {} // playerId -> totalItemsContributed (for participation tracking)
            },
            sessionStart: new Date(),
            breakCount: 0 // Track number of breaks for long break timing
        };
        // CRITICAL FIX: Mark as modified for Mongoose
        dbEntry.markModified('gameData');
    }
    
    // Ensure minecart structure exists
    if (!dbEntry.gameData.minecart) {
        dbEntry.gameData.minecart = {
            items: {},
            contributors: {}
        };
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.minecart.items) {
        dbEntry.gameData.minecart.items = {};
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.minecart.contributors) {
        dbEntry.gameData.minecart.contributors = {};
        dbEntry.markModified('gameData');
    }
}

// ---------------- Helper function to get minecart summary ----------------
function getMinecartSummary(dbEntry) {
    const minecart = dbEntry.gameData?.minecart;
    if (!minecart || !minecart.items) return { totalValue: 0, itemCount: 0, summary: "Empty minecart" };
    
    let totalValue = 0;
    let totalItems = 0;
    const itemSummaries = [];
    
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        const poolItem = miningItemPool.find(item => item.itemId === itemId);
        if (poolItem && itemData.quantity > 0) {
            const itemValue = poolItem.value * itemData.quantity;
            totalValue += itemValue;
            totalItems += itemData.quantity;
            itemSummaries.push(`${poolItem.name} x${itemData.quantity}`);
        }
    }
    
    return {
        totalValue,
        itemCount: totalItems,
        summary: itemSummaries.length > 0 ? itemSummaries.join(', ') : "Empty minecart"
    };
}

// ---------------- Event Log System ----------------
async function logEvent(channel, eventText) {
    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const logEntry = `[${timestamp}] ${eventText}`;

    const result = await gachaVC.findOne({ channelId: channel.id });
    const minecartSummary = getMinecartSummary(result);

    // calculates minutes until next break / shop refresh here.
    const now = new Date();
    const nextRefreshTime = result.nextShopRefresh;

    let diffMs = nextRefreshTime - now;
    if (diffMs < 0) diffMs = 0;

    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // generate mine image.
    const buffer = await generateVoiceChannelImage(channel);
    const attachment = new AttachmentBuilder(buffer, { name: 'mine.png' });

    try {
        // Fetch last 5 messages to look for existing EVENT LOG
        const messages = await channel.messages.fetch({ limit: 5 });
        let eventLogMessage = null;

        for (const [, message] of messages) {
            if (message.embeds.length > 0 && 
                message.embeds[0].title === 'EVENT LOG' && 
                message.author.bot) {
                eventLogMessage = message;
                break;
            }
        }

        if (eventLogMessage) {
            const existingEmbed = eventLogMessage.embeds[0];
            let currentDescription = existingEmbed.description || '';
            
            // Remove code block markers if present
            currentDescription = currentDescription.replace(/^```\n?|```$/g, '');
            
            // Prepare new lines
            const lines = currentDescription.split('\n').filter(line => line.trim());
            if (lines.length >= 20) {
                lines.shift();
            }
            lines.push(logEntry);

            const newDescription = '```\n' + lines.join('\n') + '\n```';
            // ✅ If it would exceed ~3000 chars, create NEW embed instead of editing
            if (newDescription.length > 3000) {
                const embed = new EmbedBuilder()
                    .setTitle('EVENT LOG')
                    .setDescription('```\n' + logEntry + '\n```')
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART: ${minecartSummary.summary} (${minecartSummary.totalValue} coins)` })
                    .setTimestamp();

                const logMessage = await channel.send({ embeds: [embed], files: [attachment] });
                //registerBotMessage(logMessage.guild.id, logMessage.channel.id, logMessage.id);
            } else {
                // Safe to update existing embed
                const updatedEmbed = new EmbedBuilder()
                    .setTitle('EVENT LOG')
                    .setDescription(newDescription)
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART: ${minecartSummary.summary} ~ NEXT BREAK IN ${diffMinutes} MINUTES` })
                    .setTimestamp();

                await eventLogMessage.edit({ embeds: [updatedEmbed], files: [attachment] });
            }
        } else {
            // Create new event log
            const embed = new EmbedBuilder()
                .setTitle('EVENT LOG')
                .setDescription('```\n' + logEntry + '\n```')
                .setColor(0x8B4513)
                .setFooter({ text: `MINECART: ${minecartSummary.summary} ~ NEXT BREAK IN ${diffMinutes} MINUTES` })
                .setTimestamp();

            const logMessage = await channel.send({ embeds: [embed], files: [attachment] });
            //registerBotMessage(logMessage.guild.id, logMessage.channel.id, logMessage.id);
        }
    } catch (error) {
        console.error('Error updating event log:', error);
        await channel.send(`\`${logEntry}\``);
    }
}

// ---------------- Event Functions ----------------
async function nothingHappens(player, channel, playerStats, item, dbEntry) {
    if (!playerStats.mining || playerStats.mining <= 0) {
        // Player has no pickaxe - check for scavenging
        if (Math.random() < 0.15) { // 15% chance to scavenge a mining item
            const scavengedItem = pickWeightedItem(1); // Use power level 1 for scavenging
            await addItemToMinecart(dbEntry, player.id, scavengedItem.itemId, 1);
            await logEvent(channel, `🪓 Scavenged! ${player.displayName} found 『 ${scavengedItem.name} 』x 1 on the floor → Added to minecart!`);
        } else if (Math.random() < 0.10) { // 5% chance to find a pickaxe
            // Give them a rusty pickaxe (assuming itemId "3" is the rusty pickaxe)
            await addToInventory(player, "3", 1);
            await logEvent(channel, `⚡ Lucky find! ${player.displayName} discovered a rusty pickaxe in the rubble!`);
        } else {
            await logEvent(channel, `❌ ${player.displayName} failed to mine anything due to not having a pickaxe...`);
        }
    } else {
        await logEvent(channel, `😐 ${player.displayName} swung at the walls but found nothing.`);
    }
}

async function giveFindResource(player, channel, powerLevel, dbEntry) {
    const item = pickWeightedItem(powerLevel);
    const playerStats = await getPlayerStats(player.id);

    if (playerStats.mining && playerStats.mining > 0) {
        if (Math.random() > 0.95) {
            // Small chance to fail mining
            console.log('mining failed, doing nothing happens');
            return nothingHappens(player, channel, playerStats, item, dbEntry);
        }
        console.log (`${player.displayName} gain resource, their player stat sheet is`)
        console.log (playerStats);
        const quantityFound = 1 + Math.floor(Math.random() * playerStats.mining);
        
        // Use atomic operation instead of modifying dbEntry
        await addItemToMinecart(dbEntry, player.id, item.itemId, quantityFound);
        await logEvent(channel, `⛏️ MINED! ${player.displayName} found 『 ${item.name} 』x ${quantityFound} → Added to minecart!`);
    } else {
        // Player has no pickaxe → delegate to nothingHappens which handles scavenging chance
        console.log('stats too low, nothing happens');
        return nothingHappens(player, channel, playerStats, item, dbEntry);
    }
}

async function pickaxeBreakEvent(player, channel, powerLevel, dbEntry) {
    const playerStats = await getPlayerStats(player.id);
    if (!playerStats.mining || playerStats.mining <= 0) {
        // Player has no pickaxe, but since this is a "break" event, give them a chance to find one
        if (Math.random() < 0.3) { // 30% chance to find a pickaxe during break event
            await addToInventory(player, "3", 1); // Give rusty pickaxe
            await logEvent(channel, `🔧 Breakthrough! ${player.displayName} found a rusty pickaxe while desperately clawing at the rocks!`);
        } else {
            // Fall back to regular scavenging behavior
            return nothingHappens(player, channel, playerStats, null, dbEntry);
        }
        return;
    }

    const inv = await PlayerInventory.findOne({ playerId: player.id });
    if (!inv) return console.log('Cannot find player inventory');

    // Get all items from player inventory with full item data
    const playerItems = inv.items.map(invItem => {
        const itemData = itemSheet.find(item => String(item.id) === String(invItem.itemId));
        return {
            ...itemData,
            invRef: invItem // Reference to the inventory item for quantity management
        };
    }).filter(item => item.id); // Only include items that were found in itemSheet

    // Filter for pickaxe type items
    const miningPickaxes = playerItems.filter(item => item.type === "pickAxe");

    // If no pickaxes, give them a chance to find one since this is a "break" event
    if (miningPickaxes.length === 0) {
        console.log('no pickaxe, break event gives chance to find one');
        if (Math.random() < 0.4) { // 40% chance to find a pickaxe during break event
            await addToInventory(player, "3", 1); // Give rusty pickaxe
            await logEvent(channel, `🔧 Breakthrough! ${player.displayName} found a rusty pickaxe while desperately striking the walls!`);
        } else {
            return nothingHappens(player, channel, playerStats, null, dbEntry);
        }
        return;
    }

    // Find the pickaxe with highest mining power level
    const bestPickaxe = miningPickaxes.reduce((prev, curr) => {
        const prevPower = prev.abilities?.find(ability => ability.name === "mining")?.powerlevel || 0;
        const currPower = curr.abilities?.find(ability => ability.name === "mining")?.powerlevel || 0;
        return currPower > prevPower ? curr : prev;
    });

    // Get the mining power level for break chance calculation
    const miningPowerLevel = bestPickaxe.abilities?.find(ability => ability.name === "mining")?.powerlevel || 1;
    
    // Calculate break chance (higher power level = lower break chance)
    const breakChance = Math.max(0.05, 0.5 - (miningPowerLevel * 0.05));

    if (Math.random() < breakChance) {
        await removeFromInventory(inv, bestPickaxe.invRef, 1);
        await logEvent(channel, `💥 ${player.displayName}'s 『 ${bestPickaxe.name} 』 shattered into pieces!`);
    } else {
        await logEvent(channel, `⚡️ ${player.displayName} heard their 『 ${bestPickaxe.name} 』 creak... but it held together!`);
    }
}

// ---------------- Mining Session Summary & Minecart Sale ----------------
async function createMiningSummary(channel, dbEntry) {
    const gameData = dbEntry.gameData;
    if (!gameData || gameData.gamemode !== 'mining') return;

    const minecart = gameData.minecart;
    if (!minecart || !minecart.items) {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription('The minecart is empty. No items to sell! Shop is now available!')
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    // Calculate total value and create item breakdown
    let totalValue = 0;
    let totalItems = 0;
    const itemBreakdown = [];
    const contributorRewards = {};

    // Process each item type in the minecart
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        const poolItem = miningItemPool.find(item => item.itemId === itemId);
        if (!poolItem || itemData.quantity <= 0) continue;

        const itemTotalValue = poolItem.value * itemData.quantity;
        totalValue += itemTotalValue;
        totalItems += itemData.quantity;
        itemBreakdown.push(`${poolItem.name} x${itemData.quantity} = ${itemTotalValue} coins`);

        // Calculate rewards for contributors of this specific item
        const contributorCount = Object.keys(itemData.contributors || {}).length;
        if (contributorCount > 0) {
            const coinsPerContributor = Math.floor(itemTotalValue / contributorCount);
            
            for (const [playerId, contributed] of Object.entries(itemData.contributors)) {
                if (!contributorRewards[playerId]) {
                    contributorRewards[playerId] = { coins: 0, items: [] };
                }
                contributorRewards[playerId].coins += coinsPerContributor;
                contributorRewards[playerId].items.push(`${poolItem.name} x${contributed}`);
            }
        }
    }

    if (totalItems === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription('The minecart is empty. No items to sell! Shop is now available!')
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    // Reward each contributor using atomic operations
    const contributorLines = [];
for (const [playerId, reward] of Object.entries(contributorRewards)) {
    try {
        const member = await channel.guild.members.fetch(playerId);
        
        // Fixed atomic currency update - handle the case where money field doesn't exist
        let userCurrency = await Currency.findOne({ userId: playerId });
        
        if (!userCurrency) {
            // Create new currency document if it doesn't exist
            userCurrency = await Currency.create({
                userId: playerId,
                money: reward.coins
            });
        } else {
            // Update existing document safely
            userCurrency.money = (userCurrency.money || 0) + reward.coins;
            await userCurrency.save();
        }
        
        contributorLines.push(`${member.displayName}: ${reward.items.join(', ')} → ${reward.coins} coins`);
    } catch (error) {
        console.error(`Error rewarding player ${playerId}:`, error);
        // Continue processing other players even if one fails
    }
}

    const embed = new EmbedBuilder()
        .setTitle('🛒 Mining Session Complete')
        .setDescription(`The minecart has been sold to the shop!\n\n**Items Sold:**\n${itemBreakdown.join('\n')}\n\n**Total Value:** ${totalValue} coins`)
        .addFields({
            name: 'Contributors & Rewards',
            value: contributorLines.join('\n') || 'None',
            inline: false
        })
        .setColor(0xFFD700)
        .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Atomic minecart reset
    await resetMinecart(channel.id);
}

// ---------------- Long Break Events ----------------
async function startThiefGame(channel, dbEntry) {
    if (!channel?.isVoiceBased()) return;

    const guild = channel.guild;
    const humansArray = guild.members.cache
        .filter(member => member.voice.channelId === channel.id && !member.user.bot)
        .map(member => member);

    if (humansArray.length < 3) {
        await logEvent(channel, '⚠️ Not enough players for special event. Extending break...');
        return;
    }

    const thief = humansArray[Math.floor(Math.random() * humansArray.length)];
    let stealAmount = 0;
    const lossDescriptions = [];

    for (const user of humansArray) {
        let userMoney = await Currency.findOne({ userId: user.id });

        if (!userMoney) {
            userMoney = await Currency.create({
                userId: user.id,
                usertag: user.user.tag,
                money: 0
            });
        }

        if (userMoney.money > 0) {
            const percentToSteal = Math.floor(Math.random() * 10) + 10;
            const stolen = Math.floor((percentToSteal / 100) * userMoney.money);

            userMoney.money -= stolen;
            stealAmount += stolen;
            await userMoney.save();

            lossDescriptions.push(`${user.user.username} lost ${stolen} coins`);
        }
    }

    // Store thief info using atomic operation
    await setSpecialEvent(channel.id, {
        type: 'thief',
        thiefId: thief.id,
        amount: stealAmount,
        endTime: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
    });

    // Create vote entries for each user
    const Vote = require('../../models/votes');
    for (const user of humansArray) {
        await Vote.create({
            channelId: channel.id,
            userId: user.id,
            targetId: 'novote'
        });
    }

    // Build the public embed
    const embed = new EmbedBuilder()
        .setTitle('⚠️ THIEF ALERT! ⚠️')
        .setDescription(`In the darkness of the mines, someone has stolen everyone's coins! Use /vote to catch the thief.\n\n` +
                        lossDescriptions.join('\n') +
                        `\n\n💰 Total stolen: ${stealAmount}`)
        .setColor(0xff0000)
        .setTimestamp();

    const endTimeSeconds = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
    embed.addFields({ name: 'Hurry!', value: `The thief is getting away... <t:${endTimeSeconds}:R>` });

    await channel.send({ embeds: [embed] });
    await logEvent(channel, `⚠️ SPECIAL EVENT: Thief game started! ${stealAmount} coins stolen.`);

    // DM the thief
    try {
        await thief.send(`You are the thief! You stole a total of ${stealAmount} coins. Be careful not to get caught!`);
    } catch {
        console.log(`Could not DM thief: ${thief.user.tag}`);
    }
}

async function endThiefGame(channel, dbEntry) {
    if (!dbEntry.gameData?.specialEvent || dbEntry.gameData.specialEvent.type !== 'thief') return;

    const { thiefId, amount: totalStolen } = dbEntry.gameData.specialEvent;
    const Vote = require('../../models/votes');
    const Canvas = require('canvas');
    const fs = require('fs');

    // Fetch all votes for this channel
    const votes = await Vote.find({ channelId: channel.id });

    const embed = new EmbedBuilder()
        .setTitle('🕵️ Thief Game Results')
        .setTimestamp();

    let winners = []
    let jailImageAttachment = null; // Declare at the top level

    if (!votes.length) {
        embed.setDescription('No votes were cast this round.');
    } else {
        const voteLines = [];

        // Announce each user's vote
        for (const vote of votes) {
            const user = await channel.guild.members.fetch(vote.userId).catch(() => null);
            const target = await channel.guild.members.fetch(vote.targetId).catch(() => null);
            if (user) {
                voteLines.push(`${user.user.username} voted for ${target ? target.user.username : 'no one'}`);
            }
        }

        embed.addFields({ name: 'Votes', value: voteLines.join('\n') || 'No votes recorded' });

        // Find all users who guessed correctly
        winners = votes.filter(v => v.targetId === thiefId);
        const totalPlayers = votes.length;

        // Generate jail bars image if thief was caught
        if (winners.length > 0) {
            try {
                const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
                if (thiefMember) {
                    // Create canvas
                    const canvas = Canvas.createCanvas(256, 256);
                    const ctx = canvas.getContext('2d');

                    // Load thief's avatar
                    const avatarUrl = thiefMember.user.displayAvatarURL({ format: 'png', size: 256 });
                    const avatar = await Canvas.loadImage(avatarUrl);
                    
                    // Draw avatar
                    ctx.drawImage(avatar, 0, 0, 256, 256);

                    // Load and draw jail bars (assuming jailbars.png exists in the project)
                    try {
                        const jailBars = await Canvas.loadImage('../../assets/jailbars.png');
                        ctx.drawImage(jailBars, 0, 0, 256, 256);
                    } catch (error) {
                        console.warn('jailbars.png not found, drawing simple bars instead');
                        // Draw simple jail bars if image not found
                        ctx.strokeStyle = '#444444';
                        ctx.lineWidth = 8;
                        for (let i = 0; i < 6; i++) {
                            const x = (i + 1) * (256 / 7);
                            ctx.beginPath();
                            ctx.moveTo(x, 0);
                            ctx.lineTo(x, 256);
                            ctx.stroke();
                        }
                        // Horizontal bars
                        for (let i = 0; i < 4; i++) {
                            const y = (i + 1) * (256 / 5);
                            ctx.beginPath();
                            ctx.moveTo(0, y);
                            ctx.lineTo(256, y);
                            ctx.stroke();
                        }
                    }

                    // Create attachment
                    const buffer = canvas.toBuffer('image/png');
                    jailImageAttachment = new AttachmentBuilder(buffer, { name: 'thief_jailed.png' });
                    embed.setImage('attachment://thief_jailed.png');
                }
            } catch (error) {
                console.error('Error creating jail image:', error);
            }
        }

        if (winners.length > 0 && winners.length < totalPlayers) {
            // Some players guessed correctly but not everyone - thief gets a share too
            embed.setColor(0xFFFF00); // Yellow for partial success
            const totalRecipients = winners.length + 1; // winners + thief
            const share = Math.floor(totalStolen / totalRecipients);
            const winnerLines = [];

            // Reward the winners
            for (const winner of winners) {
                let winnerMoney = await Currency.findOne({ userId: winner.userId });
                if (!winnerMoney) {
                    const member = await channel.guild.members.fetch(winner.userId).catch(() => null);
                    winnerMoney = await Currency.create({
                        userId: winner.userId,
                        usertag: member ? member.user.tag : 'Unknown',
                        money: 0
                    });
                }

                winnerMoney.money += share;
                await winnerMoney.save();

                winnerLines.push(`<@${winner.userId}> receives ${share} coins!`);
            }

            // Reward the thief
            let thiefMoney = await Currency.findOne({ userId: thiefId });
            if (!thiefMoney) {
                const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
                thiefMoney = await Currency.create({
                    userId: thiefId,
                    usertag: thiefMember ? thiefMember.user.tag : 'Unknown',
                    money: 0
                });
            }

            thiefMoney.money += share;
            await thiefMoney.save();

            embed.addFields(
                { name: 'Winners', value: winnerLines.join('\n') },
                { name: 'Thief Reward', value: `<@${thiefId}> keeps ${share} coins for evading some suspicion!` },
                { name: 'Total Stolen', value: `${totalStolen} coins` }
            );
            embed.setTitle('📰 THIEF CAUGHT (Partial Success)');
            await logEvent(channel, `📰 Thief partially caught! ${winners.length} player(s) win ${share} coins each, thief keeps ${share} coins.`);
            
        } else if (winners.length === totalPlayers) {
            // Everyone guessed correctly - thief gets nothing
            embed.setColor(0x00FF00); // Green for complete success
            const share = Math.floor(totalStolen / winners.length);
            const winnerLines = [];

            for (const winner of winners) {
                let winnerMoney = await Currency.findOne({ userId: winner.userId });
                if (!winnerMoney) {
                    const member = await channel.guild.members.fetch(winner.userId).catch(() => null);
                    winnerMoney = await Currency.create({
                        userId: winner.userId,
                        usertag: member ? member.user.tag : 'Unknown',
                        money: 0
                    });
                }

                winnerMoney.money += share;
                await winnerMoney.save();

                winnerLines.push(`<@${winner.userId}> receives ${share} coins!`);
            }

            embed.addFields(
                { name: 'Winners', value: winnerLines.join('\n') },
                { name: 'Total Stolen', value: `${totalStolen} coins` }
            );
            embed.setTitle('📰 THIEF CAUGHT (Complete Success)');
            await logEvent(channel, `📰 Thief completely caught! Everyone guessed correctly. ${winners.length} player(s) win ${share} coins each.`);
            
        } else {
            // No one guessed correctly - thief keeps everything
            embed.setColor(0xFF0000); // Red for thief escape
            embed.addFields({ name: 'Result', value: `No one guessed correctly. The thief got away with ${totalStolen} coins.` });
            await logEvent(channel, `🏃‍♂️ Thief escaped with ${totalStolen} coins! No one guessed correctly.`);
        }
    }

    // Announce the thief
    const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
    if (thiefMember) {
        embed.addFields({ name: 'The Thief', value: `<@${thiefId}>` });
    }

    // Send the message with optional jail image attachment
    const messageOptions = { embeds: [embed] };
    if (jailImageAttachment) {
        messageOptions.files = [jailImageAttachment];
    }
    await channel.send(messageOptions);

    // Clear votes and special event data
    await Vote.deleteMany({ channelId: channel.id });
    await clearSpecialEvent(channel.id);
}

// ---------------- Long Break Event System ----------------
const longBreakEvents = [
    { func: startThiefGame, weight: 100 }
    // More special events can be added here later
];

function pickLongBreakEvent(events) {
    const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * totalWeight;
    return events.find(e => (rand -= e.weight) < 0)?.func || events[0].func;
}

// ---------------- Main Mining Event ----------------
const miningEvents = [
    { func: giveFindResource, weight: 70 },
    { func: pickaxeBreakEvent, weight: 30 }
    //{ func: nothingHappens, weight: 10 }
];

module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();
    
    // Initialize game data
    initializeGameData(dbEntry);
    
    // Initialize break counters if not present
    if (!dbEntry.gameData.breakCount) {
        dbEntry.gameData.breakCount = 0;
        dbEntry.markModified('gameData');
    }

    // Save initial setup only once
    await dbEntry.save();

    if (!channel?.isVoiceBased()) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (!humans.size) return;

    // Check if special event is running and needs to end
    if (dbEntry.gameData.specialEvent && now > dbEntry.gameData.specialEvent.endTime) {
        await endThiefGame(channel, dbEntry);
        
        // Atomic timer update
        await updateTimers(channel.id, new Date(now + 5 * 60 * 1000), null);
        await generateShop(channel, 5);
        await logEvent(channel, '🛒 Special event concluded! Shop open for 5 minutes before mining resumes.');
        return;
    }

    // Don't run mining events if special event is active
    if (dbEntry.gameData.specialEvent) {
        return;
    }

    const powerLevel = json.power || 1;
    const timesToRun = Math.floor(Math.random() * humans.size) + 1;

    // Run mining events (these now use atomic operations internally)
    for (let i = 0; i < timesToRun; i++) {
        const winner = humans.random();
        await pickEvent(miningEvents)(winner, channel, powerLevel, dbEntry);
    }

    // Check if it's time for a break (every 25 minutes)
    if (now > dbEntry.nextShopRefresh) {
        // Atomic break count increment
        const breakCount = await incrementBreakCount(channel.id);
        
        // Every 4th break (2 hours) is a long break with special event
        if (breakCount % 4 === 0) {
            // Long break: 10min special event + 5min shop = 15min total
            // Refresh dbEntry to get latest minecart data for summary
            console.log ('running Long Break');
            const refreshedEntry = await gachaVC.findOne({ channelId: channel.id });
            await createMiningSummary(channel, refreshedEntry);
            await pickLongBreakEvent(longBreakEvents)(channel, refreshedEntry);
            
            await updateTimers(channel.id, null, new Date(now + 30 * 60 * 1000));
            await logEvent(channel, '🎭 LONG BREAK: Special event starting! (10min event + 5min shop)');
        } else {
            // Regular break: 5min shop break
            // Refresh dbEntry to get latest minecart data for summary
            const refreshedEntry = await gachaVC.findOne({ channelId: channel.id });
            await createMiningSummary(channel, refreshedEntry);
            await generateShop(channel, 5);
            
            await updateTimers(
                channel.id, 
                new Date(now + 5 * 60 * 1000), 
                new Date(now + 30 * 60 * 1000)
            );
            await logEvent(channel, '🛑 SHORT BREAK: Mining paused for 5 minutes. Shop is now open!');
        }
    }

    // No need to save dbEntry anymore - all updates are atomic
};