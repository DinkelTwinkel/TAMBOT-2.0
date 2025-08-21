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
        enum: ['coins', 'mining_activity', 'voice_activity', 'combat_activity', 'social_activity']
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
    
    // Activity tracking for different maintenance types
    activityTracking: {
        lastMiningTime: { type: Date },
        lastVoiceJoin: { type: Date },
        lastCombatTime: { type: Date },
        lastSocialInteraction: { type: Date },
        miningBlocksThisCycle: { type: Number, default: 0 },
        voiceMinutesThisCycle: { type: Number, default: 0 },
        combatWinsThisCycle: { type: Number, default: 0 },
        socialInteractionsThisCycle: { type: Number, default: 0 }
    },
    
    // History tracking
    previousOwners: [{
        userId: String,
        userTag: String,
        acquiredDate: Date,
        lostDate: Date,
        lostReason: { 
            type: String, 
            enum: ['maintenance_failure', 'traded', 'destroyed', 'other'] 
        }
    }],
    
    // Item statistics
    statistics: {
        timesFound: { type: Number, default: 0 },
        timesLostToMaintenance: { type: Number, default: 0 },
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
uniqueItemSchema.methods.reduceMaintenance = function(amount = 1) {
    this.maintenanceLevel = Math.max(0, this.maintenanceLevel - amount);
    
    // If maintenance hits 0, remove owner
    if (this.maintenanceLevel <= 0 && this.ownerId) {
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
            socialInteractionsThisCycle: 0
        };
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
    
    // Reset activity tracking for the cycle
    this.activityTracking.miningBlocksThisCycle = 0;
    this.activityTracking.voiceMinutesThisCycle = 0;
    this.activityTracking.combatWinsThisCycle = 0;
    this.activityTracking.socialInteractionsThisCycle = 0;
    
    return this.save();
};

// Instance method to assign to new owner
uniqueItemSchema.methods.assignToPlayer = function(userId, userTag) {
    this.ownerId = userId;
    this.ownerTag = userTag;
    this.maintenanceLevel = 10; // Start with full maintenance
    this.lastMaintenanceDate = new Date();
    this.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.statistics.timesFound++;
    
    return this.save();
};

const UniqueItem = mongoose.model('UniqueItem', uniqueItemSchema);
module.exports = UniqueItem;
