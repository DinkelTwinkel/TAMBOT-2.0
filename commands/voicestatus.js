const { SlashCommandBuilder } = require('discord.js');
const { tracker } = require('../trackingIntegration');
const { checkMaintenanceStatus } = require('../patterns/uniqueItemMaintenance');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voicestatus')
        .setDescription('Check your voice tracking status for unique items maintenance'),
    
    async execute(interaction) {
        await interaction.deferReply({ephemeral: true});
        
        const userId = interaction.user.id;
        const username = interaction.user.username;
        
        try {
            // Check if user is currently in voice
            const activeSession = tracker.voiceSessions.get(userId);
            let currentSessionInfo = '';
            
            if (activeSession) {
                const duration = Math.floor((new Date() - activeSession.joinTime) / 1000);
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                currentSessionInfo = `\n🎤 **Currently in voice:** ${activeSession.channelName}\n⏱️ **Session duration:** ${minutes}m ${seconds}s\n`;
            }
            
            // Get overall voice stats
            const stats = await tracker.getUserStats(userId, interaction.guild.id);
            let overallStats = '';
            
            if (stats) {
                overallStats = `\n📊 **Total Voice Stats:**\n`;
                overallStats += `• Total time: ${stats.formattedVoiceTime}\n`;
                overallStats += `• Total hours: ${stats.totalVoiceHours}h\n`;
                overallStats += `• Voice joins: ${stats.totalVoiceJoins}\n`;
            }
            
            // Check unique items maintenance status
            const maintenanceStatuses = await checkMaintenanceStatus(userId);
            let uniqueItemsInfo = '';
            
            if (maintenanceStatuses.length > 0) {
                uniqueItemsInfo = '\n🎁 **Unique Items Voice Requirements:**\n';
                
                for (const item of maintenanceStatuses) {
                    if (item.maintenanceType === 'voice_activity') {
                        const progress = item.activityProgress.voice || 0;
                        const requirement = item.maintenanceCost || 0;
                        const percentage = requirement > 0 ? Math.min(100, Math.floor((progress / requirement) * 100)) : 0;
                        const progressBar = createProgressBar(percentage);
                        
                        uniqueItemsInfo += `\n**${item.name}**\n`;
                        uniqueItemsInfo += `${progressBar} ${progress}/${requirement} minutes (${percentage}%)\n`;
                        uniqueItemsInfo += `Maintenance Level: ${item.maintenanceLevel}/10\n`;
                    }
                }
                
                if (!uniqueItemsInfo.includes('minutes')) {
                    uniqueItemsInfo = '\n✨ Your unique items don\'t require voice activity maintenance.\n';
                }
            } else {
                uniqueItemsInfo = '\n💎 You don\'t currently own any unique items.\n';
            }
            
            // Build the response
            let response = `## Voice Tracking Status for ${username}\n`;
            response += currentSessionInfo;
            response += overallStats;
            response += uniqueItemsInfo;
            response += '\n*Voice time updates every 5 minutes for unique items maintenance.*';
            
            await interaction.editReply(response);
            
        } catch (error) {
            console.error('Error in voicestatus command:', error);
            await interaction.editReply('❌ An error occurred while checking your voice status.');
        }
    }
};

function createProgressBar(percentage) {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}]`;
}