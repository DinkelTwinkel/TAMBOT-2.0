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
        
        return await sendEmbed({
            title: `${familiarSystem.FAMILIAR_CONFIGS[familiarType].displayIcon} Familiar Summoned!`,
            description: spawnResult.message,
            color: 0x00FF00,
            fields: [
                {
                    name: "Duration",
                    value: familiarSystem.FAMILIAR_CONFIGS[familiarType].duration ? 
                        `${Math.floor(familiarSystem.FAMILIAR_CONFIGS[familiarType].duration / 60000)} minutes` : 
                        "Permanent (while you have the required item)",
                    inline: true
                },
                {
                    name: "Mining Power",
                    value: familiarSystem.FAMILIAR_CONFIGS[familiarType].statMultiplier ? 
                        `${Math.floor(familiarSystem.FAMILIAR_CONFIGS[familiarType].statMultiplier * 100)}% of your stats` :
                        `${familiarSystem.FAMILIAR_CONFIGS[familiarType].baseStats.mining} mining power`,
                    inline: true
                }
            ]
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
