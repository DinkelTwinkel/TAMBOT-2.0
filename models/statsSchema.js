const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// User Statistics Schema
const userStatsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true  // Removed unique: true because users can be in multiple guilds
    },
    username: {
        type: String,
        default: 'Unknown'
    },
    guildId: {
        type: String,
        required: true
    },
    totalMessages: {
        type: Number,
        default: 0
    },
    totalVoiceTime: {
        type: Number,
        default: 0  // in seconds
    },
    totalVoiceJoins: {
        type: Number,
        default: 0
    },
    totalCommandsUsed: {
        type: Number,
        default: 0
    },
    firstSeen: {
        type: Date,
        default: Date.now
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    // Expandable game data for tracking various game mode statistics
    gameData: {
        type: Schema.Types.Mixed,
        required: false,
        default: {}
    }
}, {
    timestamps: true
});

// Create compound unique index for userId + guildId combination
userStatsSchema.index({ userId: 1, guildId: 1 }, { unique: true });

// Daily Statistics Schema
const dailyStatsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    username: String,
    guildId: {
        type: String,
        required: true
    },
    date: {
        type: String,  // Format: YYYY-MM-DD
        required: true,
        index: true
    },
    messagesCount: {
        type: Number,
        default: 0
    },
    voiceTime: {
        type: Number,
        default: 0  // in seconds
    },
    voiceJoins: {
        type: Number,
        default: 0
    },
    commandsUsed: {
        type: Number,
        default: 0
    },
    channels: {
        voice: [String],  // List of voice channels used
        text: [String]    // List of text channels used
    }
}, {
    timestamps: true
});

// Create compound index for efficient queries
// Fixed: Should be userId + guildId + date for unique constraint
dailyStatsSchema.index({ userId: 1, guildId: 1, date: 1 }, { unique: true });

// Voice Session Schema (for tracking active sessions and crash recovery)
const voiceSessionSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    username: String,
    channelId: {
        type: String,
        required: true
    },
    channelName: String,
    guildId: {
        type: String,
        required: true
    },
    guildName: String,
    joinTime: {
        type: Date,
        required: true,
        default: Date.now
    },
    leaveTime: {
        type: Date,
        default: null
    },
    duration: {
        type: Number,
        default: 0  // in seconds
    },
    lastUpdateDuration: {
        type: Number,
        default: 0  // Last recorded duration for periodic updates
    },
    lastUpdateTime: {
        type: Date,
        default: null  // Last time the periodic update was run
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, {
    timestamps: true
});

// Message Activity Schema (optional detailed tracking)
const messageActivitySchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    username: String,
    guildId: {
        type: String,
        required: true
    },
    guildName: String,
    channelId: {
        type: String,
        required: true
    },
    channelName: String,
    messageId: {
        type: String,
        required: true,
        unique: true
    },
    contentLength: {
        type: Number,
        default: 0
    },
    hasAttachment: {
        type: Boolean,
        default: false
    },
    hasEmbed: {
        type: Boolean,
        default: false
    },
    mentionedUsers: [String],
    mentionedRoles: [String],
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Server Statistics Schema (aggregate data)
const serverStatsSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    guildName: String,
    totalUsers: {
        type: Number,
        default: 0
    },
    totalMessages: {
        type: Number,
        default: 0
    },
    totalVoiceTime: {
        type: Number,
        default: 0  // in seconds
    },
    totalVoiceJoins: {
        type: Number,
        default: 0
    },
    uniqueActiveUsers: {
        type: Map,
        of: Date,  // userId -> lastActiveDate
        default: new Map()
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Add methods to UserStats schema
userStatsSchema.methods.getVoiceHours = function() {
    return (this.totalVoiceTime / 3600).toFixed(2);
};

userStatsSchema.methods.getVoiceDays = function() {
    return (this.totalVoiceTime / 86400).toFixed(2);
};

// Add static methods for analytics
userStatsSchema.statics.getTopUsers = async function(guildId, metric = 'totalVoiceTime', limit = 10) {
    return this.find({ guildId })
        .sort({ [metric]: -1 })
        .limit(limit)
        .exec();
};

userStatsSchema.statics.getAverageVoiceTime = async function(guildId) {
    const result = await this.aggregate([
        { $match: { guildId, totalVoiceTime: { $gt: 0 } } },
        {
            $group: {
                _id: null,
                avgVoiceTime: { $avg: '$totalVoiceTime' },
                totalVoiceTime: { $sum: '$totalVoiceTime' },
                userCount: { $sum: 1 }
            }
        }
    ]);
    return result[0] || { avgVoiceTime: 0, totalVoiceTime: 0, userCount: 0 };
};

userStatsSchema.statics.getTotalStats = async function(guildId) {
    const result = await this.aggregate([
        { $match: { guildId } },
        {
            $group: {
                _id: null,
                totalMessages: { $sum: '$totalMessages' },
                totalVoiceTime: { $sum: '$totalVoiceTime' },
                totalVoiceJoins: { $sum: '$totalVoiceJoins' },
                uniqueUsers: { $sum: 1 }
            }
        }
    ]);
    return result[0] || { 
        totalMessages: 0, 
        totalVoiceTime: 0, 
        totalVoiceJoins: 0, 
        uniqueUsers: 0 
    };
};

// Voice session methods
voiceSessionSchema.statics.getActiveSessions = async function() {
    return this.find({ isActive: true }).exec();
};

voiceSessionSchema.methods.endSession = async function() {
    this.leaveTime = new Date();
    this.duration = Math.floor((this.leaveTime - this.joinTime) / 1000);
    this.isActive = false;
    return this.save();
};

// Daily stats methods
dailyStatsSchema.statics.getDateRange = async function(guildId, startDate, endDate) {
    return this.find({
        guildId,
        date: {
            $gte: startDate,
            $lte: endDate
        }
    }).sort({ date: 1 }).exec();
};

// Export models
module.exports = {
    UserStats: mongoose.model('UserStats', userStatsSchema),
    DailyStats: mongoose.model('DailyStats', dailyStatsSchema),
    VoiceSession: mongoose.model('VoiceSession', voiceSessionSchema),
    MessageActivity: mongoose.model('MessageActivity', messageActivitySchema),
    ServerStats: mongoose.model('ServerStats', serverStatsSchema)
};
