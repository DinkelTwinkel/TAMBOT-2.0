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
    { itemId: "1", name: "Coal Ore", baseWeight: 50, boostedPowerLevel: 1, pricePerItem: 2 },
    { itemId: "2", name: "Topaz Gem", baseWeight: 20, boostedPowerLevel: 2, pricePerItem: 5 },
    { itemId: "3", name: "Diamond Gem", baseWeight: 1, boostedPowerLevel: 3, pricePerItem: 10 },
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

// ---------------- Helper Functions ----------------
function getBoostedItem(powerLevel) {
    return itemPool.find(item => item.boostedPowerLevel === powerLevel) || itemPool[0];
}

function getItemProperty(itemId) {
    // Map itemId to property names
    const propertyMap = {
        "1": "coal",
        "2": "topaz", 
        "3": "diamond"
    };
    return propertyMap[itemId] || "ore";
}

function getMinecartKey(powerLevel) {
    const boostedItem = getBoostedItem(powerLevel);
    return `total${getItemProperty(boostedItem.itemId).charAt(0).toUpperCase()}${getItemProperty(boostedItem.itemId).slice(1)}`;
}

function getMinecartName(powerLevel) {
    const boostedItem = getBoostedItem(powerLevel);
    return boostedItem.name;
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
                totalTopaz: 0,
                totalDiamond: 0,
                contributors: {} // playerId -> { coal: 0, topaz: 0, diamond: 0 }
            },
            sessionStart: new Date(),
            breakCount: 0
        };
        dbEntry.markModified('gameData');
    }
}

function addOreToMinecart(dbEntry, playerId, itemId, amount, powerLevel) {
    // Ensure gameData structure exists
    if (!dbEntry.gameData) {
        dbEntry.gameData = {
            gamemode: 'mining',
            minecart: { totalCoal: 0, totalTopaz: 0, totalDiamond: 0, contributors: {} },
            sessionStart: new Date(),
            breakCount: 0
        };
    }
    
    if (!dbEntry.gameData.minecart) {
        dbEntry.gameData.minecart = { totalCoal: 0, totalTopaz: 0, totalDiamond: 0, contributors: {} };
    }
    
    if (!dbEntry.gameData.minecart.contributors) {
        dbEntry.gameData.minecart.contributors = {};
    }

    // Initialize player contribution if not exists
    if (!dbEntry.gameData.minecart.contributors[playerId]) {
        dbEntry.gameData.minecart.contributors[playerId] = { coal: 0, topaz: 0, diamond: 0 };
    }
    
    // Add to appropriate totals based on itemId
    const itemProperty = getItemProperty(itemId);
    const totalProperty = `total${itemProperty.charAt(0).toUpperCase()}${itemProperty.slice(1)}`;
    
    dbEntry.gameData.minecart[totalProperty] += amount;
    dbEntry.gameData.minecart.contributors[playerId][itemProperty] += amount;
    
    dbEntry.markModified('gameData');
}

// ---------------- Event Log System ----------------
async function logEvent(channel, eventText, powerLevel = 1) {
    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const logEntry = `[${timestamp}] ${eventText}`;

    const result = await gachaVC.findOne({ channelId: channel.id });
    
    // Get total of the boosted ore type
    const minecartKey = getMinecartKey(powerLevel);
    const totalOre = result.gameData.minecart[minecartKey] || 0;
    const oreName = getMinecartName(powerLevel);

    const now = new Date();
    const nextRefreshTime = result.nextShopRefresh;

    let diffMs = nextRefreshTime - now;
    if (diffMs < 0) diffMs = 0;

    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    const buffer = await generateVoiceChannelImage(channel);
    const attachment = new AttachmentBuilder(buffer, { name: 'mine.png' });

    try {
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
            
            currentDescription = currentDescription.replace(/^```\n?|```$/g, '');
            
            const lines = currentDescription.split('\n').filter(line => line.trim());
            if (lines.length >= 20) {
                lines.shift();
            }
            lines.push(logEntry);

            const newDescription = '```\n' + lines.join('\n') + '\n```';
            
            if (newDescription.length > 3000) {
                const embed = new EmbedBuilder()
                    .setTitle('EVENT LOG')
                    .setDescription('```\n' + logEntry + '\n```')
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART : ${totalOre} ${oreName}` })
                    .setTimestamp();

                const logMessage = await channel.send({ embeds: [embed], files: [attachment] });
            } else {
                const updatedEmbed = new EmbedBuilder()
                    .setTitle('EVENT LOG')
                    .setDescription(newDescription)
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART : ${totalOre} ${oreName} ~ NEXT BREAK IN ${diffMinutes} MINUTES` })
                    .setTimestamp();

                await eventLogMessage.edit({ embeds: [updatedEmbed], files: [attachment] });
            }
        } else {
            const embed = new EmbedBuilder()
                .setTitle('EVENT LOG')
                .setDescription('```\n' + logEntry + '\n```')
                .setColor(0x8B4513)
                .setFooter({ text: `MINECART : ${totalOre} ${oreName} ~ NEXT BREAK IN ${diffMinutes} MINUTES` })
                .setTimestamp();

            const logMessage = await channel.send({ embeds: [embed], files: [attachment] });
        }
    } catch (error) {
        console.error('Error updating event log:', error);
        await channel.send(`\`${logEntry}\``);
    }
}

// ---------------- Event Functions ----------------
async function nothingHappens(player, channel, playerStats, item, powerLevel) {
    if (!playerStats.mining || playerStats.mining <= 0) {
        if (Math.random() < 0.3) { // 30% chance to scavenge
            await logEvent(channel, `🪓 Scavenged! ${player.displayName} found 『 ${item.name} 』x 1 on the floor...!`, powerLevel);
            await addToInventory(player, item.itemId, 1);
        } else {
            await logEvent(channel, `❌ ${player.displayName} failed to mine anything due to not having a pickaxe...`, powerLevel);
        }
    } else {
        await logEvent(channel, `😐 ${player.displayName} swung at the walls but found nothing.`, powerLevel);
    }
}

async function giveFindResource(player, channel, powerLevel, dbEntry) {
    const item = pickWeightedItem(powerLevel);
    const playerStats = await getPlayerStats(player.id);
    const boostedItem = getBoostedItem(powerLevel);

    if (playerStats.mining && playerStats.mining > 0) {
        if (Math.random() > 0.95) {
            console.log('mining failed, doing nothing happens');
            return nothingHappens(player, channel, playerStats, item, powerLevel);
        }
        
        const quantityFound = 1 + Math.floor(Math.random() * playerStats.mining);
        
        if (item.itemId === boostedItem.itemId) {
            // Boosted item goes to shared minecart
            addOreToMinecart(dbEntry, player.id, item.itemId, quantityFound, powerLevel);
            await logEvent(channel, `⛏️ MINED! ${player.displayName} found 『 ${item.name} 』x ${quantityFound} → Added to minecart!`, powerLevel);
        } else {
            // Other items go to personal inventory
            await addToInventory(player, item.itemId, quantityFound);
            await logEvent(channel, `⛏️ MINED! ${player.displayName} found 『 ${item.name} 』x ${quantityFound}!`, powerLevel);
        }
    } else {
        console.log('stats too low, nothing happens');
        return nothingHappens(player, channel, playerStats, item, powerLevel);
    }
}

async function pickaxeBreakEvent(player, channel, powerLevel, dbEntry) {
    const playerStats = await getPlayerStats(player.id);
    if (!playerStats.mining || playerStats.mining <= 0) return giveFindResource(player, channel, powerLevel, dbEntry);

    const inv = await PlayerInventory.findOne({ playerId: player.id });
    if (!inv) return console.log('Cannot find player inventory');

    const playerItems = inv.items.map(invItem => {
        const itemData = itemSheet.find(item => String(item.id) === String(invItem.itemId));
        return {
            ...itemData,
            invRef: invItem
        };
    }).filter(item => item.id);

    const miningPickaxes = playerItems.filter(item => item.type === "pickAxe");
    const rustyPickaxe = itemSheet.find(item => item.id === '3');

    if (miningPickaxes.length === 0) {
        console.log('no pickaxe, nothing happens but may find pickaxe');
        return nothingHappens(player, channel, playerStats, rustyPickaxe, powerLevel);
    }

    const bestPickaxe = miningPickaxes.reduce((prev, curr) => {
        const prevPower = prev.abilities?.find(ability => ability.name === "mining")?.powerlevel || 0;
        const currPower = curr.abilities?.find(ability => ability.name === "mining")?.powerlevel || 0;
        return currPower > prevPower ? curr : prev;
    });

    const miningPowerLevel = bestPickaxe.abilities?.find(ability => ability.name === "mining")?.powerlevel || 1;
    const breakChance = Math.max(0.05, 0.5 - (miningPowerLevel * 0.05));

    if (Math.random() < breakChance) {
        await removeFromInventory(inv, bestPickaxe.invRef, 1);
        await logEvent(channel, `💥 ${player.displayName}'s 『 ${bestPickaxe.name} 』 shattered into pieces!`, powerLevel);
    } else {
        await logEvent(channel, `⚡️ ${player.displayName} heard their 『 ${bestPickaxe.name} 』 creak... but it held together!`, powerLevel);
    }
}

// ---------------- Mining Session Summary ----------------
async function createMiningSummary(channel, dbEntry, powerLevel) {
    const gameData = dbEntry.gameData;
    if (!gameData || gameData.gamemode !== 'mining') return;

    const boostedItem = getBoostedItem(powerLevel);
    const minecartKey = getMinecartKey(powerLevel);
    const totalOre = gameData.minecart[minecartKey] || 0;
    const contributors = gameData.minecart.contributors || {};
    const boostedProperty = getItemProperty(boostedItem.itemId);
    
    // Filter contributors who actually contributed the boosted ore type
    const validContributors = Object.entries(contributors).filter(([playerId, contributions]) => {
        return contributions[boostedProperty] > 0;
    });

    if (totalOre === 0 || validContributors.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription(`No ${boostedItem.name.toLowerCase()} was mined this session. Shop is now available!`)
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    const totalCoins = totalOre * boostedItem.pricePerItem;
    const coinsPerPlayer = Math.floor(totalCoins / validContributors.length);

    const contributorLines = [];
    for (const [playerId, contributions] of validContributors) {
        try {
            const member = await channel.guild.members.fetch(playerId);
            let currency = await Currency.findOne({ userId: playerId });
            
            if (!currency) {
                currency = new Currency({ userId: playerId, money: 0 });
            }
            
            currency.money += coinsPerPlayer;
            await currency.save();
            
            const contributedAmount = contributions[boostedProperty];
            contributorLines.push(`${member.displayName}: ${contributedAmount} ${boostedItem.name.toLowerCase()} → ${coinsPerPlayer} coins`);
        } catch (error) {
            console.error(`Error rewarding player ${playerId}:`, error);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🛒 Mining Session Complete')
        .setDescription(`The minecart has been sold to the shop!\n\n**Total ${boostedItem.name} Mined:** ${totalOre}\n**Total Value:** ${totalCoins} coins (${boostedItem.pricePerItem} each)\n**Split ${validContributors.length} ways:** ${coinsPerPlayer} coins each`)
        .addFields({
            name: 'Contributors',
            value: contributorLines.join('\n') || 'None',
            inline: false
        })
        .setColor(0xFFD700)
        .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Reset the minecart for next session
    gameData.minecart = {
        totalCoal: 0,
        totalTopaz: 0,
        totalDiamond: 0,
        contributors: {}
    };
    gameData.sessionStart = new Date();
    
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

    dbEntry.gameData = {
        ...dbEntry.gameData,
        specialEvent: {
            type: 'thief',
            thiefId: thief.id,
            amount: stealAmount,
            endTime: new Date(Date.now() + 10 * 60 * 1000)
        }
    };
    dbEntry.markModified('gameData');

    const Vote = require('../../models/votes');
    for (const user of humansArray) {
        await Vote.create({
            channelId: dbEntry.channelId,
            userId: user.id,
            targetId: 'novote'
        });
    }

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

        for (const vote of votes) {
            const user = await channel.guild.members.fetch(vote.userId).catch(() => null);
            const target = await channel.guild.members.fetch(vote.targetId).catch(() => null);
            if (user) {
                voteLines.push(`${user.user.username} voted for ${target ? target.user.username : 'no one'}`);
            }
        }

        embed.addFields({ name: 'Votes', value: voteLines.join('\n') || 'No votes recorded' });

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

    const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
    if (thiefMember) {
        embed.addFields({ name: 'The Thief', value: `<@${thiefId}>` });
    }

    await channel.send({ embeds: [embed] });

    await Vote.deleteMany({ channelId: dbEntry.channelId });
    delete dbEntry.gameData.specialEvent;
    dbEntry.markModified('gameData');
}

// ---------------- Long Break Event System ----------------
const longBreakEvents = [
    { func: startThiefGame, weight: 100 }
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
];

module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();
    
    initializeGameData(dbEntry);
    
    if (!dbEntry.gameData.breakCount) {
        dbEntry.gameData.breakCount = 0;
        dbEntry.markModified('gameData');
    }

    await dbEntry.save();

    if (!channel?.isVoiceBased()) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (!humans.size) return;

    if (dbEntry.gameData.specialEvent && now > dbEntry.gameData.specialEvent.endTime) {
        await endThiefGame(channel, dbEntry);
        
        dbEntry.nextTrigger = new Date(now + 5 * 60 * 1000);
        await generateShop(channel, 5);
        await logEvent(channel, '🛒 Special event concluded! Shop open for 5 minutes before mining resumes.');
        await dbEntry.save();
        return;
    }

    if (dbEntry.gameData.specialEvent) {
        await dbEntry.save();
        return;
    }

    const powerLevel = json.power || 1;
    const timesToRun = Math.floor(Math.random() * humans.size) + 1;

    for (let i = 0; i < timesToRun; i++) {
        const winner = humans.random();
        await pickEvent(miningEvents)(winner, channel, powerLevel, dbEntry);
    }

    if (now > dbEntry.nextShopRefresh) {
        dbEntry.gameData.breakCount++;
        dbEntry.markModified('gameData');
        
        if (dbEntry.gameData.breakCount % 4 === 0) {
            await createMiningSummary(channel, dbEntry, powerLevel);
            await pickLongBreakEvent(longBreakEvents)(channel, dbEntry);
            
            dbEntry.nextShopRefresh = new Date(now + 25 * 60 * 1000);
            await logEvent(channel, '🎭 LONG BREAK: Special event starting! (10min event + 5min shop)', powerLevel);
        } else {
            await createMiningSummary(channel, dbEntry, powerLevel);
            await generateShop(channel, 5);
            
            dbEntry.nextTrigger = new Date(now + 5 * 60 * 1000);
            dbEntry.nextShopRefresh = new Date(now + 25 * 60 * 1000);
            await logEvent(channel, '🛑 SHORT BREAK: Mining paused for 5 minutes. Shop is now open!', powerLevel);
        }
    }

    await dbEntry.save();
};