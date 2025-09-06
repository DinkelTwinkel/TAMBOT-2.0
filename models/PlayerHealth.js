const mongoose = require('mongoose');

const playerHealthSchema = new mongoose.Schema({
    playerId: {
        type: String,
        required: true,
        index: true
    },
    channelId: {
        type: String,
        required: true,
        index: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    currentHealth: {
        type: Number,
        default: 100,
        min: 0,
        max: 1000 // Allow for health bonuses
    },
    maxHealth: {
        type: Number,
        default: 100,
        min: 1,
        max: 1000
    },
    lastDamageSource: {
        type: String,
        default: 'none'
    },
    lastDamageAmount: {
        type: Number,
        default: 0
    },
    lastDamageTime: {
        type: Date,
        default: Date.now
    },
    lastRegenTime: {
        type: Date,
        default: Date.now
    },
    totalDamageTaken: {
        type: Number,
        default: 0
    },
    deathCount: {
        type: Number,
        default: 0
    },
    isDead: {
        type: Boolean,
        default: false
    },
    reviveAtNextBreak: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// Compound index for efficient queries
playerHealthSchema.index({ playerId: 1, channelId: 1 }, { unique: true });
playerHealthSchema.index({ channelId: 1, isDead: 1 });

// Static methods
playerHealthSchema.statics.findPlayerHealth = function(playerId, channelId) {
    return this.findOne({ playerId, channelId });
};

playerHealthSchema.statics.getOrCreatePlayerHealth = async function(playerId, channelId, guildId) {
    let playerHealth = await this.findOne({ playerId, channelId });
    
    if (!playerHealth) {
        playerHealth = new this({
            playerId,
            channelId,
            guildId,
            currentHealth: 100,
            maxHealth: 100
        });
        await playerHealth.save();
        console.log(`[HEALTH SCHEMA] Created new health record for player ${playerId} in channel ${channelId}`);
    }
    
    return playerHealth;
};

playerHealthSchema.statics.updatePlayerHealth = async function(playerId, channelId, guildId, healthChange, source = 'unknown') {
    const playerHealth = await this.getOrCreatePlayerHealth(playerId, channelId, guildId);
    
    const oldHealth = playerHealth.currentHealth;
    const newHealth = Math.max(0, Math.min(playerHealth.maxHealth, oldHealth + healthChange));
    
    playerHealth.currentHealth = newHealth;
    playerHealth.lastDamageSource = source;
    playerHealth.lastDamageAmount = Math.abs(healthChange);
    playerHealth.lastDamageTime = new Date();
    playerHealth.totalDamageTaken += Math.max(0, -healthChange); // Only count damage, not healing
    
    if (newHealth <= 0 && !playerHealth.isDead) {
        playerHealth.isDead = true;
        playerHealth.deathCount += 1;
        playerHealth.reviveAtNextBreak = true;
    }
    
    await playerHealth.save();
    
    console.log(`[HEALTH SCHEMA] ${playerId} health: ${oldHealth} -> ${newHealth} (${healthChange >= 0 ? '+' : ''}${healthChange} from ${source})`);
    
    return {
        success: true,
        newHealth: newHealth,
        maxHealth: playerHealth.maxHealth,
        previousHealth: oldHealth,
        healthChange: healthChange,
        source: source,
        isDead: playerHealth.isDead
    };
};

playerHealthSchema.statics.revivePlayer = async function(playerId, channelId, reviveHealth = null) {
    const playerHealth = await this.findOne({ playerId, channelId });
    
    if (playerHealth && playerHealth.isDead) {
        playerHealth.currentHealth = reviveHealth || Math.floor(playerHealth.maxHealth * 0.5);
        playerHealth.isDead = false;
        playerHealth.reviveAtNextBreak = false;
        playerHealth.lastDamageSource = 'revival';
        playerHealth.lastDamageTime = new Date();
        
        await playerHealth.save();
        
        console.log(`[HEALTH SCHEMA] Revived player ${playerId} to ${playerHealth.currentHealth} health`);
        return true;
    }
    
    return false;
};

playerHealthSchema.statics.getAllChannelHealth = async function(channelId) {
    return this.find({ channelId }).lean();
};

playerHealthSchema.statics.cleanupOldChannels = async function(activeChannelIds) {
    // Remove health data for channels that no longer exist
    const result = await this.deleteMany({ 
        channelId: { $nin: activeChannelIds } 
    });
    
    if (result.deletedCount > 0) {
        console.log(`[HEALTH SCHEMA] Cleaned up ${result.deletedCount} old health records`);
    }
    
    return result.deletedCount;
};

module.exports = mongoose.model('PlayerHealth', playerHealthSchema);
