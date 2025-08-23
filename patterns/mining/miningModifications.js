// patterns/mining/miningModifications.js
// This file contains the modifications needed for mining_optimized_v5_performance.js
// Copy these functions and modifications into the appropriate locations in your mining script

// ============================================================================
// MODIFICATION INSTRUCTIONS FOR mining_optimized_v5_performance.js
// ============================================================================

// 1. ADD THIS IMPORT AT THE TOP OF THE FILE (around line 10-20):
const deeperMineChecker = require('./mining/deeperMineChecker');

// ============================================================================
// 2. REPLACE THE logEvent FUNCTION WITH THIS VERSION:
// ============================================================================

async function logEvent(channel, eventText, forceNew = false, powerLevelInfo = null) {
    try {
        eventCounter++;
        const shouldGenerateImage = forceNew || (eventCounter % REDUCED_IMAGE_INTERVAL === 0);
            
        const result = await getCachedDBEntry(channel.id);
        if (!result) {
            console.error(`[MINING] Cannot log event - no DB entry for channel ${channel.id}`);
            return;
        }
        
        const now = new Date();
        
        let timeStatus = "MINING";
        let timeRemaining = 0;
        let endTimestamp = null;

        if (result.gameData?.breakInfo?.inBreak) {
            const breakEndTime = result.gameData.breakInfo.breakEndTime;
            timeRemaining = Math.max(0, Math.floor((breakEndTime - now) / (1000 * 60)));
            endTimestamp = Math.floor(breakEndTime / 1000);

            if (result.gameData.breakInfo.isLongBreak) {
                timeStatus = result.gameData?.specialEvent ? "LONG BREAK (EVENT)" : "LONG BREAK (SHOP)";
            } else {
                timeStatus = "SHORT BREAK";
            }
        } else if (result.nextShopRefresh) {
            timeRemaining = Math.max(0, Math.floor((result.nextShopRefresh - now) / (1000 * 60)));
            endTimestamp = Math.floor(result.nextShopRefresh / 1000);
            timeStatus = "MINING";
        }

        const minecartSummary = await getMinecartSummaryFresh(channel.id);
        
        const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        const logEntry = eventText ? `${eventText} \n-------------------------------` : null;

        const messages = await channel.messages.fetch({ limit: 2 });
        let eventLogMessage = null;

        for (const [, message] of messages) {
            if (message.embeds.length > 0 && message.embeds[0].title?.includes('MINING MAP') && message.author.bot) {
                eventLogMessage = message;
                break;
            }
        }

        let attachment = null;
        if (shouldGenerateImage) {
            try {
                const mapBuffer = await generateTileMapImage(channel);
                attachment = new AttachmentBuilder(mapBuffer, { name: 'mine_map.png' });
            } catch (imgError) {
                console.error('[MINING] Error generating image:', imgError);
            }
        }

        if (logEntry || shouldGenerateImage) {
            let titleText = endTimestamp
                ? `🗺️ MINING MAP | ${timeStatus} ends <t:${endTimestamp}:R>`
                : `🗺️ MINING MAP | ${timeStatus}`;
                
            if (powerLevelInfo) {
                titleText += ` | ${powerLevelInfo.name} (Lv.${powerLevelInfo.level})`;
            }

            const embed = new EmbedBuilder()
                .setTitle(titleText)
                .setColor(0x8B4513)
                .setFooter({ 
                    text: `MINECART: ${minecartSummary.summary}`
                })
                .setTimestamp();

            if (powerLevelInfo && forceNew) {
                let description = logEntry ? `\`\`\`\n${logEntry}\n\`\`\`` : '';
                if (description) {
                    embed.setDescription(description);
                }
            } else if (logEntry) {
                embed.setDescription('```\n' + logEntry + '\n```');
            }

            // ============================================================
            // DEEPER MINE CHECK - NEW CODE
            // ============================================================
            let components = [];
            
            // Only check for deeper mine on fresh embeds, not updates, and not during breaks
            if (forceNew && !result.gameData?.breakInfo?.inBreak) {
                const deeperResult = await deeperMineChecker.checkAndAddDeeperMineButton(
                    embed, 
                    result, 
                    channel.id
                );
                
                // Use the modified embed and components
                if (deeperResult.components && deeperResult.components.length > 0) {
                    components = deeperResult.components;
                }
            }
            // ============================================================

            if (eventLogMessage && forceNew === false) {
                const existingEmbed = eventLogMessage.embeds[0];
                let currentDescription = existingEmbed.description || '';
                currentDescription = currentDescription.replace(/^```\n?|```$/g, '');
                
                const lines = currentDescription.split('\n').filter(line => line.trim());
                if (logEntry) {
                    if (lines.length >= 12) lines.shift();
                    lines.push(logEntry);
                }

                const newDescription = lines.length > 0 ? '```\n' + lines.join('\n') + '\n```' : null;

                if (newDescription && newDescription.length > 4000) {
                    const newEmbed = new EmbedBuilder()
                        .setTitle(titleText)
                        .setColor(0x8B4513)
                        .setFooter({ text: `MINECART: ${minecartSummary.summary}` })
                        .setTimestamp();

                    if (logEntry) newEmbed.setDescription('```\n' + logEntry + '\n```');

                    await channel.send({ 
                        embeds: [newEmbed], 
                        files: attachment ? [attachment] : [],
                        components: components // Add components here
                    });
                    return;
                }

                const updatedEmbed = new EmbedBuilder()
                    .setTitle(titleText)
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART: ${minecartSummary.summary}` })
                    .setTimestamp();

                if (newDescription) updatedEmbed.setDescription(newDescription);

                await eventLogMessage.edit({ 
                    embeds: [updatedEmbed], 
                    files: attachment ? [attachment] : [],
                    components: [] // Don't add components on updates
                });
                return;
            }

            await channel.send({ 
                embeds: [embed], 
                files: attachment ? [attachment] : [],
                components: components // Add components here
            });
        }

    } catch (error) {
        console.error('Error updating mining map:', error);
        try {
            if (eventText) await channel.send(`\`${eventText}\``);
        } catch (fallbackError) {
            console.error('Failed to send fallback message:', fallbackError);
        }
    }
}

// ============================================================================
// 3. ADD THESE STAT TRACKING CALLS IN processPlayerActionsEnhanced:
// ============================================================================

// Find where walls are broken (search for "wallsBroken++") and add:
if (canBreak) {
    mapData.tiles[targetY][targetX].type = TILE_TYPES.FLOOR;
    mapData.tiles[targetY][targetX].discovered = true;
    wallsBroken++;
    
    // NEW: Update mining statistics for deeper mine tracking
    deeperMineChecker.updateMiningStats(dbEntry, 'wallsBroken', 1);
}

// Find where ores are mined (search for "mineFromTile") and add after:
const { item, quantity } = await mineFromTile(
    member, 
    miningPower, 
    luckStat, 
    powerLevel, 
    targetTile.type, 
    availableItems, 
    efficiency
);

// NEW: Track ore statistics
deeperMineChecker.updateMiningStats(dbEntry, 'oresFound', quantity);
deeperMineChecker.updateMiningStats(dbEntry, 'totalValue', item.value * quantity);

// Track rare ores by tier
if (item.tier === 'rare') {
    deeperMineChecker.updateMiningStats(dbEntry, 'rareOre', quantity);
} else if (item.tier === 'epic') {
    deeperMineChecker.updateMiningStats(dbEntry, 'epicOre', quantity);
} else if (item.tier === 'legendary' || item.tier === 'unique' || item.tier === 'mythic') {
    deeperMineChecker.updateMiningStats(dbEntry, 'legendaryOre', quantity);
}

// Check if it's a fossil
if (item.name && item.name.toLowerCase().includes('fossil')) {
    deeperMineChecker.updateMiningStats(dbEntry, 'fossil', quantity);
}

// Find where treasures are generated (search for "generateTreasure") and add after:
const treasure = await generateTreasure(powerLevel, efficiency);
if (treasure) {
    // NEW: Track treasure statistics
    deeperMineChecker.updateMiningStats(dbEntry, 'treasuresFound', 1);
    deeperMineChecker.updateMiningStats(dbEntry, 'totalValue', treasure.value);
    
    // Rest of treasure handling code...
}

// ============================================================================
// 4. INITIALIZE MINING STATS WHEN CREATING NEW GAME DATA:
// ============================================================================

// Find where game data is initialized (search for "initializeGameData") and add after:
if (!dbEntry.gameData) {
    initializeGameData(dbEntry, channel.id);
    
    // NEW: Initialize mining statistics for deeper mine tracking
    deeperMineChecker.initializeMiningStats(dbEntry);
    
    await dbEntry.save();
} else {
    // Also initialize stats if they're missing
    if (!dbEntry.gameData.miningStats) {
        deeperMineChecker.initializeMiningStats(dbEntry);
        dbEntry.markModified('gameData');
        await dbEntry.save();
    }
}

// ============================================================================
// 5. ADD STAT TRACKING IN THE MAIN MODULE.EXPORTS FUNCTION:
// ============================================================================

// In the section where minecart items are added (search for "addItemToMinecart"):
// Add tracking for the value being added
for (const [itemId, quantity] of Object.entries(itemsToAdd)) {
    const item = itemMap.get(itemId);
    if (item) {
        const totalValue = (item.value || 0) * quantity;
        deeperMineChecker.updateMiningStats(dbEntry, 'totalValue', totalValue);
    }
}

// ============================================================================
// NOTES:
// ============================================================================
// - The stat tracking is lightweight and uses the existing save operations
// - Stats are stored in gameData.miningStats on the database entry
// - The deeper mine button only appears when conditions are met
// - Progress is shown on every fresh embed generation
// - Make sure to test with different mine types and conditions