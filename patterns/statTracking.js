const mongoose = require('mongoose');
const { 
    UserStats, 
    DailyStats, 
    VoiceSession, 
    MessageActivity, 
    ServerStats 
} = require('../models/statsSchema');

class StatTracker {
    constructor() {
        this.voiceSessions = new Map(); // Track active voice sessions in memory
    }

    // Use existing MongoDB connection
    async initialize() {
        try {
            // Check if already connected
            if (mongoose.connection.readyState === 1) {
                console.log('✅ Stat tracking initialized with existing MongoDB connection');
                // Recover any active sessions from previous bot instance
                await this.recoverActiveSessions();
                return true;
            } else {
                console.log('⏳ Waiting for MongoDB connection...');
                return false;
            }
        } catch (error) {
            console.error('❌ Error initializing stat tracking:', error);
            return false;
        }
    }

    // =============== VOICE TRACKING ===============

    // Start tracking voice session
    async startVoiceSession(userId, channelId, guildId, username = null, channelName = null, guildName = null) {
        try {
            const joinTime = new Date();
            
            // Store in memory for quick access
            this.voiceSessions.set(userId, {
                channelId,
                guildId,
                joinTime,
                username,
                channelName,
                guildName
            });

            // Create voice session in database
            const session = new VoiceSession({
                userId,
                username,
                channelId,
                channelName,
                guildId,
                guildName,
                joinTime,
                isActive: true
            });
            await session.save();

            // Update user stats for join count
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                { 
                    $inc: { totalVoiceJoins: 1 },
                    $set: { 
                        username: username || 'Unknown',
                        lastSeen: new Date(),
                        lastUpdated: new Date()
                    }
                },
                { upsert: true, new: true }
            );

            // Update daily stats for joins
            const today = new Date().toISOString().split('T')[0];
            await DailyStats.findOneAndUpdate(
                { userId, guildId, date: today },
                { 
                    $inc: { voiceJoins: 1 },
                    $set: { username: username || 'Unknown' },
                    $addToSet: { 'channels.voice': channelId }
                },
                { upsert: true, new: true }
            );

            // Update server stats
            await this.updateServerStats(guildId, guildName, 'voiceJoin', userId);

            console.log(`📊 Started voice session for ${username || userId} in ${channelName || channelId}`);
            return session._id;
        } catch (error) {
            console.error('Error starting voice session:', error);
        }
    }

    // End voice session and calculate duration
    async endVoiceSession(userId) {
        try {
            const session = this.voiceSessions.get(userId);
            if (!session) {
                // Try to recover from database
                return await this.recoverAndEndVoiceSession(userId);
            }

            const leaveTime = new Date();
            const duration = Math.floor((leaveTime - session.joinTime) / 1000); // Duration in seconds
            
            // Remove from memory
            this.voiceSessions.delete(userId);

            // Update session in database
            await VoiceSession.findOneAndUpdate(
                { userId, isActive: true },
                {
                    $set: {
                        leaveTime,
                        duration,
                        isActive: false
                    }
                },
                { sort: { joinTime: -1 } } // Get the most recent active session
            );

            // Update user stats
            await this.updateVoiceTime(userId, session.guildId, duration);

            console.log(`📊 Ended voice session for ${session.username || userId}. Duration: ${this.formatDuration(duration)}`);
            return duration;
        } catch (error) {
            console.error('Error ending voice session:', error);
            return 0;
        }
    }

    // Recover active sessions from database (call this on bot startup)
    async recoverActiveSessions() {
        try {
            const activeSessions = await VoiceSession.getActiveSessions();
            
            for (const session of activeSessions) {
                this.voiceSessions.set(session.userId, {
                    channelId: session.channelId,
                    guildId: session.guildId,
                    joinTime: session.joinTime,
                    username: session.username,
                    channelName: session.channelName,
                    guildName: session.guildName
                });
            }
            
            console.log(`🔄 Recovered ${activeSessions.length} active voice sessions`);
            return activeSessions;
        } catch (error) {
            console.error('Error recovering sessions:', error);
            return [];
        }
    }

    // Handle crash recovery for ending session
    async recoverAndEndVoiceSession(userId) {
        try {
            const session = await VoiceSession.findOne({ userId, isActive: true })
                .sort({ joinTime: -1 });
            
            if (session) {
                const leaveTime = new Date();
                const duration = Math.floor((leaveTime - session.joinTime) / 1000);
                
                session.leaveTime = leaveTime;
                session.duration = duration;
                session.isActive = false;
                await session.save();
                
                await this.updateVoiceTime(userId, session.guildId, duration);
                
                console.log(`🔄 Recovered and ended session for ${userId}. Duration: ${this.formatDuration(duration)}`);
                return duration;
            }
            
            return 0;
        } catch (error) {
            console.error('Error in recover and end session:', error);
            return 0;
        }
    }

    // Update voice time in user stats
    async updateVoiceTime(userId, guildId, duration) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Update total stats
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $inc: { totalVoiceTime: duration },
                    $set: { 
                        lastSeen: new Date(),
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );

            // Update daily stats
            await DailyStats.findOneAndUpdate(
                { userId, guildId, date: today },
                { $inc: { voiceTime: duration } },
                { upsert: true }
            );

            // Update server stats
            await ServerStats.findOneAndUpdate(
                { guildId },
                { 
                    $inc: { totalVoiceTime: duration },
                    $set: { lastUpdated: new Date() }
                },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error updating voice time:', error);
        }
    }

    // =============== MESSAGE TRACKING ===============

    // Track a message
    async trackMessage(userId, guildId, channelId, messageId, contentLength, 
                       hasAttachment = false, username = null, channelName = null, guildName = null) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Update user stats
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $inc: { totalMessages: 1 },
                    $set: { 
                        username: username || 'Unknown',
                        lastSeen: new Date(),
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );

            // Update daily stats
            await DailyStats.findOneAndUpdate(
                { userId, guildId, date: today },
                {
                    $inc: { messagesCount: 1 },
                    $set: { username: username || 'Unknown' },
                    $addToSet: { 'channels.text': channelId }
                },
                { upsert: true }
            );

            // Store detailed message activity (optional)
            const messageActivity = new MessageActivity({
                userId,
                username,
                guildId,
                guildName,
                channelId,
                channelName,
                messageId,
                contentLength,
                hasAttachment
            });
            await messageActivity.save();

            // Update server stats
            await this.updateServerStats(guildId, guildName, 'message', userId);

        } catch (error) {
            console.error('Error tracking message:', error);
        }
    }

    // =============== COMMAND TRACKING ===============

    // Track command usage
    async trackCommand(userId, guildId, username = null) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Update user stats
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $inc: { totalCommandsUsed: 1 },
                    $set: { 
                        username: username || 'Unknown',
                        lastSeen: new Date(),
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );

            // Update daily stats
            await DailyStats.findOneAndUpdate(
                { userId, guildId, date: today },
                {
                    $inc: { commandsUsed: 1 },
                    $set: { username: username || 'Unknown' }
                },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error tracking command:', error);
        }
    }

    // =============== SERVER STATS ===============

    async updateServerStats(guildId, guildName, type, userId) {
        try {
            const updateObj = {
                $set: { 
                    guildName: guildName || 'Unknown',
                    lastUpdated: new Date()
                }
            };

            if (type === 'message') {
                updateObj.$inc = { totalMessages: 1 };
            } else if (type === 'voiceJoin') {
                updateObj.$inc = { totalVoiceJoins: 1 };
            }

            if (userId) {
                updateObj.$set[`uniqueActiveUsers.${userId}`] = new Date();
            }

            await ServerStats.findOneAndUpdate(
                { guildId },
                updateObj,
                { upsert: true }
            );
        } catch (error) {
            console.error('Error updating server stats:', error);
        }
    }

    // =============== ANALYTICS QUERIES ===============

    // Get total VC joins for a guild
    async getTotalVCJoins(guildId) {
        try {
            const stats = await UserStats.getTotalStats(guildId);
            return stats.totalVoiceJoins;
        } catch (error) {
            console.error('Error getting total VC joins:', error);
            return 0;
        }
    }

    // Get average hours spent by all users
    async getAverageHoursSpent(guildId) {
        try {
            const stats = await UserStats.getAverageVoiceTime(guildId);
            return {
                averageHours: (stats.avgVoiceTime / 3600).toFixed(2),
                totalHours: (stats.totalVoiceTime / 3600).toFixed(2),
                userCount: stats.userCount
            };
        } catch (error) {
            console.error('Error getting average hours:', error);
            return { averageHours: 0, totalHours: 0, userCount: 0 };
        }
    }

    // Get unique users count
    async getUniqueUsers(guildId) {
        try {
            const count = await UserStats.countDocuments({ guildId });
            return count;
        } catch (error) {
            console.error('Error getting unique users:', error);
            return 0;
        }
    }

    // Get total hours of all users
    async getTotalHours(guildId) {
        try {
            const stats = await UserStats.getTotalStats(guildId);
            return (stats.totalVoiceTime / 3600).toFixed(2);
        } catch (error) {
            console.error('Error getting total hours:', error);
            return 0;
        }
    }

    // Get total messages sent
    async getTotalMessages(guildId) {
        try {
            const stats = await UserStats.getTotalStats(guildId);
            return stats.totalMessages;
        } catch (error) {
            console.error('Error getting total messages:', error);
            return 0;
        }
    }

    // Get each user's hours spent in VC
    async getUserVoiceHours(guildId, limit = null) {
        try {
            let query = UserStats.find({ guildId })
                .select('userId username totalVoiceTime')
                .sort({ totalVoiceTime: -1 });
            
            if (limit) {
                query = query.limit(limit);
            }
            
            const users = await query.exec();
            
            return users.map(user => ({
                userId: user.userId,
                username: user.username,
                hours: (user.totalVoiceTime / 3600).toFixed(2),
                days: (user.totalVoiceTime / 86400).toFixed(2),
                formatted: this.formatDuration(user.totalVoiceTime)
            }));
        } catch (error) {
            console.error('Error getting user voice hours:', error);
            return [];
        }
    }

    // Get comprehensive stats for a guild
    async getGuildStats(guildId) {
        try {
            const [totalStats, avgStats, uniqueUsers, topUsers] = await Promise.all([
                UserStats.getTotalStats(guildId),
                UserStats.getAverageVoiceTime(guildId),
                UserStats.countDocuments({ guildId }),
                UserStats.getTopUsers(guildId, 'totalVoiceTime', 10)
            ]);

            return {
                totalVCJoins: totalStats.totalVoiceJoins,
                totalMessages: totalStats.totalMessages,
                totalHours: (totalStats.totalVoiceTime / 3600).toFixed(2),
                averageHours: (avgStats.avgVoiceTime / 3600).toFixed(2),
                uniqueUsers,
                topUsersByVoiceTime: topUsers.map(u => ({
                    username: u.username,
                    hours: (u.totalVoiceTime / 3600).toFixed(2)
                }))
            };
        } catch (error) {
            console.error('Error getting guild stats:', error);
            return null;
        }
    }

    // Get user's detailed stats
    async getUserStats(userId, guildId) {
        try {
            const user = await UserStats.findOne({ userId, guildId });
            if (!user) return null;

            return {
                username: user.username,
                totalMessages: user.totalMessages,
                totalVoiceHours: (user.totalVoiceTime / 3600).toFixed(2),
                totalVoiceJoins: user.totalVoiceJoins,
                totalCommands: user.totalCommandsUsed,
                firstSeen: user.firstSeen,
                lastSeen: user.lastSeen,
                formattedVoiceTime: this.formatDuration(user.totalVoiceTime)
            };
        } catch (error) {
            console.error('Error getting user stats:', error);
            return null;
        }
    }

    // Get stats for a date range
    async getDateRangeStats(guildId, startDate, endDate) {
        try {
            const stats = await DailyStats.aggregate([
                {
                    $match: {
                        guildId,
                        date: {
                            $gte: startDate,
                            $lte: endDate
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalMessages: { $sum: '$messagesCount' },
                        totalVoiceTime: { $sum: '$voiceTime' },
                        totalVoiceJoins: { $sum: '$voiceJoins' },
                        totalCommands: { $sum: '$commandsUsed' },
                        uniqueUsers: { $addToSet: '$userId' }
                    }
                }
            ]);

            if (stats.length === 0) return null;

            return {
                totalMessages: stats[0].totalMessages,
                totalVoiceHours: (stats[0].totalVoiceTime / 3600).toFixed(2),
                totalVoiceJoins: stats[0].totalVoiceJoins,
                totalCommands: stats[0].totalCommands,
                uniqueUsers: stats[0].uniqueUsers.length
            };
        } catch (error) {
            console.error('Error getting date range stats:', error);
            return null;
        }
    }

    // =============== UTILITY FUNCTIONS ===============

    // Format duration from seconds to human readable
    formatDuration(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(' ');
    }

    // Clean up old sessions (maintenance function)
    async cleanupOldSessions(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await VoiceSession.deleteMany({
                isActive: false,
                leaveTime: { $lt: cutoffDate }
            });

            console.log(`🧹 Cleaned up ${result.deletedCount} old voice sessions`);
            return result.deletedCount;
        } catch (error) {
            console.error('Error cleaning up old sessions:', error);
            return 0;
        }
    }

    // Export data for backup
    async exportStats(guildId) {
        try {
            const [users, daily, sessions] = await Promise.all([
                UserStats.find({ guildId }).lean(),
                DailyStats.find({ guildId }).lean(),
                VoiceSession.find({ guildId }).lean()
            ]);

            return {
                exportDate: new Date(),
                guildId,
                userStats: users,
                dailyStats: daily,
                voiceSessions: sessions
            };
        } catch (error) {
            console.error('Error exporting stats:', error);
            return null;
        }
    }
}

module.exports = StatTracker;
