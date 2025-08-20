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

    if (humansArray.length < 2) { // Changed to 2 for easier testing
        await logEvent(channel, '⚠️ Not enough players for thief event. Need at least 2 players.');
        return '⚠️ Not enough players for thief event';
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
            const percentToSteal = Math.floor(Math.random() * 2) + 1 // 10-20%
            const stolen = Math.floor((percentToSteal / 100) * userMoney.money);

            userMoney.money -= stolen;
            stealAmount += stolen;
            await userMoney.save();

            lossDescriptions.push(`${user.user.username} lost ${stolen} coins`);
        }
    }

    // Store thief info with proper time
    const endTime = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    await setSpecialEvent(channel.id, {
        type: 'thief',
        thiefId: thief.id,
        amount: stealAmount,
        endTime: endTime
    });

    // Create vote entries for each user with random voting (temporary until /vote command is implemented)
    const Vote = require('../../../models/votes');
    
    // Clear any existing votes first
    await Vote.deleteMany({ channelId: channel.id });
    
    // Create new votes (for now, random voting as placeholder)
    for (const user of humansArray) {
        // Random vote - 30% chance to vote correctly
        const targetId = Math.random() < 0.3 ? thief.id : 
                        humansArray[Math.floor(Math.random() * humansArray.length)].id;
        
        await Vote.create({
            channelId: channel.id,
            userId: user.id,
            targetId: targetId
        });
    }

    // Build public embed
    const embed = new EmbedBuilder()
        .setTitle('⚠️ THIEF ALERT! ⚠️')
        .setDescription(`In the darkness of the mines, someone has stolen everyone's coins!\n\n` +
                        (lossDescriptions.length > 0 ? lossDescriptions.join('\n') : 'No coins were stolen') +
                        `\n\n💰 Total stolen: ${stealAmount} coins\n\n` +
                        `*Note: Auto-voting enabled until /vote command is implemented*`)
        .setColor(0xff0000)
        .setTimestamp();

    const endTimeSeconds = Math.floor(endTime / 1000);
    embed.addFields({ name: 'Event Ends', value: `<t:${endTimeSeconds}:R>` });

    await channel.send({ embeds: [embed] });

    // DM the thief
    try {
        await thief.send(`You are the thief! You stole a total of ${stealAmount} coins. Be careful not to get caught!`);
    } catch {
        console.log(`Could not DM thief: ${thief.user.tag}`);
    }

    return `⚠️ THIEF EVENT: ${stealAmount} coins stolen!`;
}


/**
 * Mine Collapse Event - Floor tiles collapse and transform into various tile types
 * Enhanced for solo players with guaranteed rewards
 */
async function startMineCollapseEvent(channel, dbEntry) {
    if (!channel?.isVoiceBased()) return;
    
    const { TILE_TYPES } = require('./miningConstants');
    const gachaVC = require('../../../models/activevcs');
    
    // Check player count for solo mode enhancements
    const members = channel.members.filter(m => !m.user.bot);
    const isSolo = members.size === 1;
    
    // Get current map data
    const mapData = dbEntry.gameData?.map;
    if (!mapData || !mapData.tiles) {
        console.log('No map data available for mine collapse');
        return 'Map not initialized for mine collapse event';
    }
    
    // Find all floor tiles
    const floorTiles = [];
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            const tile = mapData.tiles[y]?.[x];
            if (tile && tile.type === TILE_TYPES.FLOOR && tile.discovered) {
                // Don't collapse entrance area
                const distFromEntrance = Math.abs(x - mapData.entranceX) + Math.abs(y - mapData.entranceY);
                if (distFromEntrance > 2) {
                    floorTiles.push({ x, y });
                }
            }
        }
    }
    
    if (floorTiles.length < 10) {
        console.log('Not enough floor tiles for collapse event');
        return 'Mine too small for collapse event';
    }
    
    // Determine number of collapse zones (1-5 based on map size)
    const numCollapses = Math.min(5, Math.max(1, Math.floor(floorTiles.length / 15)));
    const collapsedZones = [];
    const affectedTiles = new Set();
    
    // Create collapse zones
    for (let i = 0; i < numCollapses; i++) {
        // Pick random center point from floor tiles
        const centerIndex = Math.floor(Math.random() * floorTiles.length);
        const center = floorTiles[centerIndex];
        
        // Random radius (1-3 tiles)
        const radius = Math.floor(Math.random() * 3) + 1;
        
        // Determine collapse pattern for this zone
        const collapseType = pickCollapseType();
        
        // Track this collapse zone
        collapsedZones.push({
            center,
            radius,
            type: collapseType.name
        });
        
        // Apply collapse in radius
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                // Check if within circular radius
                if (Math.sqrt(dx * dx + dy * dy) <= radius) {
                    const tileX = center.x + dx;
                    const tileY = center.y + dy;
                    
                    // Ensure within bounds
                    if (tileX >= 0 && tileX < mapData.width && 
                        tileY >= 0 && tileY < mapData.height) {
                        
                        const currentTile = mapData.tiles[tileY][tileX];
                        // Only collapse floor tiles
                        if (currentTile && currentTile.type === TILE_TYPES.FLOOR) {
                            // Don't collapse entrance
                            const distFromEntrance = Math.abs(tileX - mapData.entranceX) + 
                                                    Math.abs(tileY - mapData.entranceY);
                            if (distFromEntrance > 2) {
                                // Apply random transformation based on collapse type
                                const newTileType = getRandomTileFromCollapseType(collapseType);
                                mapData.tiles[tileY][tileX] = {
                                    type: newTileType,
                                    discovered: true,
                                    hardness: getTileHardness(newTileType)
                                };
                                affectedTiles.add(`${tileX},${tileY}`);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Save updated map
    await gachaVC.updateOne(
        { channelId: channel.id },
        { $set: { 'gameData.map': mapData } }
    );
    
    // Build event description
    const collapseDescriptions = collapsedZones.map(zone => 
        `• ${zone.type} collapse at (${zone.center.x}, ${zone.center.y}) - radius ${zone.radius}`
    );
    
    // Enhanced rewards for solo players
    let bonusMessage = '';
    if (isSolo) {
        // Give solo player a bonus for surviving the collapse
        const Currency = require('../../../models/currency');
        const soloPlayer = members.first();
        const survivalBonus = 100 + Math.floor(Math.random() * 200);
        
        let playerMoney = await Currency.findOne({ userId: soloPlayer.id });
        if (!playerMoney) {
            playerMoney = await Currency.create({
                userId: soloPlayer.id,
                usertag: soloPlayer.user.tag,
                money: survivalBonus
            });
        } else {
            playerMoney.money += survivalBonus;
            await playerMoney.save();
        }
        
        bonusMessage = `\n\n💰 **Solo Survivor Bonus**: ${survivalBonus} coins for weathering the collapse alone!`;
        
        // Guarantee at least one treasure chest for solo players
        if (collapsedZones.length > 0) {
            const treasureZone = collapsedZones[0];
            mapData.tiles[treasureZone.center.y][treasureZone.center.x] = {
                type: TILE_TYPES.TREASURE_CHEST,
                discovered: true,
                hardness: 2
            };
            bonusMessage += `\n📍 **Treasure detected at (${treasureZone.center.x}, ${treasureZone.center.y})**`;
        }
    }
    
    const embed = new EmbedBuilder()
        .setTitle('⛰️ MINE COLLAPSE! ⛰️')
        .setDescription(`The mine structure has become unstable! Multiple sections have collapsed and transformed:\n\n` +
                       collapseDescriptions.join('\n') +
                       `\n\n${affectedTiles.size} tiles affected!\n` +
                       `⚠️ Collapsed areas may contain valuable ores... or dangerous hazards!` +
                       bonusMessage)
        .setColor(0x8B4513)
        .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    
    return `⛰️ MINE COLLAPSE: ${numCollapses} zones collapsed, ${affectedTiles.size} tiles affected!`;
}

/**
 * Determine the type of collapse (what tiles will appear)
 */
function pickCollapseType() {
    const types = [
        { name: 'Rich Vein', weight: 25, distribution: { ore: 60, rare: 20, wall: 15, reinforced: 5 } },
        { name: 'Cave-in', weight: 35, distribution: { wall: 50, ore: 30, reinforced: 15, hazard: 5 } },
        { name: 'Dead Zone', weight: 20, distribution: { wall: 60, reinforced: 30, hazard: 10 } },
        { name: 'Danger Zone', weight: 10, distribution: { hazard: 40, wall: 30, reinforced: 20, ore: 10 } },
        { name: 'Crystal Cave', weight: 10, distribution: { rare: 40, treasure: 20, ore: 30, wall: 10 } }
    ];
    
    const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
    let rand = Math.random() * totalWeight;
    
    for (const type of types) {
        rand -= type.weight;
        if (rand <= 0) return type;
    }
    
    return types[0]; // Fallback
}

/**
 * Get a random tile type based on collapse type distribution
 */
function getRandomTileFromCollapseType(collapseType) {
    const { TILE_TYPES } = require('./miningConstants');
    const dist = collapseType.distribution;
    const rand = Math.random() * 100;
    
    let accumulated = 0;
    
    if (dist.ore) {
        accumulated += dist.ore;
        if (rand < accumulated) return TILE_TYPES.WALL_WITH_ORE;
    }
    
    if (dist.rare) {
        accumulated += dist.rare;
        if (rand < accumulated) return TILE_TYPES.RARE_ORE;
    }
    
    if (dist.treasure) {
        accumulated += dist.treasure;
        if (rand < accumulated) return TILE_TYPES.TREASURE_CHEST;
    }
    
    if (dist.hazard) {
        accumulated += dist.hazard;
        if (rand < accumulated) return TILE_TYPES.HAZARD;
    }
    
    if (dist.reinforced) {
        accumulated += dist.reinforced;
        if (rand < accumulated) return TILE_TYPES.REINFORCED_WALL;
    }
    
    // Default to regular wall
    return TILE_TYPES.WALL;
}

/**
 * Get tile hardness value
 */
function getTileHardness(tileType) {
    const { TILE_TYPES } = require('./miningConstants');
    
    const hardnessMap = {
        [TILE_TYPES.WALL]: 1,
        [TILE_TYPES.WALL_WITH_ORE]: 2,
        [TILE_TYPES.RARE_ORE]: 3,
        [TILE_TYPES.REINFORCED_WALL]: 5,
        [TILE_TYPES.TREASURE_CHEST]: 2,
        [TILE_TYPES.HAZARD]: 0,
        [TILE_TYPES.FLOOR]: 0
    };
    
    return hardnessMap[tileType] || 1;
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

        } else if (winners.length === totalPlayers && totalPlayers > 1) {
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
            
            // Give thief the stolen money
            await rewardThief(thiefId, totalStolen);
            
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
    console.log(`Rewarding ${winners.length} winners with ${amount} coins each`);
    for (const winner of winners) {
        try {
            let winnerMoney = await Currency.findOne({ userId: winner.userId });
            if (!winnerMoney) {
                winnerMoney = await Currency.create({
                    userId: winner.userId,
                    usertag: `User-${winner.userId}`, // Add usertag field
                    money: amount
                });
                console.log(`Created new currency record for ${winner.userId} with ${amount} coins`);
            } else {
                const oldAmount = winnerMoney.money;
                winnerMoney.money += amount;
                await winnerMoney.save();
                console.log(`Updated ${winner.userId} from ${oldAmount} to ${winnerMoney.money} coins`);
            }
        } catch (error) {
            console.error(`Error rewarding winner ${winner.userId}:`, error);
        }
    }
}

/**
 * Reward thief with coins
 */
async function rewardThief(thiefId, amount) {
    console.log(`Rewarding thief ${thiefId} with ${amount} coins`);
    try {
        let thiefMoney = await Currency.findOne({ userId: thiefId });
        if (!thiefMoney) {
            thiefMoney = await Currency.create({
                userId: thiefId,
                usertag: `User-${thiefId}`, // Add usertag field
                money: amount
            });
            console.log(`Created new currency record for thief ${thiefId} with ${amount} coins`);
        } else {
            const oldAmount = thiefMoney.money;
            thiefMoney.money += amount;
            await thiefMoney.save();
            console.log(`Updated thief ${thiefId} from ${oldAmount} to ${thiefMoney.money} coins`);
        }
    } catch (error) {
        console.error(`Error rewarding thief ${thiefId}:`, error);
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
 * Enhanced checkAndEndSpecialEvent with better logging
 */
async function checkAndEndSpecialEvent(channel, dbEntry) {
    const now = Date.now();
    
    console.log(`[checkAndEndSpecialEvent] Checking for channel ${channel.id}`);
    console.log(`[checkAndEndSpecialEvent] Current time: ${now}`);
    
    if (dbEntry.gameData?.specialEvent) {
        const event = dbEntry.gameData.specialEvent;
        console.log(`[checkAndEndSpecialEvent] Event type: ${event.type}`);
        console.log(`[checkAndEndSpecialEvent] Event end time: ${event.endTime}`);
        console.log(`[checkAndEndSpecialEvent] Should end? ${now > event.endTime}`);
        
        if (now > event.endTime) {
            const eventType = event.type;
            
            try {
                switch (eventType) {
                    case 'thief':
                        console.log(`[checkAndEndSpecialEvent] Ending thief game...`);
                        await endThiefGame(channel, dbEntry);
                        break;
                    // Add other event endings here
                    default:
                        console.log(`[checkAndEndSpecialEvent] Clearing unknown event type: ${eventType}`);
                        await clearSpecialEvent(channel.id);
                }
                
                // Start shop break after special event
                await gachaVC.updateOne(
                    { channelId: channel.id },
                    { $set: { nextTrigger: new Date(now + 5 * 60 * 1000) } }
                );
                
                // Don't generate shop here - let the caller handle it
                console.log(`[checkAndEndSpecialEvent] Event ended successfully`);
                return `🛒 ${eventType} event concluded!`;
            } catch (error) {
                console.error(`[checkAndEndSpecialEvent] Error ending event:`, error);
                return null;
            }
        } else {
            console.log(`[checkAndEndSpecialEvent] Event not ready to end yet`);
        }
    } else {
        console.log(`[checkAndEndSpecialEvent] No special event active`);
    }
    
    return null;
}

// ============ EVENT CONFIGURATION ============

/**
 * Available long break events with weights and player requirements
 */
const longBreakEvents = [
    { 
        func: startThiefGame, 
        weight: 30, 
        name: 'Thief Game',
        minPlayers: 2,  // Need at least 2 players for voting
        maxPlayers: null, // No upper limit
        optimalPlayers: { min: 3, max: 8 } // Works best with 3-8 players
    },
    { 
        func: startMineCollapseEvent, 
        weight: 25, 
        name: 'Mine Collapse',
        minPlayers: 1,  // Can work with any number
        maxPlayers: null,
        optimalPlayers: { min: 1, max: 20 } // Works for any size
    }
    // Future events can be added here with their requirements:
    // { 
    //     func: startTreasureHunt, 
    //     weight: 20, 
    //     name: 'Treasure Hunt',
    //     minPlayers: 3,  // Need teams
    //     maxPlayers: 12, // Too chaotic with more
    //     optimalPlayers: { min: 4, max: 10 }
    // }
];

/**
 * Pick a random long break event based on weights and player count
 * @param {number} playerCount - Number of players in the channel
 * @returns {Function} The selected event function
 */
function pickLongBreakEvent(playerCount = 1) {
    // Filter events based on player requirements
    const eligibleEvents = longBreakEvents.filter(event => {
        // Check minimum players
        if (event.minPlayers && playerCount < event.minPlayers) {
            console.log(`${event.name} requires min ${event.minPlayers} players, have ${playerCount}`);
            return false;
        }
        
        // Check maximum players
        if (event.maxPlayers && playerCount > event.maxPlayers) {
            console.log(`${event.name} allows max ${event.maxPlayers} players, have ${playerCount}`);
            return false;
        }
        
        return true;
    });
    
    // If no events are eligible, fall back to mine collapse (works with any count)
    if (eligibleEvents.length === 0) {
        console.log('No eligible events for player count, defaulting to Mine Collapse');
        return startMineCollapseEvent;
    }
    
    // Adjust weights based on optimal player counts
    const adjustedEvents = eligibleEvents.map(event => {
        let adjustedWeight = event.weight;
        
        // Boost weight if within optimal range
        if (event.optimalPlayers) {
            if (playerCount >= event.optimalPlayers.min && 
                playerCount <= event.optimalPlayers.max) {
                adjustedWeight *= 1.5; // 50% boost for optimal player count
                console.log(`${event.name} weight boosted from ${event.weight} to ${adjustedWeight} (optimal player count)`);
            }
        }
        
        return { ...event, adjustedWeight };
    });
    
    // Calculate total weight
    const totalWeight = adjustedEvents.reduce((sum, e) => sum + e.adjustedWeight, 0);
    
    // Pick random event based on adjusted weights
    let rand = Math.random() * totalWeight;
    const selected = adjustedEvents.find(e => (rand -= e.adjustedWeight) < 0) || adjustedEvents[0];
    
    console.log(`Selected ${selected.name} for ${playerCount} players`);
    return selected.func;
}

/**
 * Check if it's time for a long break (every 4th break)
 */
function shouldTriggerLongBreak(breakCount) {
    return breakCount % 4 === 0;
}

/**
 * Get list of available events for a given player count
 * Useful for debugging and information
 * @param {number} playerCount - Number of players
 * @returns {Array} Array of available event names with their selection chances
 */
function getAvailableEvents(playerCount) {
    const eligible = longBreakEvents.filter(event => {
        if (event.minPlayers && playerCount < event.minPlayers) return false;
        if (event.maxPlayers && playerCount > event.maxPlayers) return false;
        return true;
    });
    
    const totalWeight = eligible.reduce((sum, e) => {
        let weight = e.weight;
        if (e.optimalPlayers && 
            playerCount >= e.optimalPlayers.min && 
            playerCount <= e.optimalPlayers.max) {
            weight *= 1.5;
        }
        return sum + weight;
    }, 0);
    
    return eligible.map(event => {
        let weight = event.weight;
        let status = '';
        
        if (event.optimalPlayers && 
            playerCount >= event.optimalPlayers.min && 
            playerCount <= event.optimalPlayers.max) {
            weight *= 1.5;
            status = ' (optimal)';
        }
        
        const chance = ((weight / totalWeight) * 100).toFixed(1);
        return `${event.name}: ${chance}%${status}`;
    });
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

// ============ DEBUG FUNCTIONS ============

/**
 * Debug function to check special event status
 */
async function debugSpecialEvent(channel) {
    const dbEntry = await gachaVC.findOne({ channelId: channel.id });
    
    console.log('=== SPECIAL EVENT DEBUG ===');
    console.log('Channel ID:', channel.id);
    console.log('Current time:', new Date().toISOString());
    console.log('Current timestamp:', Date.now());
    
    if (dbEntry?.gameData?.specialEvent) {
        const event = dbEntry.gameData.specialEvent;
        console.log('Event type:', event.type);
        console.log('Event end time:', new Date(event.endTime).toISOString());
        console.log('Event end timestamp:', event.endTime);
        console.log('Time remaining (ms):', event.endTime - Date.now());
        console.log('Should end?:', Date.now() > event.endTime);
        
        if (event.type === 'thief') {
            console.log('Thief ID:', event.thiefId);
            console.log('Amount stolen:', event.amount);
        }
    } else {
        console.log('No special event active');
    }
    
    if (dbEntry?.gameData?.breakInfo) {
        const breakInfo = dbEntry.gameData.breakInfo;
        console.log('--- Break Info ---');
        console.log('In break?:', breakInfo.inBreak);
        console.log('Is long break?:', breakInfo.isLongBreak);
        console.log('Break end time:', new Date(breakInfo.breakEndTime).toISOString());
        console.log('Break time remaining (ms):', breakInfo.breakEndTime - Date.now());
    }
    
    console.log('=========================');
    
    return dbEntry;
}

/**
 * Force end a special event (for testing/debugging)
 */
async function forceEndSpecialEvent(channel) {
    const dbEntry = await gachaVC.findOne({ channelId: channel.id });
    
    if (!dbEntry?.gameData?.specialEvent) {
        console.log('No special event to end');
        return 'No special event active';
    }
    
    const eventType = dbEntry.gameData.specialEvent.type;
    console.log(`Force ending ${eventType} event...`);
    
    // Call the appropriate end function
    switch (eventType) {
        case 'thief':
            await endThiefGame(channel, dbEntry);
            break;
        default:
            await clearSpecialEvent(channel.id);
    }
    
    console.log('Event force ended');
    return `Force ended ${eventType} event`;
}

/**
 * Force start a thief event (for testing)
 */
async function forceStartThiefEvent(channel) {
    const dbEntry = await gachaVC.findOne({ channelId: channel.id });
    
    if (!dbEntry) {
        return 'No active mining session';
    }
    
    // Clear any existing event
    if (dbEntry.gameData?.specialEvent) {
        await clearSpecialEvent(channel.id);
    }
    
    // Start thief event
    const result = await startThiefGame(channel, dbEntry);
    return result || 'Thief event started';
}

// ============ EXPORTS ============

module.exports = {
    // Event functions
    startThiefGame,
    startMineCollapseEvent,
    endThiefGame,
    
    // Event management
    setSpecialEvent,
    clearSpecialEvent,
    checkAndEndSpecialEvent,
    
    // Event selection
    pickLongBreakEvent,
    shouldTriggerLongBreak,
    getAvailableEvents,
    
    // Break positioning
    scatterPlayersForBreak,
    
    // Configuration
    longBreakEvents,
    
    // Debug functions
    debugSpecialEvent,
    forceEndSpecialEvent,
    forceStartThiefEvent
};
