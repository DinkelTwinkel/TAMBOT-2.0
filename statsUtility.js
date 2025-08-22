// Utility functions for easily pulling tracking data
// Import this in your index.js or wherever you need stats

const StatTracker = require('./patterns/statTracking');

class StatsUtility {
    constructor(mongoUri) {
        this.tracker = new StatTracker(mongoUri);
        this.connected = false;
    }

    async connect() {
        if (!this.connected) {
            await this.tracker.connect();
            this.connected = true;
        }
    }

    // =============== MAIN QUERY FUNCTIONS ===============

    /**
     * Get total VC joins for a guild
     * @param {string} guildId - Discord guild ID
     * @returns {number} Total number of voice channel joins
     */
    async getTotalVCJoins(guildId) {
        await this.connect();
        return await this.tracker.getTotalVCJoins(guildId);
    }

    /**
     * Get average hours spent by all users in voice channels
     * @param {string} guildId - Discord guild ID
     * @returns {object} { averageHours, totalHours, userCount }
     */
    async getAverageHoursSpent(guildId) {
        await this.connect();
        return await this.tracker.getAverageHoursSpent(guildId);
    }

    /**
     * Get count of unique users
     * @param {string} guildId - Discord guild ID
     * @returns {number} Number of unique users tracked
     */
    async getUniqueUsers(guildId) {
        await this.connect();
        return await this.tracker.getUniqueUsers(guildId);
    }

    /**
     * Get total hours of all users combined
     * @param {string} guildId - Discord guild ID
     * @returns {string} Total hours formatted to 2 decimal places
     */
    async getTotalHoursAllUsers(guildId) {
        await this.connect();
        return await this.tracker.getTotalHours(guildId);
    }

    /**
     * Get total messages sent in the guild
     * @param {string} guildId - Discord guild ID
     * @returns {number} Total number of messages
     */
    async getTotalMessagesSent(guildId) {
        await this.connect();
        return await this.tracker.getTotalMessages(guildId);
    }

    /**
     * Get each user's hours spent in voice channels
     * @param {string} guildId - Discord guild ID
     * @param {number} limit - Optional limit for number of users (null for all)
     * @returns {Array} Array of user objects with voice time data
     */
    async getEachUserHoursInVC(guildId, limit = null) {
        await this.connect();
        return await this.tracker.getUserVoiceHours(guildId, limit);
    }

    // =============== COMBINED STATS FUNCTIONS ===============

    /**
     * Get all requested stats in one call
     * @param {string} guildId - Discord guild ID
     * @returns {object} Complete stats object
     */
    async getAllStats(guildId) {
        await this.connect();
        
        const [
            totalVCJoins,
            averageHours,
            uniqueUsers,
            totalHours,
            totalMessages,
            userHours
        ] = await Promise.all([
            this.getTotalVCJoins(guildId),
            this.getAverageHoursSpent(guildId),
            this.getUniqueUsers(guildId),
            this.getTotalHoursAllUsers(guildId),
            this.getTotalMessagesSent(guildId),
            this.getEachUserHoursInVC(guildId, 20) // Top 20 users
        ]);

        return {
            totalVCJoins,
            uniqueUsers,
            totalMessages,
            totalHoursAllUsers: totalHours,
            averageHoursPerUser: averageHours.averageHours,
            activeVoiceUsers: averageHours.userCount,
            topUsersByVoiceTime: userHours
        };
    }

    /**
     * Get formatted stats report as text
     * @param {string} guildId - Discord guild ID
     * @returns {string} Formatted stats report
     */
    async getFormattedReport(guildId) {
        await this.connect();
        const stats = await this.getAllStats(guildId);
        
        let report = '📊 **SERVER STATISTICS REPORT**\n';
        report += '================================\n\n';
        
        report += '**Overall Stats:**\n';
        report += `• Unique Users: ${stats.uniqueUsers}\n`;
        report += `• Total Messages: ${stats.totalMessages.toLocaleString()}\n`;
        report += `• Total VC Joins: ${stats.totalVCJoins.toLocaleString()}\n`;
        report += `• Total Voice Hours: ${stats.totalHoursAllUsers}h\n`;
        report += `• Average Hours per User: ${stats.averageHoursPerUser}h\n`;
        report += `• Active Voice Users: ${stats.activeVoiceUsers}\n\n`;
        
        report += '**Top 10 Voice Users:**\n';
        stats.topUsersByVoiceTime.slice(0, 10).forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            report += `${medal} ${user.username}: ${user.hours}h (${user.formatted})\n`;
        });
        
        return report;
    }

    // =============== SPECIAL QUERY FUNCTIONS ===============

    /**
     * Get stats for a specific user
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Discord guild ID
     * @returns {object} User stats object
     */
    async getUserStats(userId, guildId) {
        await this.connect();
        return await this.tracker.getUserStats(userId, guildId);
    }

    /**
     * Get stats for a date range
     * @param {string} guildId - Discord guild ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {object} Stats for the date range
     */
    async getDateRangeStats(guildId, startDate, endDate) {
        await this.connect();
        return await this.tracker.getDateRangeStats(guildId, startDate, endDate);
    }

    /**
     * Get today's stats
     * @param {string} guildId - Discord guild ID
     * @returns {object} Today's stats
     */
    async getTodayStats(guildId) {
        const today = new Date().toISOString().split('T')[0];
        return await this.getDateRangeStats(guildId, today, today);
    }

    /**
     * Get this week's stats
     * @param {string} guildId - Discord guild ID
     * @returns {object} This week's stats
     */
    async getWeekStats(guildId) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        
        return await this.getDateRangeStats(
            guildId,
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );
    }

    /**
     * Get this month's stats
     * @param {string} guildId - Discord guild ID
     * @returns {object} This month's stats
     */
    async getMonthStats(guildId) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(1); // First day of month
        
        return await this.getDateRangeStats(
            guildId,
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );
    }

    // =============== UTILITY FUNCTIONS ===============

    /**
     * Export all stats data for backup
     * @param {string} guildId - Discord guild ID
     * @returns {object} Complete export of all stats data
     */
    async exportStats(guildId) {
        await this.connect();
        return await this.tracker.exportStats(guildId);
    }

    /**
     * Clean up old voice sessions
     * @param {number} daysOld - Days to keep (default 30)
     * @returns {number} Number of sessions cleaned
     */
    async cleanupOldSessions(daysOld = 30) {
        await this.connect();
        return await this.tracker.cleanupOldSessions(daysOld);
    }

    /**
     * Disconnect from database
     */
    async disconnect() {
        if (this.connected) {
            await this.tracker.disconnect();
            this.connected = false;
        }
    }
}

// Example usage in your index.js:
/*
const StatsUtility = require('./statsUtility');
const stats = new StatsUtility(process.env.MONGODB_URI);

// In a command handler:
client.on('messageCreate', async (message) => {
    if (message.content === '!fullstats') {
        const report = await stats.getFormattedReport(message.guild.id);
        message.channel.send(report);
    }
    
    if (message.content === '!vcstats') {
        const totalJoins = await stats.getTotalVCJoins(message.guild.id);
        const totalHours = await stats.getTotalHoursAllUsers(message.guild.id);
        const avgHours = await stats.getAverageHoursSpent(message.guild.id);
        
        message.reply(`VC Stats:\n• Total Joins: ${totalJoins}\n• Total Hours: ${totalHours}\n• Average Hours: ${avgHours.averageHours}`);
    }
    
    if (message.content === '!topusers') {
        const topUsers = await stats.getEachUserHoursInVC(message.guild.id, 5);
        let response = 'Top 5 Voice Users:\n';
        topUsers.forEach((user, i) => {
            response += `${i+1}. ${user.username}: ${user.hours}h\n`;
        });
        message.reply(response);
    }
});
*/

module.exports = StatsUtility;
