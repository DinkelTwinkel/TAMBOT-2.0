// familiar.js - Item use script for summoning familiars/golems
const familiarSystem = require('../../patterns/gachaModes/mining/familiarSystem');
const gachaVC = require('../../models/activevcs');

/**
 * Main script execution function called by itemUseHandler
 */
async function execute(context) {
    const { member, item, channel, interaction, consumeItem, sendEmbed } = context;
    try {
        // Check if player is in a mining channel
        const dbEntry = await gachaVC.findOne({ channelId: channel.id });
        
        // Debug logging to see what we're getting
        console.log(`[FAMILIAR DEBUG] Channel ${channel.id} database check:`, {
            hasDbEntry: !!dbEntry,
            hasGameData: !!dbEntry?.gameData,
            gamemode: dbEntry?.gameData?.gamemode,
            typeId: dbEntry?.typeId
        });
        
        // If no database entry exists, check if this is a voice channel that could be a mining channel
        if (!dbEntry) {
            if (!channel.isVoiceBased()) {
                return await sendEmbed({
                    title: "❌ Cannot Summon Familiar",
                    description: "Familiars can only be summoned in voice channels!",
                    color: 0xFF0000
                });
            }
            
            // This is a voice channel but not initialized for mining yet
            return await sendEmbed({
                title: "❌ Cannot Summon Familiar",
                description: "This mining channel hasn't been activated yet! Join the voice channel first to initialize mining, then try again.",
                color: 0xFF0000
            });
        }
        
        if (!dbEntry.gameData) {
            return await sendEmbed({
                title: "❌ Cannot Summon Familiar", 
                description: "This channel needs to be initialized for mining! Join the voice channel first to start mining.",
                color: 0xFF0000
            });
        }
        
        if (dbEntry.gameData.gamemode !== 'mining') {
            return await sendEmbed({
                title: "❌ Cannot Summon Familiar",
                description: `This channel is set to '${dbEntry.gameData.gamemode}' mode, not mining! Familiars can only be summoned in mining channels.`,
                color: 0xFF0000
            });
        }
        
        // Determine familiar type based on item
        let familiarType = null;
        let customConfig = {};
        
        switch (item.id) {
            case '241': // Stone Golem Core
                familiarType = familiarSystem.FAMILIAR_TYPES.STONE_GOLEM;
                break;
            case '242': // Iron Golem Core
                familiarType = familiarSystem.FAMILIAR_TYPES.IRON_GOLEM;
                break;
            case '243': // Crystal Golem Core
                familiarType = familiarSystem.FAMILIAR_TYPES.CRYSTAL_GOLEM;
                break;
            case '244': // Fire Essence
                familiarType = familiarSystem.FAMILIAR_TYPES.FIRE_ELEMENTAL;
                customConfig = {
                    abilities: {
                        ...familiarSystem.FAMILIAR_CONFIGS[familiarSystem.FAMILIAR_TYPES.FIRE_ELEMENTAL].abilities,
                        fireBonus: 0.3 // 30% chance for fire ore
                    }
                };
                break;
            case '245': // Ice Essence
                familiarType = familiarSystem.FAMILIAR_TYPES.ICE_ELEMENTAL;
                customConfig = {
                    abilities: {
                        ...familiarSystem.FAMILIAR_CONFIGS[familiarSystem.FAMILIAR_TYPES.ICE_ELEMENTAL].abilities,
                        freezeChance: 0.2 // 20% chance to freeze hazards
                    }
                };
                break;
            default:
                return {
                    success: false,
                    message: "❌ This item cannot be used to summon a familiar!",
                    removeItem: false
                };
        }
        
        // Get player data for familiar creation
        const getPlayerStats = require('../../patterns/calculatePlayerStat');
        const playerData = await getPlayerStats(member.id);
        
        if (!playerData) {
            return {
                success: false,
                message: "❌ Could not retrieve your player data!",
                removeItem: false
            };
        }
        
        // Attempt to spawn the familiar
        const spawnResult = await familiarSystem.spawnFamiliarFromItem(
            member.id,
            member.displayName,
            familiarType,
            playerData,
            dbEntry.gameData.map,
            customConfig,
            dbEntry
        );
        
        if (!spawnResult.success) {
            return await sendEmbed({
                title: "❌ Cannot Summon Familiar",
                description: spawnResult.message,
                color: 0xFF0000
            });
        }
        
        // Success! The familiar was spawned
        await consumeItem(1); // Remove one item from inventory
        
        // Send public announcement message
        try {
            const config = familiarSystem.FAMILIAR_CONFIGS[familiarType];
            await channel.send(`${config.displayIcon} **${member.displayName}** summoned a **${config.name}**!`);
        } catch (announceError) {
            console.error('[FAMILIAR] Error sending familiar summoning announcement:', announceError);
            // Don't fail the summoning if announcement fails
        }
        
        const config = familiarSystem.FAMILIAR_CONFIGS[familiarType];
        const familiar = spawnResult.familiar;
        
        // Build comprehensive stats display
        const fields = [];
        
        // Duration field
        fields.push({
            name: "⏰ Duration",
            value: config.duration ? 
                `${Math.floor(config.duration / 60000)} minutes` : 
                "Permanent (while you have the required item)",
            inline: true
        });
        
        // Stats field
        if (config.statMultiplier) {
            // Percentage-based stats (like shadow clones)
            fields.push({
                name: "📊 Stats",
                value: `${Math.floor(config.statMultiplier * 100)}% of your stats`,
                inline: true
            });
        } else if (config.baseStats) {
            // Fixed base stats (like golems)
            const statsText = [
                `⛏️ Mining: ${config.baseStats.mining}`,
                `👁️ Sight: ${config.baseStats.sight}`,
                `⚡ Speed: ${config.baseStats.speed}`
            ];
            if (config.baseStats.luck > 0) {
                statsText.push(`🍀 Luck: ${config.baseStats.luck}`);
            }
            fields.push({
                name: "📊 Base Stats",
                value: statsText.join('\n'),
                inline: true
            });
        }
        
        // Actual calculated stats (from the created familiar)
        if (familiar && familiar.stats) {
            const actualStatsText = [
                `⛏️ ${familiar.stats.mining}`,
                `👁️ ${familiar.stats.sight}`,
                `⚡ ${familiar.stats.speed}`
            ];
            if (familiar.stats.luck > 0) {
                actualStatsText.push(`🍀 ${familiar.stats.luck}`);
            }
            fields.push({
                name: "💪 Current Stats",
                value: actualStatsText.join('\n'),
                inline: true
            });
        }
        
        // Special abilities
        if (config.abilities) {
            const abilities = [];
            
            if (config.abilities.shadowOreChance) {
                abilities.push(`👤 ${Math.floor(config.abilities.shadowOreChance * 100)}% shadow ore chance`);
            }
            if (config.abilities.fireBonus) {
                abilities.push(`🔥 ${Math.floor(config.abilities.fireBonus * 100)}% fire ore bonus`);
            }
            if (config.abilities.freezeChance) {
                abilities.push(`❄️ ${Math.floor(config.abilities.freezeChance * 100)}% freeze hazards`);
            }
            if (config.abilities.waterOreChance) {
                abilities.push(`🌊 ${Math.floor(config.abilities.waterOreChance * 100)}% water ore chance`);
            }
            if (config.abilities.stoneResistance) {
                abilities.push(`🗿 ${Math.floor(config.abilities.stoneResistance * 100)}% stone resistance`);
            }
            if (config.abilities.knockoutResistance) {
                abilities.push(`🛡️ ${Math.floor(config.abilities.knockoutResistance * 100)}% knockout resistance`);
            }
            if (config.abilities.slowMovement && config.abilities.slowMovement < 1) {
                abilities.push(`🐌 ${Math.floor(config.abilities.slowMovement * 100)}% movement speed`);
            }
            if (config.abilities.ultraSlow && config.abilities.ultraSlow < 1) {
                abilities.push(`🐌 ${Math.floor(config.abilities.ultraSlow * 100)}% movement speed`);
            }
            if (config.abilities.noLuck) {
                abilities.push(`🚫 No luck bonus`);
            }
            if (config.abilities.hazardTriggerChance) {
                abilities.push(`⚠️ ${Math.floor(config.abilities.hazardTriggerChance * 100)}% hazard trigger chance`);
            }
            
            if (abilities.length > 0) {
                fields.push({
                    name: "✨ Special Abilities",
                    value: abilities.join('\n'),
                    inline: false
                });
            }
        }
        
        return await sendEmbed({
            title: `${config.displayIcon} Familiar Summoned!`,
            description: `**${member.displayName}** successfully summoned a **${config.name}**!\n\n${spawnResult.message}`,
            color: 0x00FF00,
            fields: fields
        });
        
    } catch (error) {
        console.error('[FAMILIAR] Error summoning familiar:', error);
        return await sendEmbed({
            title: "❌ Summoning Failed",
            description: "An error occurred while summoning your familiar!",
            color: 0xFF0000
        });
    }
}

module.exports = {
    execute
};
