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

// ---------------- Item Pool for findResource ----------------
const itemPool = [
    { itemId: "1", name: "Coal Ore", baseWeight: 50, boostedPowerLevel: 1 },
    { itemId: "2", name: "Topaz Gem", baseWeight: 20, boostedPowerLevel: 2 },
    { itemId: "6", name: "Diamond Gem", baseWeight: 3000, boostedPowerLevel: 3 },
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

// ---------------- Game Data Helpers ----------------
function initializeGameData(dbEntry) {
    if (!dbEntry.gameData || dbEntry.gameData.gamemode !== 'mining') {
        dbEntry.gameData = {
            gamemode: 'mining',
            minecart: {
                totalCoal: 0,
                contributors: {} // playerId -> contributedCoal (plain object, not Map)
            },
            sessionStart: new Date(),
            breakCount: 0 // Track number of breaks for long break timing
        };
        // CRITICAL FIX: Mark as modified for Mongoose
        dbEntry.markModified('gameData');
    }
}

function addCoalToMinecart(dbEntry, playerId, amount) {
    // Ensure gameData structure exists
    if (!dbEntry.gameData) {
        dbEntry.gameData = {
            gamemode: 'mining',
            minecart: { totalCoal: 0, contributors: {} },
            sessionStart: new Date(),
            breakCount: 0
        };
    }
    
    if (!dbEntry.gameData.minecart) {
        dbEntry.gameData.minecart = { totalCoal: 0, contributors: {} };
    }
    
    if (!dbEntry.gameData.minecart.contributors) {
        dbEntry.gameData.minecart.contributors = {};
    }
    
    dbEntry.gameData.minecart.totalCoal += amount;
    const currentContribution = dbEntry.gameData.minecart.contributors[playerId] || 0;
    dbEntry.gameData.minecart.contributors[playerId] = currentContribution + amount;
    
    // CRITICAL FIX: Mark as modified for Mongoose
    dbEntry.markModified('gameData');
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
    const totalCoal = result.gameData.minecart.totalCoal;

    // calculates minutes until next break / shop refresh here.

    const now = new Date();
    const nextRefreshTime = result.nextShopRefresh;

    let diffMs = nextRefreshTime - now;
    if (diffMs < 0) diffMs = 0;

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);

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
                    .setFooter({ text: `MINECART : ${totalCoal} Coal` })
                    .setTimestamp();

                const logMessage = await channel.send({ embeds: [embed], files: [attachment] });
                //registerBotMessage(logMessage.guild.id, logMessage.channel.id, logMessage.id);
            } else {
                // Safe to update existing embed
                const updatedEmbed = new EmbedBuilder()
                    .setTitle('EVENT LOG')
                    .setDescription(newDescription)
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART : ${totalCoal} Coal ~ NEXT BREAK IN ${diffMinutes} MINUTES` })
                    .setTimestamp();

                await eventLogMessage.edit({ embeds: [updatedEmbed], files: [attachment] });
            }
        } else {
            // Create new event log
            const embed = new EmbedBuilder()
                .setTitle('EVENT LOG')
                .setDescription('```\n' + logEntry + '\n```')
                .setColor(0x8B4513)
                .setFooter({ text: `MINECART : ${totalCoal} Coal ~ NEXT BREAK IN ${diffMinutes} MINUTES` })
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
async function nothingHappens(player, channel, playerStats, item) {
    if (!playerStats.mining || playerStats.mining <= 0) {
        console.log(item);
        if (Math.random() < 0.3) { // 30% chance to scavenge
            await logEvent(channel, `🪓 Scavenged! ${player.displayName} found 『 ${item.name} 』x 1 on the floor...!`);
            await addToInventory(player, item.itemId, 1);
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

            console.log ('mining failed, doing nothing happens');
            return nothingHappens(player, channel, playerStats, item);
        }
        
        const quantityFound = 1 + Math.floor(Math.random() * playerStats.mining);
        
        if (item.itemId === "1") { // Coal goes to shared minecart
            addCoalToMinecart(dbEntry, player.id, quantityFound);
            await logEvent(channel, `⛏️ MINED! ${player.displayName} found 『 ${item.name} 』x ${quantityFound} → Added to minecart!`);
        } else {
            // Other items go to personal inventory
            await addToInventory(player, item.itemId, quantityFound);
            await logEvent(channel, `⛏️ MINED! ${player.displayName} found 『 ${item.name} 』x ${quantityFound}!`);
        }
    } else {
        // Player has no pickaxe → delegate to nothingHappens which handles scavenging chance
        console.log ('stats too low, nothing happens');
        return nothingHappens(player, channel, playerStats, item);
    }
}

async function pickaxeBreakEvent(player, channel, powerLevel, dbEntry) {
    const playerStats = await getPlayerStats(player.id);
    if (!playerStats.mining || playerStats.mining <= 0) return giveFindResource(player, channel, powerLevel, dbEntry);

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

    // Get rusty pickaxe data for fallback
    const rustyPickaxe = itemSheet.find(item => item.id === '3');

    // If no pickaxes, do nothingHappens with rusty pickaxe
    if (miningPickaxes.length === 0) {
        console.log('no pickaxe, nothing happens but may find pickaxe');
        return nothingHappens(player, channel, playerStats, rustyPickaxe);
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

// ---------------- Mining Session Summary ----------------
async function createMiningSummary(channel, dbEntry) {
    const gameData = dbEntry.gameData;
    if (!gameData || gameData.gamemode !== 'mining') return;

    const totalCoal = gameData.minecart.totalCoal || 0;
    const contributors = gameData.minecart.contributors || {};
    const contributorCount = Object.keys(contributors).length;

    if (totalCoal === 0 || contributorCount === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription('No coal was mined this session. Shop is now available!')
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    // Convert coal to coins (assuming 2 coins per coal)
    const coinsPerCoal = 2;
    const totalCoins = totalCoal * coinsPerCoal;
    const coinsPerPlayer = Math.floor(totalCoins / contributorCount);

    // Reward each contributor
    const contributorLines = [];
    for (const [playerId, coalContributed] of Object.entries(contributors)) {
        try {
            const member = await channel.guild.members.fetch(playerId);
            let currency = await Currency.findOne({ userId: playerId });
            
            if (!currency) {
                currency = new Currency({ userId: playerId, money: 0 });
            }
            
            currency.money += coinsPerPlayer;
            await currency.save();
            
            contributorLines.push(`${member.displayName}: ${coalContributed} coal → ${coinsPerPlayer} coins`);
        } catch (error) {
            console.error(`Error rewarding player ${playerId}:`, error);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🛒 Mining Session Complete')
        .setDescription(`The minecart has been sold to the shop!\n\n**Total Coal Mined:** ${totalCoal}\n**Total Value:** ${totalCoins} coins\n**Split ${contributorCount} ways:** ${coinsPerPlayer} coins each`)
        .addFields({
            name: 'Contributors',
            value: contributorLines.join('\n') || 'None',
            inline: false
        })
        .setColor(0xFFD700) // Gold color
        .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Reset the minecart for next session
    gameData.minecart = {
        totalCoal: 0,
        contributors: {}
    };
    gameData.sessionStart = new Date();
    
    // CRITICAL FIX: Mark as modified
    dbEntry.markModified('gameData');
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

    // Store thief info in gameData
    dbEntry.gameData = {
        ...dbEntry.gameData,
        specialEvent: {
            type: 'thief',
            thiefId: thief.id,
            amount: stealAmount,
            endTime: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
        }
    };
    // CRITICAL FIX: Mark as modified
    dbEntry.markModified('gameData');

    // Create vote entries for each user
    const Vote = require('../../models/votes');
    for (const user of humansArray) {
        await Vote.create({
            channelId: dbEntry.channelId,
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

    const endTimeSeconds = Math.floor(dbEntry.gameData.specialEvent.endTime.getTime() / 1000);
    embed.addFields({ name: 'Hurry!', value: `The thief is getting away... <t:${endTimeSeconds}:R>` });

    await channel.send({ embeds: [embed] });
    await logEvent(channel, `⚠️ SPECIAL EVENT: Thief game started! ${stealAmount} coins stolen.`);

    // DM the thief
    try {
        await thief.send(`You are the thief! You stole a total of ${stealAmount} coins. Be careful not to get caught!`);
    } catch {
        console.log(`Could not DM thief: ${thief.user.tag}`);
        // Could add fallback channel notification here if needed
    }
}

async function endThiefGame(channel, dbEntry) {
    if (!dbEntry.gameData?.specialEvent || dbEntry.gameData.specialEvent.type !== 'thief') return;

    const { thiefId, amount: totalStolen } = dbEntry.gameData.specialEvent;
    const Vote = require('../../models/votes');

    // Fetch all votes for this channel
    const votes = await Vote.find({ channelId: dbEntry.channelId });

    const embed = new EmbedBuilder()
        .setTitle('🕵️ Thief Game Results')
        .setColor(0x00ff00)
        .setTimestamp();

    let winners = []

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

        if (winners.length) {
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
            embed.setTitle('📰 THIEF CAUGHT');
            await logEvent(channel, `📰 Thief caught! ${winners.length} player(s) win ${Math.floor(totalStolen / winners.length)} coins each.`);
        } else {
            embed.addFields({ name: 'Result', value: `No one guessed correctly. The thief got away with ${totalStolen} coins.` });
            await logEvent(channel, `🏃‍♂️ Thief escaped with ${totalStolen} coins! No one guessed correctly.`);
        }
    }

    // Announce the thief
    const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
    if (thiefMember) {
        embed.addFields({ name: 'The Thief', value: `<@${thiefId}>` });
    }

    await channel.send({ embeds: [embed] });

    // Clear votes and special event data
    await Vote.deleteMany({ channelId: dbEntry.channelId });
    delete dbEntry.gameData.specialEvent;
    // CRITICAL FIX: Mark as modified
    dbEntry.markModified('gameData');
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
        //dbEntry.nextShopRefresh = Date.now() + (25 * 60 * 1000);
    }

    // CRITICAL FIX: Save immediately after initialization
    await dbEntry.save();

    if (!channel?.isVoiceBased()) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (!humans.size) return;

    // Check if special event is running and needs to end
    if (dbEntry.gameData.specialEvent && now > dbEntry.gameData.specialEvent.endTime) {
        await endThiefGame(channel, dbEntry);
        
        // Start 5-minute shop break after special event
        dbEntry.nextTrigger = new Date(now + 5 * 60 * 1000); // 5 minutes
        await generateShop(channel, 5);
        await logEvent(channel, '🛒 Special event concluded! Shop open for 5 minutes before mining resumes.');
        await dbEntry.save();
        return;
    }

    // Don't run mining events if special event is active
    if (dbEntry.gameData.specialEvent) {
        await dbEntry.save();
        return;
    }

    const powerLevel = json.power || 1;
    const timesToRun = Math.floor(Math.random() * humans.size) + 1;

    // Run mining events
    for (let i = 0; i < timesToRun; i++) {
        const winner = humans.random();
        await pickEvent(miningEvents)(winner, channel, powerLevel, dbEntry);
    }

    // Check if it's time for a break (every 25 minutes)
    if (now > dbEntry.nextShopRefresh) {
        dbEntry.gameData.breakCount++;
        dbEntry.markModified('gameData');
        
        // Every 4th break (2 hours) is a long break with special event
        if (dbEntry.gameData.breakCount % 4 === 0) {
            // Long break: 10min special event + 5min shop = 15min total
            await createMiningSummary(channel, dbEntry);
            await pickLongBreakEvent(longBreakEvents)(channel, dbEntry);
            
            dbEntry.nextShopRefresh = new Date(now + 25 * 60 * 1000); // Next regular break in 25 mins
            await logEvent(channel, '🎭 LONG BREAK: Special event starting! (10min event + 5min shop)');
        } else {
            // Regular break: 5min shop break
            await createMiningSummary(channel, dbEntry);
            await generateShop(channel, 5);
            
            dbEntry.nextTrigger = new Date(now + 5 * 60 * 1000); // 5 minute pause
            dbEntry.nextShopRefresh = new Date(now + 25 * 60 * 1000); // Next break in 25 mins
            await logEvent(channel, '🛑 SHORT BREAK: Mining paused for 5 minutes. Shop is now open!');
        }
    }

    // CRITICAL FIX: Always save at the end
    await dbEntry.save();
};