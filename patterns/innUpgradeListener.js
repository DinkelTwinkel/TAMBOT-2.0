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
            
            // Handle inn level up buttons
            if (interaction.customId.startsWith('inn_levelup_')) {
                await this.handleInnLevelUp(interaction);
            }
            
            // Handle hire employee buttons
            if (interaction.customId.startsWith('inn_hire_employee_')) {
                await this.handleHireEmployee(interaction);
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

    /**
     * Handle inn level up button interactions
     */
    async handleInnLevelUp(interaction) {
        try {
            const channelId = interaction.channelId;
            console.log(`[InnUpgradeListener] Inn level up button clicked for channel ${channelId}`);
            
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
            
            // Check if level up is available (reputation >= 90)
            if (currentReputation < 90) {
                return await interaction.reply({ 
                    content: `❌ Inn level up requires at least 90 reputation! Current: ${currentReputation}/100`, 
                    ephemeral: true 
                });
            }
            
            // Get current inn configuration
            const gachaServersData = require('../data/gachaServers.json');
            const currentInn = gachaServersData.find(s => s.id === String(dbEntry.typeId));
            
            if (!currentInn) {
                return await interaction.reply({ 
                    content: '❌ Current inn configuration not found!', 
                    ephemeral: true 
                });
            }
            
            // Calculate new level and earnings
            const currentLevel = v4State.innLevel || 1;
            const newLevel = currentLevel + 1;
            const currentBaseEarnings = v4State.baseEarnings || currentInn.baseEarnings || 5;
            const newBaseEarnings = currentBaseEarnings + 2; // +2 coins per level
            
            // Perform level up
            const newReputation = Math.max(0, currentReputation - 90);
            const updateResult = await ActiveVCs.findOneAndUpdate(
                { channelId },
                { 
                    $set: { 
                        'gameData.v4State.innReputation': newReputation, // Deduct 90 reputation
                        'gameData.v4State.innLevel': newLevel, // Increase inn level
                        'gameData.v4State.baseEarnings': newBaseEarnings // Increase base earnings
                    }
                },
                { new: true }
            );
            
            if (!updateResult) {
                return await interaction.reply({ 
                    content: '❌ Failed to level up inn. Please try again.', 
                    ephemeral: true 
                });
            }
            
            // Update channel name with new level
            try {
                const baseName = currentInn.name.replace(/[^a-zA-Z0-9\s]/g, '').trim(); // Remove emojis and special chars
                const newChannelName = `${baseName}『 L${newLevel} 』`.toLowerCase().replace(/[^a-z0-9]/g, '-');
                await interaction.channel.setName(newChannelName);
                console.log(`[InnUpgradeListener] Channel name updated to ${newChannelName}`);
            } catch (nameError) {
                console.warn('[InnUpgradeListener] Failed to update channel name:', nameError.message);
            }
            
            // Create level up notification embed
            const levelUpEmbed = new EmbedBuilder()
                .setTitle('⬆️ Inn Level Up Complete!')
                .setColor('#9B59B6')
                .setDescription(`${currentInn.name} has been leveled up!`)
                .addFields(
                    { name: '📈 Inn Level', value: `L${currentLevel} → L${newLevel}`, inline: true },
                    { name: '💰 Base Earnings', value: `${currentBaseEarnings} → ${newBaseEarnings} coins (+2)`, inline: true },
                    { name: '⭐ Reputation Cost', value: `${currentReputation} → ${newReputation} (-90)`, inline: true },
                    { name: '🎯 Benefits', value: 'Higher customer wealth and order values!', inline: false }
                )
                .setTimestamp();
            
            // Send ephemeral level up confirmation
            await interaction.reply({ embeds: [levelUpEmbed], ephemeral: true });
            
            // Add level up notification to work log
            try {
                await this.addLevelUpToWorkLog(interaction.channel, updateResult, currentInn, currentLevel, newLevel, currentBaseEarnings, newBaseEarnings, currentReputation, newReputation);
            } catch (workLogError) {
                console.error('[InnUpgradeListener] Error adding level up to work log:', workLogError);
            }
            
            console.log(`[InnUpgradeListener] ${currentInn.name} leveled up from L${currentLevel} to L${newLevel}, base earnings: ${currentBaseEarnings} → ${newBaseEarnings}, reputation cost: ${currentReputation} → ${newReputation} (-90)`);
            
        } catch (error) {
            console.error('[InnUpgradeListener] Error handling inn level up:', error);
            await interaction.reply({ 
                content: '❌ An error occurred during inn level up. Please try again.', 
                ephemeral: true 
            });
        }
    }

    /**
     * Add level up notification to inn work log
     */
    async addLevelUpToWorkLog(channel, dbEntry, inn, oldLevel, newLevel, oldEarnings, newEarnings, oldReputation, newReputation) {
        try {
            const v4State = dbEntry.gameData?.v4State;
            if (!v4State) return;

            // Create level up event
            const levelUpEvent = {
                timestamp: Date.now(),
                eventNumber: (v4State.workEventCount || 0) + 1,
                description: `⬆️ ${inn.name} leveled up to L${newLevel}! Base earnings: ${oldEarnings} → ${newEarnings} coins (+2)`,
                type: 'levelup',
                profit: 0,
                isLevelUp: true
            };

            // Update work event count
            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                { 
                    $set: { 
                        'gameData.v4State.workEventCount': levelUpEvent.eventNumber
                    }
                }
            );

            // Get the inn keeper controller to update work log
            const InnKeeperV4Controller = require('./gachaModes/innKeeper_v4').InnKeeperV4Controller;
            const innKeeperInstance = new InnKeeperV4Controller();
            
            // Get fresh database entry
            const freshDbEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
            
            // Update work log with level up event
            await innKeeperInstance.updateWorkEventLog(channel, freshDbEntry, levelUpEvent);
            
            console.log(`[InnUpgradeListener] Level up notification added to work log for channel ${channel.id}`);
            
        } catch (error) {
            console.error('[InnUpgradeListener] Error adding level up to work log:', error);
        }
    }

    /**
     * Handle hire employee button interaction
     */
    async handleHireEmployee(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const channelId = interaction.customId.replace('inn_hire_employee_', '');
            const channel = interaction.channel;
            
            // Get current inn state
            const dbEntry = await ActiveVCs.findOne({ channelId: channelId }).lean();
            if (!dbEntry || dbEntry.gameData?.gamemode !== 'innkeeper_v4') {
                await interaction.editReply({ content: '❌ This is not an active inn channel!' });
                return;
            }

            const v4State = dbEntry.gameData.v4State;
            const baseEarnings = v4State.baseEarnings || 5;
            const hireCost = baseEarnings * 10;
            const currentEmployees = v4State.employeeCount || 0;

            // Check if player has enough money
            const Currency = require('../models/currency');
            const playerMoney = await Currency.findOne({ userId: interaction.user.id });
            const currentMoney = playerMoney?.money || 0;

            if (currentMoney < hireCost) {
                await interaction.editReply({ 
                    content: `❌ You need ${hireCost} coins to hire an employee! You have ${currentMoney} coins.` 
                });
                return;
            }

            // Deduct money and hire employee
            await Currency.findOneAndUpdate(
                { userId: interaction.user.id },
                { 
                    $inc: { money: -hireCost },
                    $set: { usertag: interaction.user.tag }
                },
                { upsert: true }
            );

            // Increase employee count
            await ActiveVCs.findOneAndUpdate(
                { channelId: channelId },
                { $inc: { 'gameData.v4State.employeeCount': 1 } }
            );

            const newEmployeeCount = currentEmployees + 1;
            
            await interaction.editReply({ 
                content: `✅ Successfully hired an employee! 
                
**Cost:** ${hireCost} coins
**New Employee Count:** ${newEmployeeCount}
**Service Bonus:** +4 sight, +4 speed towards customer satisfaction
**Wage:** ${baseEarnings} coins per profit distribution

Your remaining balance: ${currentMoney - hireCost} coins` 
            });

            // Add hire event to work log
            try {
                const hireEvent = {
                    timestamp: Date.now(),
                    eventNumber: (v4State.workEventCount || 0) + 1,
                    description: `${interaction.user.username} hired employee #${newEmployeeCount} for ${hireCost} coins`,
                    type: 'hire_employee',
                    profit: 0
                };

                // Import InnKeeperV4Controller to update work log
                const { InnKeeperV4Controller } = require('./gachaModes/innKeeper_v4');
                const innKeeperInstance = new InnKeeperV4Controller();
                
                // Get fresh database entry
                const freshDbEntry = await ActiveVCs.findOne({ channelId: channelId }).lean();
                
                // Update work log with hire event
                await innKeeperInstance.updateWorkEventLog(channel, freshDbEntry, hireEvent);
                
                console.log(`[InnUpgradeListener] Employee hire notification added to work log for channel ${channelId}`);
                
            } catch (workLogError) {
                console.error('[InnUpgradeListener] Error adding hire to work log:', workLogError);
            }
            
            console.log(`[InnUpgradeListener] Employee hired by ${interaction.user.username} in channel ${channelId}. Cost: ${hireCost}, New count: ${newEmployeeCount}`);
            
        } catch (error) {
            console.error('[InnUpgradeListener] Error handling employee hire:', error);
            await interaction.editReply({ 
                content: '❌ An error occurred while hiring the employee. Please try again.', 
            });
        }
    }
}

module.exports = InnUpgradeListener;
