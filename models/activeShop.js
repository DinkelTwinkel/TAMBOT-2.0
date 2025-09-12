const mongoose = require('mongoose');

const activeShopSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        index: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    channelId: {
        type: String,
        required: true
    },
    itemId: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0
    },
    pricePerItem: {
        type: Number,
        required: true,
        min: 1
    },
    shopOwnerId: {
        type: String,
        required: true,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 604800 // 7 days in seconds - auto-delete old shops
    },
    isActive: {
        type: Boolean,
        default: true
    },
    version: {
        type: Number,
        default: 0
    }
});

// Compound index for efficient queries
activeShopSchema.index({ guildId: 1, shopOwnerId: 1, itemId: 1 });
activeShopSchema.index({ messageId: 1, guildId: 1 });
activeShopSchema.index({ isActive: 1, createdAt: 1 }); // For cleanup queries

// Atomic purchase method to prevent race conditions
activeShopSchema.statics.atomicPurchase = async function(messageId, buyerType = 'player', buyerId = null) {
    try {
        // Use findOneAndUpdate with version check for optimistic locking
        const result = await this.findOneAndUpdate(
            { 
                messageId: messageId,
                isActive: true,
                quantity: { $gt: 0 } // Ensure there's still stock
            },
            { 
                $inc: { 
                    quantity: -1,
                    version: 1 
                },
                $set: {
                    lastPurchaseBy: buyerId,
                    lastPurchaseType: buyerType,
                    lastPurchaseAt: new Date()
                }
            },
            { 
                new: true, // Return updated document
                runValidators: true
            }
        );

        if (!result) {
            console.log(`[ATOMIC_PURCHASE] ❌ Purchase failed - shop not available or out of stock`);
            return { success: false, reason: 'unavailable' };
        }

        // Check if shop should be closed
        if (result.quantity === 0) {
            result.isActive = false;
            await result.save();
        }

        console.log(`[ATOMIC_PURCHASE] ✅ Purchase successful - ${buyerType} ${buyerId || 'unknown'} bought item, ${result.quantity} remaining`);
        
        return { 
            success: true, 
            shop: result,
            soldOut: result.quantity === 0
        };

    } catch (error) {
        console.error('[ATOMIC_PURCHASE] Error during atomic purchase:', error);
        return { success: false, reason: 'error', error: error.message };
    }
};

// Static method for cleaning up old inactive shops
activeShopSchema.statics.cleanupInactiveShops = async function(olderThanDays = 1) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const result = await this.deleteMany({
        isActive: false,
        createdAt: { $lt: cutoffDate }
    });
    
    if (result.deletedCount > 0) {
        console.log(`[ACTIVE_SHOP] Cleaned up ${result.deletedCount} old inactive shops`);
    }
    
    return result.deletedCount;
};

// Static method for cleaning up shops with missing messages
activeShopSchema.statics.cleanupOrphanedShops = async function(client) {
    try {
        const activeShops = await this.find({ isActive: true }).lean();
        let cleanedCount = 0;
        
        for (const shop of activeShops) {
            try {
                const guild = await client.guilds.fetch(shop.guildId);
                const channel = await guild.channels.fetch(shop.channelId);
                await channel.messages.fetch(shop.messageId);
                // If we get here, message exists - shop is valid
            } catch (error) {
                // Message doesn't exist, mark shop as inactive
                await this.updateOne(
                    { _id: shop._id },
                    { isActive: false }
                );
                cleanedCount++;
                console.log(`[ACTIVE_SHOP] Marked orphaned shop as inactive: ${shop._id}`);
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[ACTIVE_SHOP] Cleaned up ${cleanedCount} orphaned shops`);
        }
        
        return cleanedCount;
    } catch (error) {
        console.error('[ACTIVE_SHOP] Error during orphaned shop cleanup:', error);
        return 0;
    }
};

module.exports = mongoose.model('ActiveShop', activeShopSchema);
