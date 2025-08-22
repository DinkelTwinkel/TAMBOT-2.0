// patterns/gachaModes/mining/maintenanceDisplay.js
// Display system for legendary item maintenance in mining

const { EmbedBuilder } = require('discord.js');
const { getUniqueItemById } = require('../../../data/uniqueItemsSheet');
const { checkMaintenanceStatus } = require('../../uniqueItemMaintenance');

/**
 * Create an embed showing legendary item maintenance status
 * @param {string} playerId - Discord user ID
 * @param {string} playerName - Display name
 * @returns {Promise<EmbedBuilder>} Discord embed with maintenance info
 */
async function createMaintenanceEmbed(playerId, playerName) {
    try {
        const statuses = await checkMaintenanceStatus(playerId);
        
        if (statuses.length === 0) {
            return new EmbedBuilder()
                .setTitle('⚒️ Legendary Item Maintenance')
                .setDescription(`${playerName} has no legendary items requiring maintenance.`)
                .setColor(0x808080)
                .setTimestamp();
        }
        
        const embed = new EmbedBuilder()
            .setTitle('⚒️ Legendary Item Maintenance')
            .setDescription(`Maintenance status for ${playerName}'s legendary items`)
            .setColor(0xFFD700)
            .setTimestamp();
        
        for (const item of statuses) {
            // Calculate maintenance percentage
            const maintenancePercent = Math.round((item.maintenanceLevel / item.maxLevel) * 100);
            
            // Create maintenance bar visual
            const barLength = 10;
            const filledBars = Math.round((item.maintenanceLevel / item.maxLevel) * barLength);
            const emptyBars = barLength - filledBars;
            
            let barColor = '🟩'; // Green
            if (maintenancePercent <= 30) barColor = '🟥'; // Red
            else if (maintenancePercent <= 60) barColor = '🟨'; // Yellow
            
            const maintenanceBar = barColor.repeat(filledBars) + '⬜'.repeat(emptyBars);
            
            // Format maintenance requirement
            let requirementText = '';
            switch (item.maintenanceType) {
                case 'coins':
                    requirementText = `💰 ${item.maintenanceCost} coins per maintenance`;
                    break;
                case 'mining_activity':
                    const miningProgress = item.activityProgress.mining || 0;
                    requirementText = `⛏️ Mine ${item.maintenanceCost} blocks (${miningProgress}/${item.maintenanceCost})`;
                    break;
                case 'voice_activity':
                    const voiceProgress = item.activityProgress.voice || 0;
                    requirementText = `🎤 ${item.maintenanceCost} minutes in voice (${voiceProgress}/${item.maintenanceCost})`;
                    break;
                case 'combat_activity':
                    const combatProgress = item.activityProgress.combat || 0;
                    requirementText = `⚔️ Win ${item.maintenanceCost} battles (${combatProgress}/${item.maintenanceCost})`;
                    break;
                case 'social_activity':
                    const socialProgress = item.activityProgress.social || 0;
                    requirementText = `💬 ${item.maintenanceCost} social interactions (${socialProgress}/${item.maintenanceCost})`;
                    break;
                case 'movement_activity':
                    const movementProgress = item.activityProgress.movement || 0;
                    requirementText = `👟 Move ${item.maintenanceCost} tiles in mining (${movementProgress}/${item.maintenanceCost})`;
                    break;
                case 'wealthiest':
                    requirementText = `👑 Must remain the wealthiest player`;
                    break;
                default:
                    requirementText = item.description;
            }
            
            // Calculate time until next check
            let nextCheckText = '';
            if (item.nextCheck) {
                const hoursUntilCheck = Math.max(0, Math.floor((new Date(item.nextCheck) - Date.now()) / (1000 * 60 * 60)));
                nextCheckText = `\n⏰ Next check in ${hoursUntilCheck}h`;
            }
            
            // Add warning if maintenance is critical
            let warningText = '';
            if (maintenancePercent <= 30) {
                warningText = '\n⚠️ **CRITICAL** - Item will be lost if not maintained!';
            } else if (maintenancePercent <= 60) {
                warningText = '\n⚠️ Low maintenance - effects reduced';
            }
            
            embed.addFields({
                name: `${item.name}`,
                value: `${maintenanceBar} ${maintenancePercent}%\n${requirementText}${nextCheckText}${warningText}`,
                inline: false
            });
        }
        
        // Add helpful footer
        embed.setFooter({
            text: 'Legendary items lose effectiveness without maintenance. At 0%, they become unusable until found again!'
        });
        
        return embed;
        
    } catch (error) {
        console.error('[MAINTENANCE] Error creating maintenance embed:', error);
        return new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Failed to fetch maintenance status')
            .setColor(0xFF0000);
    }
}

/**
 * Get maintenance warning messages for low maintenance items
 * @param {string} playerId - Discord user ID
 * @returns {Promise<string[]>} Array of warning messages
 */
async function getMaintenanceWarnings(playerId) {
    try {
        const statuses = await checkMaintenanceStatus(playerId);
        const warnings = [];
        
        for (const item of statuses) {
            const maintenancePercent = Math.round((item.maintenanceLevel / item.maxLevel) * 100);
            
            if (maintenancePercent <= 20) {
                warnings.push(`⚠️ **${item.name}** is at critical maintenance (${maintenancePercent}%)!`);
            } else if (maintenancePercent <= 50) {
                warnings.push(`⚠️ **${item.name}** needs maintenance (${maintenancePercent}%)`);
            }
        }
        
        return warnings;
        
    } catch (error) {
        console.error('[MAINTENANCE] Error getting warnings:', error);
        return [];
    }
}

/**
 * Apply maintenance effects to mining results
 * @param {Object} miningResult - Result from mining action
 * @param {number} maintenanceRatio - Maintenance ratio (0-1)
 * @param {string} itemName - Name of the legendary item
 * @returns {Object} Modified mining result
 */
function applyMaintenanceEffects(miningResult, maintenanceRatio, itemName) {
    if (maintenanceRatio >= 0.8) {
        // Full effectiveness
        return miningResult;
    } else if (maintenanceRatio >= 0.5) {
        // Reduced effectiveness
        miningResult.quantity = Math.ceil(miningResult.quantity * 0.75);
        miningResult.message = `${miningResult.message} (${itemName} at ${Math.round(maintenanceRatio * 100)}% power)`;
    } else if (maintenanceRatio >= 0.2) {
        // Heavily reduced
        miningResult.quantity = Math.ceil(miningResult.quantity * 0.5);
        miningResult.message = `${miningResult.message} (${itemName} barely functioning at ${Math.round(maintenanceRatio * 100)}%)`;
    } else {
        // Critical - almost no effect
        miningResult.quantity = Math.ceil(miningResult.quantity * 0.25);
        miningResult.message = `${miningResult.message} (${itemName} failing at ${Math.round(maintenanceRatio * 100)}%!)`;
    }
    
    return miningResult;
}

/**
 * Check if a legendary item should display maintenance reminder
 * @param {Object} uniqueItem - Unique item from equipped items
 * @returns {boolean} Whether to show reminder
 */
function shouldShowMaintenanceReminder(uniqueItem) {
    if (!uniqueItem.maintenanceRatio) return false;
    
    // Show reminder if below 50% maintenance
    return uniqueItem.maintenanceRatio < 0.5;
}

/**
 * Format maintenance status for item tooltip
 * @param {Object} uniqueItem - Unique item from equipped items
 * @returns {string} Formatted maintenance status
 */
function formatMaintenanceTooltip(uniqueItem) {
    if (!uniqueItem.maintenanceRatio) return '';
    
    const percent = Math.round(uniqueItem.maintenanceRatio * 100);
    const level = uniqueItem.maintenanceLevel || Math.round(uniqueItem.maintenanceRatio * 10);
    
    let status = '';
    if (percent >= 80) {
        status = '✅ Excellent';
    } else if (percent >= 60) {
        status = '🟡 Good';
    } else if (percent >= 40) {
        status = '🟠 Fair';
    } else if (percent >= 20) {
        status = '🔴 Poor';
    } else {
        status = '💀 Critical';
    }
    
    return `Maintenance: ${status} (${level}/10)`;
}

module.exports = {
    createMaintenanceEmbed,
    getMaintenanceWarnings,
    applyMaintenanceEffects,
    shouldShowMaintenanceReminder,
    formatMaintenanceTooltip
};
