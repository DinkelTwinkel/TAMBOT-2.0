// Inn Upgrade Listener - Global button listener for inn expansion
const { EmbedBuilder } = require('discord.js');
const ActiveVCs = require('../models/activevcs');

class InnUpgradeListener {
    constructor(client) {
        this.client = client;
        this.setupListener();
    }

    setupListener() {
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            
            // Check if interaction is too old (Discord interactions expire after 15 minutes)
            const interactionAge = Date.now() - interaction.createdTimestamp;
            if (interactionAge > 14 * 60 * 1000) { // 14 minutes to be safe
                console.warn(`[INN_UPGRADE_LISTENER] Ignoring old interaction (${Math.round(interactionAge / 1000)}s old)`);
                return;
            }
            
            // Handle inn expansion buttons
            if (interaction.customId.startsWith('inn_expand_')) {
                await this.handleInnUpgrade(interaction);
            }
        });
        
        console.log('[INN_UPGRADE_LISTENER] Inn upgrade listener initialized');
    }

    async handleInnUpgrade(interaction) {
        try {
            const channelId = interaction.channelId;
            console.log(`[InnUpgradeListener] Inn expansion button clicked for channel ${channelId}`);
            
            // Get current inn data
            const dbEntry = await ActiveVCs.findOne({ channelId });
            if (!dbEntry || !dbEntry.gameData?.v4State) {
                return await interaction.reply({ 
                    content: '❌ No inn data found for this channel!', 
                    ephemeral: true 
                });
            }
            
            const v4State = dbEntry.gameData.v4State;
            const currentReputation = v4State.innReputation || 0;
            
            // Check if expansion is available (reputation >= 10)
            if (currentReputation < 10) {
                return await interaction.reply({ 
                    content: `❌ Inn expansion requires at least 10 reputation! Current: ${currentReputation}/100`, 
                    ephemeral: true 
                });
            }
            
            // Get current dimensions
            const currentDimensions = v4State.innDimensions || { width: 10, height: 7, maxCustomers: 15 };
            const newWidth = currentDimensions.width + 1;
            const newHeight = currentDimensions.height + 1;
            
            // Calculate new max customers (60% of new floor tiles)
            const newFloorTiles = (newWidth - 2) * (newHeight - 2); // Interior tiles
            const newMaxCustomers = Math.floor(newFloorTiles * 0.6);
            
            const newDimensions = {
                width: newWidth,
                height: newHeight,
                maxCustomers: newMaxCustomers
            };
            
        // Perform expansion (costs 10 reputation)
        const newReputation = Math.max(0, currentReputation - 10);
        const updateResult = await ActiveVCs.findOneAndUpdate(
            { channelId },
            { 
                $set: { 
                    'gameData.v4State.innReputation': newReputation, // Deduct 10 reputation
                    'gameData.v4State.innDimensions': newDimensions
                }
            },
            { new: true }
        );
            
            if (!updateResult) {
                return await interaction.reply({ 
                    content: '❌ Failed to expand inn. Please try again.', 
                    ephemeral: true 
                });
            }
            
            // Create expansion notification embed
            const expansionEmbed = new EmbedBuilder()
                .setTitle('🏗️ Inn Expansion Complete!')
                .setColor('#00FF00')
                .setDescription(`The inn has been successfully expanded!`)
            .addFields(
                { name: '📏 New Dimensions', value: `${newWidth}×${newHeight} tiles`, inline: true },
                { name: '👥 New Capacity', value: `${newMaxCustomers} customers`, inline: true },
                { name: '⭐ Reputation Cost', value: `${currentReputation} → ${newReputation} (-10)`, inline: true },
                { name: '🎯 Next Expansion', value: 'Available at 10+ reputation', inline: false }
            )
                .setTimestamp();
            
            // Send ephemeral expansion confirmation
            await interaction.reply({ embeds: [expansionEmbed], ephemeral: true });
            
            // Add expansion notification to work log
            try {
                await this.addExpansionToWorkLog(interaction.channel, updateResult, newWidth, newHeight, currentReputation, newReputation);
            } catch (workLogError) {
                console.error('[InnUpgradeListener] Error adding expansion to work log:', workLogError);
            }
            
            console.log(`[InnUpgradeListener] Inn expanded from ${currentDimensions.width}×${currentDimensions.height} to ${newWidth}×${newHeight}, reputation cost: ${currentReputation} → ${newReputation} (-10)`);
            
        } catch (error) {
            console.error('[InnUpgradeListener] Error handling inn expansion:', error);
            await interaction.reply({ 
                content: '❌ An error occurred during inn expansion. Please try again.', 
                ephemeral: true 
            });
        }
    }

    /**
     * Add expansion notification to inn work log
     */
    async addExpansionToWorkLog(channel, dbEntry, newWidth, newHeight, oldReputation, newReputation) {
        try {
            const v4State = dbEntry.gameData?.v4State;
            if (!v4State) return;

            // Create expansion event
            const expansionEvent = {
                timestamp: Date.now(),
                eventNumber: (v4State.workEventCount || 0) + 1,
                description: `🏗️ Inn expanded to ${newWidth}×${newHeight}! Reputation: ${oldReputation} → ${newReputation} (-10)`,
                type: 'expansion',
                profit: 0,
                isExpansion: true
            };

            // Update work event count
            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                { 
                    $set: { 
                        'gameData.v4State.workEventCount': expansionEvent.eventNumber
                    }
                }
            );

            // Get the inn keeper controller to update work log
            const InnKeeperV4Controller = require('./gachaModes/innKeeper_v4').InnKeeperV4Controller;
            const innKeeperInstance = new InnKeeperV4Controller();
            
            // Get fresh database entry
            const freshDbEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
            
            // Update work log with expansion event
            await innKeeperInstance.updateWorkEventLog(channel, freshDbEntry, expansionEvent);
            
            console.log(`[InnUpgradeListener] Expansion notification added to work log for channel ${channel.id}`);
            
        } catch (error) {
            console.error('[InnUpgradeListener] Error adding expansion to work log:', error);
        }
    }
}

module.exports = InnUpgradeListener;
