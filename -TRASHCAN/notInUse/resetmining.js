// resetmining.js - Admin command to completely reset a mining channel's data

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Import all the systems we need to clear
const gachaVC = require('../models/activevcs');
const mapCacheSystem = require('../patterns/gachaModes/mining/cache/mapCacheSystem');
const hazardStorage = require('../patterns/gachaModes/mining/hazardStorage');
const railStorage = require('../patterns/gachaModes/mining/railStorage');
const instanceManager = require('../patterns/gachaModes/instance-manager');

// Import cache systems if available
let visibilityCalculator, batchDB;
try {
    const perfModule = require('../patterns/gachaModes/mining/miningPerformance');
    visibilityCalculator = perfModule.visibilityCalculator;
    batchDB = perfModule.batchDB;
} catch (e) {
    console.log('[RESET] Some performance modules not available');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetmining')
        .setDescription('Completely reset a mining channel (Admin only)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The voice channel to reset')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('confirm')
                .setDescription('Confirm you want to delete ALL data for this channel')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // Check if user is admin
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '❌ This command requires Administrator permissions!', 
                ephemeral: true 
            });
        }

        const channel = interaction.options.getChannel('channel');
        const confirmed = interaction.options.getBoolean('confirm');

        if (!confirmed) {
            return interaction.reply({
                content: '❌ You must confirm the reset by setting confirm to True!',
                ephemeral: true
            });
        }

        if (!channel.isVoiceBased()) {
            return interaction.reply({
                content: '❌ Please select a voice channel!',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: false });

        const resetLog = [];
        let errorCount = 0;

        try {
            // Step 1: Force kill any active instances
            resetLog.push('🔧 Killing active instances...');
            try {
                instanceManager.forceKillChannel(channel.id);
                
                // Also try to clear concurrency locks if available
                if (global.concurrencyManager) {
                    global.concurrencyManager.forceUnlock(channel.id);
                    global.concurrencyManager.clearAllIntervalsForChannel(channel.id);
                }
                resetLog.push('✅ Instances killed');
            } catch (error) {
                resetLog.push('⚠️ Error killing instances: ' + error.message);
                errorCount++;
            }

            // Step 2: Clear map cache
            resetLog.push('🗺️ Clearing map cache...');
            try {
                mapCacheSystem.clearChannel(channel.id);
                await mapCacheSystem.forceFlush();
                resetLog.push('✅ Map cache cleared');
            } catch (error) {
                resetLog.push('⚠️ Error clearing map cache: ' + error.message);
                errorCount++;
            }

            // Step 3: Clear hazard data
            resetLog.push('⚠️ Clearing hazard data...');
            try {
                await hazardStorage.clearHazardsData(channel.id);
                resetLog.push('✅ Hazard data cleared');
            } catch (error) {
                resetLog.push('⚠️ Error clearing hazards: ' + error.message);
                errorCount++;
            }

            // Step 4: Clear rail data
            resetLog.push('🛤️ Clearing rail data...');
            try {
                await railStorage.clearRailsData(channel.id);
                resetLog.push('✅ Rail data cleared');
            } catch (error) {
                resetLog.push('⚠️ Error clearing rails: ' + error.message);
                errorCount++;
            }

            // Step 5: Clear global caches
            resetLog.push('💾 Clearing global caches...');
            try {
                // Clear dbCache
                if (global.dbCache) {
                    global.dbCache.delete(channel.id);
                }
                
                // Clear efficiency cache
                if (global.efficiencyCache) {
                    global.efficiencyCache.clear();
                }
                
                // Clear visibility calculator
                if (visibilityCalculator) {
                    visibilityCalculator.invalidate();
                }
                
                // Flush batch DB
                if (batchDB) {
                    await batchDB.flush();
                }
                
                resetLog.push('✅ Global caches cleared');
            } catch (error) {
                resetLog.push('⚠️ Error clearing global caches: ' + error.message);
                errorCount++;
            }

            // Step 6: Get current database entry for backup/info
            resetLog.push('📊 Fetching current data...');
            const currentEntry = await gachaVC.findOne({ channelId: channel.id });
            
            let backupInfo = null;
            if (currentEntry && currentEntry.gameData) {
                backupInfo = {
                    gamemode: currentEntry.gameData.gamemode,
                    hasMap: !!currentEntry.gameData.map,
                    hasMinecart: !!currentEntry.gameData.minecart,
                    minecartItems: currentEntry.gameData.minecart?.items ? 
                        Object.keys(currentEntry.gameData.minecart.items).length : 0,
                    cycleCount: currentEntry.gameData.cycleCount || 0,
                    inBreak: currentEntry.gameData.breakInfo?.inBreak || false,
                    nextShopRefresh: currentEntry.nextShopRefresh
                };
                resetLog.push(`✅ Found existing data: ${backupInfo.gamemode || 'unknown'} mode`);
            } else {
                resetLog.push('ℹ️ No existing game data found');
            }

            // Step 7: Delete the database entry
            resetLog.push('🗑️ Deleting database entry...');
            const deleteResult = await gachaVC.deleteOne({ channelId: channel.id });
            if (deleteResult.deletedCount > 0) {
                resetLog.push('✅ Database entry deleted');
            } else {
                resetLog.push('ℹ️ No database entry to delete');
            }

            // Step 8: Clear any shadow clone data
            try {
                const shadowCloneSystem = require('../patterns/gachaModes/mining/shadowCloneSystem');
                if (shadowCloneSystem && shadowCloneSystem.activeShadowClones) {
                    // Clear shadow clones for all players in this channel
                    const members = channel.members.filter(m => !m.user.bot);
                    for (const member of members.values()) {
                        shadowCloneSystem.activeShadowClones.delete(member.id);
                    }
                    resetLog.push('✅ Shadow clone data cleared');
                }
            } catch (error) {
                // Shadow clone system might not be available
            }

            // Step 9: Clear health metrics if available
            try {
                if (global.healthMetrics) {
                    global.healthMetrics.lastProcessed.delete(channel.id);
                    global.healthMetrics.processingErrors.delete(channel.id);
                    global.healthMetrics.averageProcessingTime.delete(channel.id);
                    global.healthMetrics.stuckChannels.delete(channel.id);
                }
                resetLog.push('✅ Health metrics cleared');
            } catch (error) {
                // Health metrics might not be available
            }

            // Step 10: Create summary embed
            const embed = new EmbedBuilder()
                .setTitle('🔄 Mining Channel Reset Complete')
                .setColor(errorCount > 0 ? 0xFFFF00 : 0x00FF00)
                .setDescription(`Channel <#${channel.id}> has been reset!`)
                .addFields(
                    {
                        name: '📋 Reset Log',
                        value: resetLog.join('\n').substring(0, 1024)
                    }
                );

            if (backupInfo) {
                embed.addFields({
                    name: '📊 Previous Data',
                    value: [
                        `**Mode:** ${backupInfo.gamemode || 'None'}`,
                        `**Cycle:** ${backupInfo.cycleCount}`,
                        `**Minecart Items:** ${backupInfo.minecartItems}`,
                        `**Was in Break:** ${backupInfo.inBreak ? 'Yes' : 'No'}`
                    ].join('\n'),
                    inline: true
                });
            }

            embed.addFields({
                name: '✅ Result',
                value: errorCount > 0 ? 
                    `Reset completed with ${errorCount} warnings (non-critical)` :
                    'All data successfully cleared!',
                inline: true
            });

            embed.setFooter({
                text: `Reset by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            });
            embed.setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Log to console for debugging
            console.log(`[RESET] Channel ${channel.id} reset by ${interaction.user.tag}`);
            console.log('[RESET] Log:', resetLog);

        } catch (error) {
            console.error('[RESET] Critical error:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Reset Failed')
                .setColor(0xFF0000)
                .setDescription(`Failed to reset channel <#${channel.id}>`)
                .addFields(
                    {
                        name: 'Error',
                        value: `\`\`\`${error.message}\`\`\``
                    },
                    {
                        name: 'Partial Log',
                        value: resetLog.join('\n').substring(0, 1024) || 'No log available'
                    }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};
