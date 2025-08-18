// miningEvents.js - Event system for mining breaks and special events
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Currency = require('../../../models/currency');
const PlayerInventory = require('../../../models/inventory');
const gachaVC = require('../../../models/activevcs');
const generateShop = require('../../generateShop');
const Canvas = require('canvas');

// ============ LONG BREAK SPECIAL EVENTS ============

/**
 * Thief Game - Players must vote to catch the thief
 */
async function startThiefGame(channel, dbEntry) {
    if (!channel?.isVoiceBased()) return;

    const guild = channel.guild;
    const humansArray = guild.members.cache
        .filter(member => member.voice.channelId === channel.id && !member.user.bot)
        .map(member => member);

    if (humansArray.length < 3) {
        await logEvent(channel, '⚠️ Not enough players for thief event. Extending break...');
        return;
    }

    const thief = humansArray[Math.floor(Math.random() * humansArray.length)];
    let stealAmount = 0;
    const lossDescriptions = [];

    // Steal from each player
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
            const percentToSteal = Math.floor(Math.random() * 10) + 10; // 10-20%
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
        endTime: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });

    // Create vote entries for each user
    const Vote = require('../../../models/votes');
    for (const user of humansArray) {
        await Vote.create({
            channelId: channel.id,
            userId: user.id,
            targetId: 'novote'
        });
    }

    // Build public embed
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

    // DM the thief
    try {
        await thief.send(`You are the thief! You stole a total of ${stealAmount} coins. Be careful not to get caught!`);
    } catch {
        console.log(`Could not DM thief: ${thief.user.tag}`);
    }

    return `⚠️ SPECIAL EVENT: Thief game started! ${stealAmount} coins stolen.`;
}

/**
 * Cave-in Event - Players must work together to clear debris
 */
async function startCaveInEvent(channel, dbEntry) {
    if (!channel?.isVoiceBased()) return;

    const guild = channel.guild;
    const humansArray = guild.members.cache
        .filter(member => member.voice.channelId === channel.id && !member.user.bot)
        .map(member => member);

    if (humansArray.length < 2) {
        await logEvent(channel, '⚠️ Not enough players for cave-in event. Extending break...');
        return;
    }

    const debrisCount = Math.floor(humansArray.length * 1.5) + 3; // Scale with player count
    const rewardPool = humansArray.length * 50; // Base reward pool

    await setSpecialEvent(channel.id, {
        type: 'cavein',
        debrisRemaining: debrisCount,
        rewardPool: rewardPool,
        participants: {},
        endTime: new Date(Date.now() + 10 * 60 * 1000)
    });

    const embed = new EmbedBuilder()
        .setTitle('💥 CAVE-IN! 💥')
        .setDescription(`The mine ceiling collapsed! Work together to clear ${debrisCount} pieces of debris.\n\n` +
                       `Use any mining command to help clear debris!\n` +
                       `💰 Reward pool: ${rewardPool} coins`)
        .setColor(0x8B4513)
        .setTimestamp();

    const endTimeSeconds = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
    embed.addFields({ name: 'Time Limit', value: `Clear the debris before time runs out! <t:${endTimeSeconds}:R>` });

    await channel.send({ embeds: [embed] });

    return `💥 SPECIAL EVENT: Cave-in! Players must clear ${debrisCount} debris pieces.`;
}

/**
 * Treasure Rush Event - Hidden treasure spawns, first to find wins
 */
async function startTreasureRushEvent(channel, dbEntry) {
    if (!channel?.isVoiceBased()) return;

    const guild = channel.guild;
    const humansArray = guild.members.cache
        .filter(member => member.voice.channelId === channel.id && !member.user.bot)
        .map(member => member);

    if (humansArray.length < 2) {
        await logEvent(channel, '⚠️ Not enough players for treasure rush. Extending break...');
        return;
    }

    const treasureValue = Math.floor(Math.random() * 200) + 100; // 100-300 coins
    const winner = humansArray[Math.floor(Math.random() * humansArray.length)];

    // Award treasure immediately
    let winnerMoney = await Currency.findOne({ userId: winner.id });
    if (!winnerMoney) {
        winnerMoney = await Currency.create({
            userId: winner.id,
            usertag: winner.user.tag,
            money: treasureValue
        });
    } else {
        winnerMoney.money += treasureValue;
        await winnerMoney.save();
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 TREASURE RUSH! 🏆')
        .setDescription(`Ancient treasure has been discovered in the mines!\n\n` +
                       `🎉 **${winner.displayName}** found the treasure and won **${treasureValue} coins**!`)
        .setColor(0xFFD700)
        .setTimestamp();

    await channel.send({ embeds: [embed] });

    return `🏆 SPECIAL EVENT: ${winner.displayName} won ${treasureValue} coins in treasure rush!`;
}

/**
 * End Thief Game and distribute rewards
 */
async function endThiefGame(channel, dbEntry) {
    if (!dbEntry.gameData?.specialEvent || dbEntry.gameData.specialEvent.type !== 'thief') return;

    const { thiefId, amount: totalStolen } = dbEntry.gameData.specialEvent;
    const Vote = require('../../../models/votes');

    // Fetch all votes for this channel
    const votes = await Vote.find({ channelId: channel.id });

    const embed = new EmbedBuilder()
        .setTitle('🕵️ Thief Game Results')
        .setTimestamp();

    let winners = [];
    let jailImageAttachment = null;

    if (!votes.length) {
        embed.setDescription('No votes were cast this round.');
        embed.setColor(0xFF0000);
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

        // Find winners who guessed correctly
        winners = votes.filter(v => v.targetId === thiefId);
        const totalPlayers = votes.length;

        // Generate jail image if thief was caught
        if (winners.length > 0) {
            try {
                const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
                if (thiefMember) {
                    jailImageAttachment = await createJailImage(thiefMember);
                    if (jailImageAttachment) {
                        embed.setImage('attachment://thief_jailed.png');
                    }
                }
            } catch (error) {
                console.error('Error creating jail image:', error);
            }
        }

        // Determine rewards
        if (winners.length > 0 && winners.length < totalPlayers) {
            // Partial success - thief gets a share too
            embed.setColor(0xFFFF00);
            const totalRecipients = winners.length + 1;
            const share = Math.floor(totalStolen / totalRecipients);

            await rewardWinners(winners, share);
            await rewardThief(thiefId, share);

            embed.setTitle('📰 THIEF CAUGHT (Partial Success)');
            embed.addFields(
                { name: 'Winners', value: winners.map(w => `<@${w.userId}> gets ${share} coins!`).join('\n') },
                { name: 'Thief Reward', value: `<@${thiefId}> keeps ${share} coins for evading some suspicion!` }
            );

        } else if (winners.length === totalPlayers) {
            // Complete success - thief gets nothing
            embed.setColor(0x00FF00);
            const share = Math.floor(totalStolen / winners.length);

            await rewardWinners(winners, share);

            embed.setTitle('📰 THIEF CAUGHT (Complete Success)');
            embed.addFields({
                name: 'Winners',
                value: winners.map(w => `<@${w.userId}> gets ${share} coins!`).join('\n')
            });

        } else {
            // Thief escapes - keeps everything
            embed.setColor(0xFF0000);
            embed.setTitle('🏃‍♂️ THIEF ESCAPED');
            embed.addFields({
                name: 'Result',
                value: `No one guessed correctly. The thief got away with ${totalStolen} coins.`
            });
        }
    }

    // Announce the thief
    const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
    if (thiefMember) {
        embed.addFields({ name: 'The Thief', value: `<@${thiefId}>` });
    }

    // Send results
    const messageOptions = { embeds: [embed] };
    if (jailImageAttachment) {
        messageOptions.files = [jailImageAttachment];
    }
    await channel.send(messageOptions);

    // Cleanup
    await Vote.deleteMany({ channelId: channel.id });
    await clearSpecialEvent(channel.id);

    return 'Thief game concluded!';
}

/**
 * Create jail image for caught thief
 */
async function createJailImage(thiefMember) {
    try {
        const canvas = Canvas.createCanvas(256, 256);
        const ctx = canvas.getContext('2d');

        // Load thief's avatar
        const avatarUrl = thiefMember.user.displayAvatarURL({ format: 'png', size: 256 });
        const avatar = await Canvas.loadImage(avatarUrl);
        
        // Draw avatar
        ctx.drawImage(avatar, 0, 0, 256, 256);

        // Draw jail bars
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 8;
        
        // Vertical bars
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

        const buffer = canvas.toBuffer('image/png');
        return new AttachmentBuilder(buffer, { name: 'thief_jailed.png' });
    } catch (error) {
        console.error('Error creating jail image:', error);
        return null;
    }
}

/**
 * Reward winners with coins
 */
async function rewardWinners(winners, amount) {
    for (const winner of winners) {
        let winnerMoney = await Currency.findOne({ userId: winner.userId });
        if (!winnerMoney) {
            winnerMoney = await Currency.create({
                userId: winner.userId,
                money: amount
            });
        } else {
            winnerMoney.money += amount;
            await winnerMoney.save();
        }
    }
}

/**
 * Reward thief with coins
 */
async function rewardThief(thiefId, amount) {
    let thiefMoney = await Currency.findOne({ userId: thiefId });
    if (!thiefMoney) {
        thiefMoney = await Currency.create({
            userId: thiefId,
            money: amount
        });
    } else {
        thiefMoney.money += amount;
        await thiefMoney.save();
    }
}

// ============ EVENT MANAGEMENT ============

/**
 * Set special event data
 */
async function setSpecialEvent(channelId, eventData) {
    await gachaVC.updateOne(
        { channelId: channelId },
        { $set: { 'gameData.specialEvent': eventData } }
    );
}

/**
 * Clear special event data
 */
async function clearSpecialEvent(channelId) {
    await gachaVC.updateOne(
        { channelId: channelId },
        { $unset: { 'gameData.specialEvent': 1 } }
    );
}

/**
 * Check if special event should end and handle it
 */
async function checkAndEndSpecialEvent(channel, dbEntry) {
    const now = Date.now();
    
    if (dbEntry.gameData?.specialEvent && now > dbEntry.gameData.specialEvent.endTime) {
        const eventType = dbEntry.gameData.specialEvent.type;
        
        switch (eventType) {
            case 'thief':
                await endThiefGame(channel, dbEntry);
                break;
            // Add other event endings here
            default:
                await clearSpecialEvent(channel.id);
        }
        
        // Start shop break after special event
        await gachaVC.updateOne(
            { channelId: channel.id },
            { $set: { nextTrigger: new Date(now + 5 * 60 * 1000) } }
        );
        
        await generateShop(channel, 5);
        return '🛒 Special event concluded! Shop open for 5 minutes.';
    }
    
    return null;
}

// ============ EVENT CONFIGURATION ============

/**
 * Available long break events with weights
 */
const longBreakEvents = [
    { func: startThiefGame, weight: 40, name: 'Thief Game' },
    { func: startCaveInEvent, weight: 30, name: 'Cave-in' },
    { func: startTreasureRushEvent, weight: 30, name: 'Treasure Rush' }
];

/**
 * Pick a random long break event based on weights
 */
function pickLongBreakEvent() {
    const totalWeight = longBreakEvents.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * totalWeight;
    return longBreakEvents.find(e => (rand -= e.weight) < 0)?.func || longBreakEvents[0].func;
}

/**
 * Check if it's time for a long break (every 4th break)
 */
function shouldTriggerLongBreak(breakCount) {
    return breakCount % 4 === 0;
}

// ============ BREAK PLAYER POSITIONING ============

/**
 * Scatter players around entrance during breaks
 * Creates tent positions with controlled density
 */
function scatterPlayersForBreak(playerPositions, entranceX, entranceY, playerCount) {
    const scattered = {};
    
    // Calculate scatter radius based on player count (3-4 players per "zone")
    const baseRadius = 2;
    const maxRadius = Math.ceil(Math.sqrt(playerCount / 3)) + baseRadius;
    
    // Get list of player IDs
    const playerIds = Object.keys(playerPositions);
    
    // Generate tent positions
    const tentPositions = new Set();
    
    for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i];
        let tentX, tentY;
        let attempts = 0;
        
        do {
            // Try to place tent within scatter radius
            const angle = Math.random() * 2 * Math.PI;
            const distance = Math.random() * maxRadius + 1; // At least 1 tile away
            
            tentX = Math.round(entranceX + Math.cos(angle) * distance);
            tentY = Math.round(entranceY + Math.sin(angle) * distance);
            
            attempts++;
            
            // If we can't find a spot after many attempts, use a systematic approach
            if (attempts > 20) {
                const ring = Math.floor(i / 8) + 1; // Which ring around entrance
                const positionInRing = i % 8; // Position within the ring
                const ringAngle = (positionInRing / 8) * 2 * Math.PI;
                
                tentX = Math.round(entranceX + Math.cos(ringAngle) * ring);
                tentY = Math.round(entranceY + Math.sin(ringAngle) * ring);
                break;
            }
            
        } while (tentPositions.has(`${tentX},${tentY}`) && attempts < 20);
        
        tentPositions.add(`${tentX},${tentY}`);
        scattered[playerId] = { x: tentX, y: tentY, isTent: true };
    }
    
    return scattered;
}

// ============ EXPORTS ============

module.exports = {
    // Event functions
    startThiefGame,
    startCaveInEvent,
    startTreasureRushEvent,
    endThiefGame,
    
    // Event management
    setSpecialEvent,
    clearSpecialEvent,
    checkAndEndSpecialEvent,
    
    // Event selection
    pickLongBreakEvent,
    shouldTriggerLongBreak,
    
    // Break positioning
    scatterPlayersForBreak,
    
    // Configuration
    longBreakEvents
};
