// models/uniqueItems.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema for tracking unique item ownership and maintenance
const uniqueItemSchema = new Schema({
    // Numerical ID that matches entry in uniqueItemsSheet.js
    itemId: { 
        type: Number, 
        required: true, 
        unique: true 
    },
    
    // Current owner's Discord ID (null if unowned)
    ownerId: { 
        type: String, 
        default: null,
        index: true 
    },
    
    // Owner's Discord tag for display purposes
    ownerTag: { 
        type: String, 
        default: null 
    },
    
    // Maintenance tracking
    maintenanceLevel: { 
        type: Number, 
        default: 10, // Default max maintenance
        min: 0,
        max: 10
    },
    
    // Type of maintenance required (matches maintenance types in uniqueItemsSheet)
    maintenanceType: { 
        type: String, 
        required: true,
        enum: ['coins', 'mining_activity', 'voice_activity', 'combat_activity', 'social_activity', 'wealthiest', 'movement_activity']
    },
    
    // Cost/requirement for maintenance (interpreted based on type)
    maintenanceCost: { 
        type: Number, 
        required: true 
    },
    
    // Whether this item currently requires maintenance
    requiresMaintenance: { 
        type: Boolean, 
        default: true 
    },
    
    // Last time maintenance was performed
    lastMaintenanceDate: { 
        type: Date, 
        default: Date.now 
    },
    
    // Next scheduled maintenance check
    nextMaintenanceCheck: { 
        type: Date, 
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    },
    
    // Activity tracking for different maintenance types (DEPRECATED - kept for backward compatibility)
    activityTracking: {
        lastMiningTime: { type: Date },
        lastVoiceJoin: { type: Date },
        lastCombatTime: { type: Date },
        lastSocialInteraction: { type: Date },
        lastMovementTime: { type: Date },
        miningBlocksThisCycle: { type: Number, default: 0 },
        voiceMinutesThisCycle: { type: Number, default: 0 },
        combatWinsThisCycle: { type: Number, default: 0 },
        socialInteractionsThisCycle: { type: Number, default: 0 },
        tilesMovedThisCycle: { type: Number, default: 0 },
        // Ore-specific tracking (itemId -> quantity)
        oresMinedThisCycle: { type: Map, of: Number, default: {} }
    },
    
    // New maintenance state tracking using GameStatTracker as source of truth
    maintenanceState: {
        // Previous stats snapshot from GameStatTracker
        previousStats: {
            tilesMoved: { type: Number, default: 0 },
            itemsFound: { type: Schema.Types.Mixed, default: {} },
            itemsFoundBySource: {
                mining: { type: Schema.Types.Mixed, default: {} },
                treasure: { type: Schema.Types.Mixed, default: {} }
            },
            timeInMiningChannel: { type: Number, default: 0 },
            hazardsEvaded: { type: Number, default: 0 },
            hazardsTriggered: { type: Number, default: 0 },
            highestPowerLevel: { type: Number, default: 0 }
        },
        // Guild ID for stat tracking
        guildId: { type: String, default: 'default' }
    },
    
    // History tracking
    previousOwners: [{
        userId: String,
        userTag: String,
        acquiredDate: Date,
        lostDate: Date,
        lostReason: { 
            type: String, 
            enum: ['maintenance_failure', 'traded', 'destroyed', 'no_longer_richest', 'voluntary_relinquishment', 'other'] 
        }
    }],
    
    // Item statistics
    statistics: {
        timesFound: { type: Number, default: 0 },
        timesLostToMaintenance: { type: Number, default: 0 },
        timesVoluntarilyRelinquished: { type: Number, default: 0 },
        totalMaintenancePerformed: { type: Number, default: 0 },
        totalCoinsSpentOnMaintenance: { type: Number, default: 0 }
    }
    
}, { timestamps: true });

// Indexes for efficient queries
uniqueItemSchema.index({ ownerId: 1 });
uniqueItemSchema.index({ maintenanceLevel: 1 });
uniqueItemSchema.index({ nextMaintenanceCheck: 1 });
uniqueItemSchema.index({ requiresMaintenance: 1, maintenanceLevel: 1 });

// Static method to find all unowned unique items
uniqueItemSchema.statics.findUnownedItems = function() {
    return this.find({ ownerId: null });
};

// Static method to find items needing maintenance
uniqueItemSchema.statics.findItemsNeedingMaintenance = function() {
    return this.find({ 
        requiresMaintenance: true,
        maintenanceLevel: { $lt: 10 },
        ownerId: { $ne: null }
    });
};

// Static method to find player's unique items
uniqueItemSchema.statics.findPlayerUniqueItems = function(playerId) {
    return this.find({ ownerId: playerId });
};

// Instance method to perform maintenance reduction
uniqueItemSchema.methods.reduceMaintenance = async function(amount = 1, isRichest = false) {
    this.maintenanceLevel = Math.max(0, this.maintenanceLevel - amount);
    
    // If maintenance hits 0, handle ownership loss
    if (this.maintenanceLevel <= 0 && this.ownerId) {
        // Special handling for Midas' Burden - don't lose it if still richest
        if (this.itemId === 10 && isRichest) {
            console.log(`[UNIQUE ITEMS] Midas' Burden: Maintenance at 0 but owner still wealthiest - keeping item at curse threshold`);
            this.maintenanceLevel = 2; // Give maintenance above curse threshold (≤1) to keep it functional
        } else {
            // Add to previous owners history
            this.previousOwners.push({
                userId: this.ownerId,
                userTag: this.ownerTag,
                acquiredDate: this.createdAt,
                lostDate: new Date(),
                lostReason: 'maintenance_failure'
            });
            
            // Update statistics
            this.statistics.timesLostToMaintenance++;
            
            // Remove current owner
            this.ownerId = null;
            this.ownerTag = null;
            
            // Reset maintenance for next owner
            this.maintenanceLevel = 10;
            this.activityTracking = {
                miningBlocksThisCycle: 0,
                voiceMinutesThisCycle: 0,
                combatWinsThisCycle: 0,
                socialInteractionsThisCycle: 0,
                tilesMovedThisCycle: 0,
                oresMinedThisCycle: new Map()
            };
            
            // Reset maintenance state for next owner
            this.maintenanceState = {
                previousStats: {
                    tilesMoved: 0,
                    itemsFound: {},
                    itemsFoundBySource: {
                        mining: {},
                        treasure: {}
                    },
                    timeInMiningChannel: 0,
                    hazardsEvaded: 0,
                    hazardsTriggered: 0,
                    highestPowerLevel: 0
                },
                guildId: 'default'
            };
        }
    }
    
    return this.save();
};

// Instance method to perform maintenance
uniqueItemSchema.methods.performMaintenance = async function(userId, cost) {
    if (this.ownerId !== userId) {
        throw new Error('Only the owner can perform maintenance');
    }
    
    this.maintenanceLevel = 10; // Reset to max
    this.lastMaintenanceDate = new Date();
    this.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.statistics.totalMaintenancePerformed++;
    
    if (this.maintenanceType === 'coins') {
        this.statistics.totalCoinsSpentOnMaintenance += cost;
    }
    
    // Reset activity tracking for the cycle (DEPRECATED - kept for backward compatibility)
    this.activityTracking.miningBlocksThisCycle = 0;
    this.activityTracking.voiceMinutesThisCycle = 0;
    this.activityTracking.combatWinsThisCycle = 0;
    this.activityTracking.socialInteractionsThisCycle = 0;
    this.activityTracking.tilesMovedThisCycle = 0;
    this.activityTracking.oresMinedThisCycle = new Map();
    
    return this.save();
};

// Instance method to assign to new owner
uniqueItemSchema.methods.assignToPlayer = function(userId, userTag, guildId = 'default') {
    this.ownerId = userId;
    this.ownerTag = userTag;
    this.maintenanceLevel = 10; // Start with full maintenance
    this.lastMaintenanceDate = new Date();
    this.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.statistics.timesFound++;
    
    // Initialize maintenance state
    this.maintenanceState = {
        previousStats: {
            tilesMoved: 0,
            itemsFound: {},
            itemsFoundBySource: {
                mining: {},
                treasure: {}
            },
            timeInMiningChannel: 0,
            hazardsEvaded: 0,
            hazardsTriggered: 0,
            highestPowerLevel: 0
        },
        guildId: guildId
    };
    
    return this.save();
};

// Instance method to save maintenance state (stats snapshot)
uniqueItemSchema.methods.saveMaintenanceState = function(currentStats) {
    this.maintenanceState.previousStats = {
        tilesMoved: currentStats.tilesMoved || 0,
        itemsFound: currentStats.itemsFound || {},
        itemsFoundBySource: {
            mining: currentStats.itemsFoundBySource?.mining || {},
            treasure: currentStats.itemsFoundBySource?.treasure || {}
        },
        timeInMiningChannel: currentStats.timeInMiningChannel || 0,
        hazardsEvaded: currentStats.hazardsEvaded || 0,
        hazardsTriggered: currentStats.hazardsTriggered || 0,
        highestPowerLevel: currentStats.highestPowerLevel || 0
    };
    
    return this.save();
};

const UniqueItem = mongoose.model('UniqueItem', uniqueItemSchema);
module.exports = UniqueItem;
