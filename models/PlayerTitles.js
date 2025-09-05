// PlayerTitles.js - MongoDB Schema for Player Titles and Achievements
const mongoose = require('mongoose');

// Achievement Progress Schema
const achievementProgressSchema = new mongoose.Schema({
    achievementId: {
        type: String,
        required: true
    },
    unlockedAt: {
        type: Date,
        default: Date.now
    },
    progress: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
});

// Title Schema
const titleSchema = new mongoose.Schema({
    titleId: {
        type: String,
        required: true
    },
    unlockedAt: {
        type: Date,
        default: Date.now
    },
    timesEquipped: {
        type: Number,
        default: 0
    },
    lastEquipped: {
        type: Date,
        default: null
    }
});

// Player Progress Schema
const playerProgressSchema = new mongoose.Schema({
    // Basic mining stats
    wallsBroken: {
        type: Number,
        default: 0
    },
    oreFound: {
        type: Number,
        default: 0
    },
    treasuresFound: {
        type: Number,
        default: 0
    },
    rareItemsFound: {
        type: Number,
        default: 0
    },
    uniqueItemsFound: {
        type: Number,
        default: 0
    },
    shadowOreFound: {
        type: Number,
        default: 0
    },
    
    // Survival stats
    hazardsSurvived: {
        type: Number,
        default: 0
    },
    deathsAvoided: {
        type: Number,
        default: 0
    },
    revivals: {
        type: Number,
        default: 0
    },
    
    // Economic stats
    coinsEarned: {
        type: Number,
        default: 0
    },
    
    // Social stats
    teamMiningTime: {
        type: Number,
        default: 0
    },
    playersHelped: {
        type: Number,
        default: 0
    },
    npcsCommanded: {
        type: Number,
        default: 0
    },
    
    // Mine exploration
    minesReached: [{
        mineId: {
            type: Number,
            required: true
        },
        firstReachedAt: {
            type: Date,
            default: Date.now
        },
        timesVisited: {
            type: Number,
            default: 1
        }
    }],
    
    // Equipped unique items (for title requirements)
    equippedUniqueItems: [{
        itemId: {
            type: Number,
            required: true
        },
        equippedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Last updated timestamp
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Main Player Titles Schema
const playerTitlesSchema = new mongoose.Schema({
    playerId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // Player info
    playerName: {
        type: String,
        required: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    
    // Title management
    availableTitles: [titleSchema],
    activeTitles: [{
        type: String // Title IDs
    }],
    displayTitle: {
        type: String,
        default: null
    },
    
    // Achievement tracking
    achievements: [achievementProgressSchema],
    
    // Progress tracking
    progress: {
        type: playerProgressSchema,
        default: () => ({})
    },
    
    // Discord role management
    discordRoles: [{
        roleId: {
            type: String,
            required: true
        },
        roleName: {
            type: String,
            required: true
        },
        titleId: {
            type: String,
            required: true
        },
        assignedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Metadata
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field on save
playerTitlesSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    this.progress.lastUpdated = Date.now();
    next();
});

// Index for efficient queries
playerTitlesSchema.index({ playerId: 1, guildId: 1 });
playerTitlesSchema.index({ 'availableTitles.titleId': 1 });
playerTitlesSchema.index({ 'achievements.achievementId': 1 });
playerTitlesSchema.index({ 'progress.minesReached.mineId': 1 });

// Static methods for common operations
playerTitlesSchema.statics.findByPlayer = function(playerId, guildId = null) {
    const query = { playerId };
    if (guildId) query.guildId = guildId;
    return this.findOne(query);
};

playerTitlesSchema.statics.findPlayersWithTitle = function(titleId, guildId = null) {
    const query = { 'availableTitles.titleId': titleId };
    if (guildId) query.guildId = guildId;
    return this.find(query).select('playerId playerName displayTitle');
};

playerTitlesSchema.statics.getLeaderboard = function(stat, guildId = null, limit = 10) {
    const query = {};
    if (guildId) query.guildId = guildId;
    
    const sortField = `progress.${stat}`;
    return this.find(query)
        .sort({ [sortField]: -1 })
        .limit(limit)
        .select('playerId playerName progress');
};

// Instance methods
playerTitlesSchema.methods.hasTitle = function(titleId) {
    return this.availableTitles.some(title => title.titleId === titleId);
};

playerTitlesSchema.methods.hasAchievement = function(achievementId) {
    return this.achievements.some(ach => ach.achievementId === achievementId);
};

playerTitlesSchema.methods.addTitle = function(titleId) {
    if (!this.hasTitle(titleId)) {
        this.availableTitles.push({
            titleId,
            unlockedAt: new Date()
        });
        return true;
    }
    return false;
};

playerTitlesSchema.methods.addAchievement = function(achievementId, progress = {}) {
    if (!this.hasAchievement(achievementId)) {
        this.achievements.push({
            achievementId,
            unlockedAt: new Date(),
            progress
        });
        return true;
    }
    return false;
};

playerTitlesSchema.methods.addMineReached = function(mineId) {
    const existing = this.progress.minesReached.find(mine => mine.mineId === mineId);
    if (existing) {
        existing.timesVisited++;
        return false; // Already reached
    } else {
        this.progress.minesReached.push({
            mineId,
            firstReachedAt: new Date(),
            timesVisited: 1
        });
        return true; // New mine reached
    }
};

playerTitlesSchema.methods.updateProgress = function(progressType, amount = 1) {
    if (this.progress[progressType] !== undefined) {
        this.progress[progressType] += amount;
        return true;
    }
    return false;
};

module.exports = mongoose.model('PlayerTitles', playerTitlesSchema);
