// miningDatabase.js - Database operations for mining (with integrated fixes)
const gachaVC = require('../../../models/activevcs');
const PlayerInventory = require('../../../models/inventory');
const Currency = require('../../../models/currency');
const { miningItemPool, treasureItems, UNIFIED_ITEM_POOL } = require('./miningConstants_unified');
const deeperMineChecker = require('../../mining/deeperMineChecker');

// Enhanced Database System
class DatabaseTransaction {
    constructor() {
        this.inventoryUpdates = new Map();
        this.mapUpdate = null;
        this.vcUpdates = {};
        this.pickaxeBreaks = [];
        this.durabilityUpdates = new Map();
    }
    
    addInventoryItem(playerId, playerTag, itemId, quantity) {
        const key = `${playerId}-${itemId}`;
        if (this.inventoryUpdates.has(key)) {
            this.inventoryUpdates.get(key).quantity += quantity;
        } else {
            this.inventoryUpdates.set(key, { playerId, playerTag, itemId, quantity });
        }
    }
    
    addPickaxeBreak(playerId, playerTag, pickaxe) {
        this.pickaxeBreaks.push({ playerId, playerTag, pickaxe });
    }
    
    updatePickaxeDurability(playerId, itemId, newDurability) {
        const key = `${playerId}-${itemId}`;
        this.durabilityUpdates.set(key, { playerId, itemId, newDurability });
    }
    
    setMapUpdate(channelId, mapData) {
        this.mapUpdate = { channelId, mapData };
    }
    
    setVCUpdate(channelId, updates) {
        this.vcUpdates[channelId] = updates;
    }
    
    async executePlayerInventoryOps(ops) {
        try {
            // Process all additions for this player
            for (const addition of ops.additions) {
                await this.addItemAtomic(ops.playerId, ops.playerTag, addition.itemId, addition.quantity);
            }
            
            // Process all removals (pickaxe breaks) for this player - WITH FIX
            for (const removal of ops.removals) {
                const result = await breakPickaxe(ops.playerId, ops.playerTag, removal);
                if (!result) {
                    console.error(`Failed to break pickaxe for player ${ops.playerId}`);
                }
            }
            
            // Process all durability updates for this player
            for (const durabilityUpdate of ops.durabilityUpdates) {
                await updateItemDurability(ops.playerId, durabilityUpdate.itemId, durabilityUpdate.newDurability);
            }
        } catch (error) {
            console.error(`Error in inventory operations for player ${ops.playerId}:`, error);
        }
    }
    
    async addItemAtomic(playerId, playerTag, itemId, quantity) {
        try {
            // Get item data from itemSheet to check if it should have durability
            const itemData = require('../../../data/itemSheet.json').find(it => String(it.id) === String(itemId));
            const shouldHaveDurability = itemData && (itemData.type === 'tool' || itemData.type === 'equipment' || itemData.type === 'charm');
            const maxDurability = itemData?.durability || 100;
            
            // Try to update existing item
            const updated = await PlayerInventory.findOneAndUpdate(
                { 
                    playerId,
                    'items.itemId': itemId
                },
                {
                    $inc: { 'items.$.quantity': quantity },
                    $set: { playerTag }
                },
                { new: true }
            );
            
            if (!updated) {
                // Item doesn't exist, try to add it
                const newItem = { itemId, quantity };
                
                // Add durability for tools, equipment, and charms
                if (shouldHaveDurability) {
                    newItem.currentDurability = maxDurability;
                }
                
                const added = await PlayerInventory.findOneAndUpdate(
                    { playerId },
                    {
                        $push: { items: newItem },
                        $set: { playerTag }
                    },
                    { new: true, upsert: true }
                );
                
                if (!added) {
                    // Create new document
                    await PlayerInventory.create({
                        playerId,
                        playerTag,
                        items: [newItem]
                    });
                }
            }
        } catch (error) {
            console.error(`Error adding item ${itemId} for player ${playerId}:`, error);
        }
    }
    
    async commit() {
        const promises = [];
        
        // Group inventory operations by player to avoid conflicts
        const playerInventoryOps = new Map();
        
        // Collect all inventory updates by player
        for (const update of this.inventoryUpdates.values()) {
            if (!playerInventoryOps.has(update.playerId)) {
                playerInventoryOps.set(update.playerId, {
                    playerId: update.playerId,
                    playerTag: update.playerTag,
                    additions: [],
                    removals: [],
                    durabilityUpdates: []
                });
            }
            playerInventoryOps.get(update.playerId).additions.push({
                itemId: update.itemId,
                quantity: update.quantity
            });
        }
        
        // Add pickaxe breaks to the same player operations
        for (const breakData of this.pickaxeBreaks) {
            if (!playerInventoryOps.has(breakData.playerId)) {
                playerInventoryOps.set(breakData.playerId, {
                    playerId: breakData.playerId,
                    playerTag: breakData.playerTag,
                    additions: [],
                    removals: [],
                    durabilityUpdates: []
                });
            }
            playerInventoryOps.get(breakData.playerId).removals.push(breakData.pickaxe);
        }
        
        // Add durability updates to the same player operations
        for (const [key, update] of this.durabilityUpdates) {
            const { playerId, itemId, newDurability } = update;
            if (!playerInventoryOps.has(playerId)) {
                playerInventoryOps.set(playerId, {
                    playerId: playerId,
                    playerTag: '',
                    additions: [],
                    removals: [],
                    durabilityUpdates: []
                });
            }
            playerInventoryOps.get(playerId).durabilityUpdates.push({
                itemId: itemId,
                newDurability: newDurability
            });
        }
        
        // Execute all operations for each player atomically
        for (const ops of playerInventoryOps.values()) {
            promises.push(this.executePlayerInventoryOps(ops));
        }
        
        if (this.mapUpdate) {
            const mapPromise = gachaVC.updateOne(
                { channelId: this.mapUpdate.channelId },
                { $set: { 'gameData.map': this.mapUpdate.mapData } },
                { upsert: true }
            );
            promises.push(mapPromise);
        }
        
        for (const [channelId, updates] of Object.entries(this.vcUpdates)) {
            const vcPromise = gachaVC.updateOne(
                { channelId },
                { $set: updates }
            );
            promises.push(vcPromise);
        }
        
        await Promise.all(promises);
    }
}

// Enhanced item routing - checks if item should go to inventory or minecart
async function addItemWithDestination(dbEntry, playerId, itemId, amount, destination = 'minecart') {
    // Route to inventory if specified
    if (destination === 'inventory') {
        const PlayerInventory = require('../../../models/inventory');
        try {
            // Get player tag
            const player = await require('discord.js').Client.users?.fetch(playerId).catch(() => null);
            const playerTag = player?.tag || 'Unknown#0000';
            
            // Get item data from itemSheet
            const itemData = require('../../../data/itemSheet.json').find(it => String(it.id) === String(itemId));
            const shouldHaveDurability = itemData && (itemData.type === 'tool' || itemData.type === 'equipment' || itemData.type === 'charm' || itemData.type === 'consumable');
            const maxDurability = itemData?.durability || 100;
            
            // Try to update existing item
            const updated = await PlayerInventory.findOneAndUpdate(
                { 
                    playerId,
                    'items.itemId': itemId
                },
                {
                    $inc: { 'items.$.quantity': amount },
                    $set: { playerTag }
                },
                { new: true }
            );
            
            if (!updated) {
                // Item doesn't exist, try to add it
                const newItem = { itemId, quantity: amount };
                
                // Add durability for tools, equipment, charms, and consumables
                if (shouldHaveDurability) {
                    newItem.currentDurability = maxDurability;
                }
                
                const added = await PlayerInventory.findOneAndUpdate(
                    { playerId },
                    {
                        $push: { items: newItem },
                        $set: { playerTag }
                    },
                    { new: true, upsert: true }
                );
                
                if (!added) {
                    // Create new document
                    await PlayerInventory.create({
                        playerId,
                        playerTag,
                        items: [newItem]
                    });
                }
            }
            
            console.log(`[INVENTORY] Added ${amount}x item ${itemId} to player ${playerId}'s inventory`);
            return;
        } catch (error) {
            console.error(`[INVENTORY] Error adding item ${itemId} to player ${playerId}'s inventory:`, error);
            // Fall back to minecart on error
            destination = 'minecart';
        }
    }
    
    // Original minecart logic (for ores)
    if (destination === 'minecart') {
        return addItemToMinecart(dbEntry, playerId, itemId, amount);
    }
}

// Atomic minecart operations (for ores only)
async function addItemToMinecart(dbEntry, playerId, itemId, amount) {
    const channelId = dbEntry.channelId;
    
    // Debug logging to verify items are being added
    if (Math.random() < 0.1) { // Log 10% of additions to avoid spam
        console.log(`[MINECART] Adding ${amount}x item ${itemId} for player ${playerId} to channel ${channelId}`);
    }
    
    // Helper function to find item data (similar to fire blast)
    function findItemData(itemId) {
        // Check mining item pool first
        let found = miningItemPool.find(item => item.itemId === String(itemId));
        if (found) return found;
        
        // Check treasure items
        found = treasureItems.find(item => item.itemId === String(itemId));
        if (found) return found;
        
        // Check unified item pool
        if (UNIFIED_ITEM_POOL) {
            // Check ores
            if (UNIFIED_ITEM_POOL.ores) {
                found = UNIFIED_ITEM_POOL.ores.find(item => item.itemId === String(itemId));
                if (found) return found;
            }
            // Check equipment
            if (UNIFIED_ITEM_POOL.equipment) {
                found = UNIFIED_ITEM_POOL.equipment.find(item => item.itemId === String(itemId));
                if (found) return found;
            }
            // Check consumables
            if (UNIFIED_ITEM_POOL.consumables) {
                found = UNIFIED_ITEM_POOL.consumables.find(item => item.itemId === String(itemId));
                if (found) return found;
            }
            // Check treasures
            if (UNIFIED_ITEM_POOL.treasures) {
                found = UNIFIED_ITEM_POOL.treasures.find(item => item.itemId === String(itemId));
                if (found) return found;
            }
        }
        
        return null;
    }
    
    // Find item information from pools
    const poolItem = findItemData(itemId);
    
    // Get item name and value
    let itemName = poolItem?.name || `Item #${itemId}`;
    let itemValue = poolItem?.value || 1;
    
    if (poolItem) {
        
        // DEEPER MINE INTEGRATION: Track persistent value
        const totalValue = itemValue * amount;
        await deeperMineChecker.updatePersistentRunValue(dbEntry, totalValue);
        
        // Track persistent rare ores
        const rareTiers = ['rare', 'epic', 'legendary', 'unique', 'mythic'];
        if (rareTiers.includes(poolItem.tier)) {
            // Update rare ore count in stats
            await gachaVC.updateOne(
                { channelId: channelId },
                { 
                    $inc: { 
                        'gameData.stats.lifetimeRareOres': amount 
                    }
                }
            );
            
            if (Math.random() < 0.05) { // Log 5% of the time
                const currentRareOres = dbEntry.gameData?.stats?.lifetimeRareOres || 0;
                console.log(`[DEEPER MINE] Lifetime rare ores: ${currentRareOres + amount} (+${amount} ${poolItem.tier})`);
            }
        }
        
        if (Math.random() < 0.05) { // Log 5% of the time
            const currentLifetime = deeperMineChecker.calculatePersistentRunValue(dbEntry);
            console.log(`[DEEPER MINE] Lifetime value: ${currentLifetime} (+${totalValue})`);
        }
    }
    
    try {
        // First update to ensure the item structure exists with name and value
        await gachaVC.updateOne(
            { channelId: channelId },
            {
                $set: {
                    [`gameData.minecart.items.${itemId}.name`]: itemName,
                    [`gameData.minecart.items.${itemId}.value`]: itemValue
                }
            }
        );
        
        // Then increment the quantities
        await gachaVC.updateOne(
            { channelId: channelId },
            {
                $inc: {
                    [`gameData.minecart.items.${itemId}.quantity`]: amount,
                    [`gameData.minecart.items.${itemId}.contributors.${playerId}`]: amount,
                    [`gameData.minecart.contributors.${playerId}`]: amount,
                    'gameData.stats.totalOreFound': amount
                }
            }
        );
    } catch (error) {
        const currentDoc = await gachaVC.findOne({ channelId: channelId });
        
        const existingItems = currentDoc?.gameData?.minecart?.items || {};
        const existingContributors = currentDoc?.gameData?.minecart?.contributors || {};
        const existingStats = currentDoc?.gameData?.stats || { totalOreFound: 0, wallsBroken: 0, treasuresFound: 0 };
        
        existingItems[itemId] = existingItems[itemId] || { quantity: 0, contributors: {}, name: itemName, value: itemValue };
        existingItems[itemId].quantity = (existingItems[itemId].quantity || 0) + amount;
        existingItems[itemId].contributors[playerId] = (existingItems[itemId].contributors[playerId] || 0) + amount;
        existingItems[itemId].name = existingItems[itemId].name || itemName;  // Ensure name is set
        existingItems[itemId].value = existingItems[itemId].value || itemValue;  // Ensure value is set
        existingContributors[playerId] = (existingContributors[playerId] || 0) + amount;
        existingStats.totalOreFound = (existingStats.totalOreFound || 0) + amount;
        
        await gachaVC.updateOne(
            { channelId: channelId },
            {
                $set: {
                    'gameData.minecart.items': existingItems,
                    'gameData.minecart.contributors': existingContributors,
                    'gameData.stats': {
                    totalOreFound: parseInt(existingStats.totalOreFound) || 0,
                    wallsBroken: parseInt(existingStats.wallsBroken) || 0,
                    treasuresFound: parseInt(existingStats.treasuresFound) || 0,
                    lifetimeValue: existingStats.lifetimeValue || 0,
                    lifetimeRareOres: existingStats.lifetimeRareOres || 0,
                    exitTileFound: existingStats.exitTileFound || false,
                    exitTileFoundAt: existingStats.exitTileFoundAt
                }
                }
            },
            { upsert: true }
        );
    }
}

async function resetMinecart(channelId) {
    console.log(`[MINECART RESET] Resetting minecart for channel ${channelId}`);
    const result = await gachaVC.updateOne(
        { channelId: channelId },
        {
            $set: {
                'gameData.minecart.items': {},
                'gameData.minecart.contributors': {},
                'gameData.sessionStart': new Date()
            }
        }
    );
    console.log(`[MINECART RESET] Reset result for channel ${channelId}:`, result.modifiedCount, 'documents modified');
}

// Update item durability in inventory
async function updateItemDurability(playerId, itemId, newDurability) {
    try {
        console.log(`[DURABILITY UPDATE] Updating item ${itemId} to durability ${newDurability}`);
        
        // If durability is 0 or less, handle as a break
        if (newDurability <= 0) {
            console.log(`[DURABILITY UPDATE] Durability hit 0, breaking item`);
            
            // Get the inventory to check quantity
            const inventory = await PlayerInventory.findOne({ playerId });
            if (!inventory) return;
            
            const item = inventory.items.find(item => 
                (item.itemId?.toString() === itemId.toString()) || 
                (item.id?.toString() === itemId.toString())
            );
            
            if (!item) {
                console.log(`[DURABILITY UPDATE] Item not found in inventory`);
                return;
            }
            
            // Get max durability from itemSheet
            const itemSheet = require('../../../data/itemSheet.json');
            const itemData = itemSheet.find(it => String(it.id) === String(itemId));
            const maxDurability = itemData?.durability || 100;
            
            // Handle the break
            await breakPickaxe(playerId, '', { 
                id: itemId, 
                itemId: itemId, 
                name: itemData?.name || 'Unknown'
            });
            
            return;
        }
        
        // Normal durability update
        const result = await PlayerInventory.findOneAndUpdate(
            { 
                playerId,
                'items.itemId': itemId
            },
            {
                $set: { 'items.$.currentDurability': newDurability }
            },
            { new: true }
        );
        
        if (result) {
            console.log(`[DURABILITY UPDATE] Updated durability for item ${itemId} to ${newDurability}`);
        } else {
            // Try with 'id' field if 'itemId' didn't work
            const resultAlt = await PlayerInventory.findOneAndUpdate(
                { 
                    playerId,
                    'items.id': itemId
                },
                {
                    $set: { 'items.$.currentDurability': newDurability }
                },
                { new: true }
            );
            
            if (resultAlt) {
                console.log(`[DURABILITY UPDATE] Updated durability for item ${itemId} to ${newDurability} (using 'id' field)`);
            } else {
                console.log(`[DURABILITY UPDATE] Could not find item ${itemId} to update durability`);
            }
        }
    } catch (error) {
        console.error(`[DURABILITY UPDATE] Error updating durability for item ${itemId}:`, error);
    }
}

// IMPROVED breakPickaxe function with better debugging and error handling
async function breakPickaxe(playerId, playerTag, pickaxe) {
    console.log('=== BREAKPICKAXE DEBUG ===');
    console.log('Player ID:', playerId);
    console.log('Player Tag:', playerTag);
    console.log('Pickaxe object:', JSON.stringify(pickaxe, null, 2));
    
    // Get the pickaxe ID - check multiple possible field names
    const pickaxeId = pickaxe.id || pickaxe.itemId || pickaxe._id;
    
    if (!pickaxeId) {
        console.error('ERROR: No pickaxe ID found in pickaxe object');
        console.error('Available fields:', Object.keys(pickaxe));
        return false;
    }
    
    console.log('Using pickaxe ID:', pickaxeId);
    
    try {
        // First, check if the item exists in the inventory
        const inventory = await PlayerInventory.findOne({ playerId });
        
        if (!inventory) {
            console.error(`ERROR: No inventory found for player ${playerId}`);
            return false;
        }
        
        console.log('Current inventory items:', inventory.items.map(item => ({
            itemId: item.itemId,
            quantity: item.quantity,
            currentDurability: item.currentDurability
        })));
        
        // Check if there are multiple pickaxes with the same ID
        const pickaxesWithSameId = inventory.items.filter(item => String(item.itemId) === String(pickaxeId));
        if (pickaxesWithSameId.length > 1) {
            console.warn(`WARNING: Found ${pickaxesWithSameId.length} pickaxes with ID ${pickaxeId}! This could cause multiple breaks.`);
            console.warn('Pickaxes with same ID:', pickaxesWithSameId);
        }
        
        // Find the specific item - check multiple field names and string conversions
        const itemIndex = inventory.items.findIndex(item => {
            const itemIdStr = String(item.itemId || item.id || '');
            const pickaxeIdStr = String(pickaxeId);
            return itemIdStr === pickaxeIdStr;
        });
        
        if (itemIndex === -1) {
            console.error(`ERROR: Pickaxe ${pickaxeId} not found in inventory`);
            console.error('Looking for:', pickaxeId);
            console.error('Available item IDs:', inventory.items.map(i => i.itemId || i.id));
            return false;
        }
        
        const currentItem = inventory.items[itemIndex];
        const currentQuantity = currentItem.quantity || 1;
        console.log(`Found pickaxe at index ${itemIndex} with quantity ${currentQuantity}`);
        
        // Get max durability from itemSheet for resetting
        const itemSheet = require('../../../data/itemSheet.json');
        const itemData = itemSheet.find(it => String(it.id) === String(pickaxeId));
        const maxDurability = itemData?.durability || 100;
        
        if (currentQuantity > 1) {
            // IMPORTANT: Reset durability to max FIRST, then reduce quantity
            console.log(`Resetting durability to ${maxDurability} BEFORE reducing quantity from ${currentQuantity} to ${currentQuantity - 1}`);
            
            // Step 1: Reset durability to maximum first
            inventory.items[itemIndex].currentDurability = maxDurability;
            
            // Step 2: Then reduce the quantity by 1
            inventory.items[itemIndex].quantity = currentQuantity - 1;
            
            // Mark as modified and save
            inventory.markModified('items');
            await inventory.save();
            
            console.log(`SUCCESS: Reset durability to ${maxDurability}, then reduced ${pickaxe.name || 'pickaxe'} quantity to ${currentQuantity - 1}`);
            return true;
        } else {
            // Remove the item entirely
            console.log('Removing item entirely (quantity was 1)...');
            
            inventory.items.splice(itemIndex, 1);
            
            // Mark as modified and save
            inventory.markModified('items');
            await inventory.save();
            
            console.log(`SUCCESS: Removed ${pickaxe.name || 'pickaxe'} from inventory`);
            return true;
        }
        
    } catch (error) {
        console.error(`ERROR: Exception in breakPickaxe for player ${playerId}:`, error);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// Game Data Helpers
function initializeGameData(dbEntry, channelId) {
    if (!dbEntry.gameData) {
        console.log(`[INIT] Creating new game data for channel ${channelId}`);
        dbEntry.gameData = {
            gamemode: 'mining',
            map: null, // Will be initialized by map system
            minecart: {
                items: {},
                contributors: {}
            },
            sessionStart: new Date(),
            breakCount: 0,
            stats: {
                totalOreFound: 0,
                wallsBroken: 0,
                treasuresFound: 0,
                lifetimeRareOres: 0  // Track rare ores persistently
            },
            cycleCount: 0,  // CRITICAL: Initialize cycle count for break pattern
            playerHealth: {}  // Initialize health tracking for all players
        };
        dbEntry.markModified('gameData');
    } else {
        // gameData exists, but we need to ensure all required fields are present
        let modified = false;
        
        // CRITICAL FIX: Ensure gamemode field exists
        if (!dbEntry.gameData.gamemode) {
            console.log(`[INIT] Adding missing gamemode field for channel ${channelId}`);
            dbEntry.gameData.gamemode = 'mining';
            modified = true;
        }
        
        // Ensure minecart exists
        if (!dbEntry.gameData.minecart) {
            console.log(`[INIT] Adding missing minecart for channel ${channelId}`);
            dbEntry.gameData.minecart = { items: {}, contributors: {} };
            modified = true;
        }
        
        // Ensure stats exists
        if (!dbEntry.gameData.stats) {
            console.log(`[INIT] Adding missing stats for channel ${channelId}`);
            dbEntry.gameData.stats = {
                totalOreFound: 0,
                wallsBroken: 0,
                treasuresFound: 0,
                lifetimeRareOres: 0  // Track rare ores persistently
            };
            modified = true;
        }
        
        // CRITICAL FIX: Ensure cycleCount exists for break cycle tracking
        if (dbEntry.gameData.cycleCount === undefined || dbEntry.gameData.cycleCount === null) {
            console.log(`[INIT] Adding missing cycleCount for channel ${channelId}`);
            dbEntry.gameData.cycleCount = 0;
            modified = true;
        }
        
        // Ensure playerHealth exists for health tracking
        if (!dbEntry.gameData.playerHealth) {
            console.log(`[INIT] Adding missing playerHealth for channel ${channelId}`);
            dbEntry.gameData.playerHealth = {};
            modified = true;
        }
        
        // Ensure minecart has required structure
        if (!dbEntry.gameData.minecart.items) {
            dbEntry.gameData.minecart.items = {};
            modified = true;
        }
        if (!dbEntry.gameData.minecart.contributors) {
            dbEntry.gameData.minecart.contributors = {};
            modified = true;
        }
        
        if (modified) {
            dbEntry.markModified('gameData');
        }
    }
}

// Enhanced Mining Summary
async function createMiningSummary(channel, dbEntry) {
    console.log(`[MINECART SUMMARY] Starting summary for channel ${channel.id}`);
    
    const gameData = dbEntry.gameData;
    
    // FIX: Auto-repair missing gamemode
    if (gameData && !gameData.gamemode) {
        console.log(`[MINECART SUMMARY] Auto-fixing missing gamemode for channel ${channel.id}`);
        dbEntry.gameData.gamemode = 'mining';
        dbEntry.markModified('gameData');
        await dbEntry.save();
    }
    
    // Now safe to check
    if (!gameData || (gameData.gamemode && gameData.gamemode !== 'mining')) {
        console.log(`[MINECART SUMMARY] No game data or wrong gamemode for channel ${channel.id}`);
        return;
    }

    const minecart = gameData.minecart;
    const sessionStats = gameData.stats || { totalOreFound: 0, wallsBroken: 0, treasuresFound: 0 };
    
    console.log(`[MINECART SUMMARY] Minecart contents:`, minecart ? Object.keys(minecart.items || {}) : 'No minecart');
    if (minecart && minecart.items) {
        const itemsWithQuantity = Object.entries(minecart.items).filter(([id, data]) => data.quantity > 0);
        console.log(`[MINECART SUMMARY] Items with quantity > 0:`, itemsWithQuantity.map(([id, data]) => `${id}: ${data.quantity}`));
    }
    console.log(`[MINECART SUMMARY] Session stats:`, sessionStats);
    console.log(`[MINECART SUMMARY] Mining item pool has ${miningItemPool.length} items`);
    console.log(`[MINECART SUMMARY] Treasure items pool has ${treasureItems.length} items`);
    
    if (!minecart || !minecart.items) {
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription('The minecart is empty. No items to sell! Shop is now available!')
            .addFields({
                name: '📊 Session Statistics',
                value: `Walls Broken: ${sessionStats.wallsBroken}\nTreasures Found: ${sessionStats.treasuresFound}`,
                inline: true
            })
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    // Enhanced value calculation with bonuses
    let totalValue = 0;
    let totalItems = 0;
    const itemBreakdown = [];
    const contributorRewards = {};
    const tierCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };

    // Process each item type in the minecart
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        const poolItem = miningItemPool.find(item => item.itemId === itemId) || 
                        treasureItems.find(item => item.itemId === itemId);
        
        if (!poolItem || itemData.quantity <= 0) continue;

        const itemTotalValue = poolItem.value * itemData.quantity;
        totalValue += itemTotalValue;
        totalItems += itemData.quantity;
        
        // Track tier distribution
        if (poolItem.tier) {
            tierCounts[poolItem.tier] += itemData.quantity;
        }
        
        itemBreakdown.push(`${poolItem.name} x${itemData.quantity} = ${itemTotalValue} coins`);

        // Calculate fair contributor rewards
        const contributorCount = Object.keys(itemData.contributors || {}).length;
        if (contributorCount > 0) {
            for (const [playerId, contributed] of Object.entries(itemData.contributors)) {
                if (!contributorRewards[playerId]) {
                    contributorRewards[playerId] = { coins: 0, items: [], contribution: 0 };
                }
                
                const contributorShare = Math.floor((contributed / itemData.quantity) * itemTotalValue);
                contributorRewards[playerId].coins += contributorShare;
                contributorRewards[playerId].items.push(`${poolItem.name} x${contributed}`);
                contributorRewards[playerId].contribution += contributed;
            }
        }
    }

    if (totalItems === 0) {
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription('The minecart is empty. No items to sell! Shop is now available!')
            .addFields({
                name: '📊 Session Statistics',
                value: `Walls Broken: ${sessionStats.wallsBroken}\nTreasures Found: ${sessionStats.treasuresFound}`,
                inline: true
            })
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    // Calculate team bonus (1% per additional player, only if more than 1 player)
    const playerCount = Object.keys(contributorRewards).length;
    const teamBonusPercent = playerCount > 1 ? (playerCount - 1) * 0.01 : 0;
    const teamBonus = Math.floor(totalValue * teamBonusPercent);
    const finalValue = totalValue + teamBonus;

    // Reward contributors with enhanced error handling
    const contributorLines = [];
    for (const [playerId, reward] of Object.entries(contributorRewards)) {
        try {
            // Extract actual Discord user ID from familiar IDs (e.g., "123456_stone_golem_1" -> "123456")
            const actualUserId = playerId.includes('_') ? playerId.split('_')[0] : playerId;
            const member = await channel.guild.members.fetch(actualUserId);
            
            // Calculate individual reward including team bonus share
            const bonusShare = playerCount > 1 ? Math.floor(teamBonus / playerCount) : 0;
            const totalReward = Math.floor(reward.coins + bonusShare); // Ensure integer result
            
            let userCurrency = await Currency.findOne({ userId: actualUserId });
            
            if (!userCurrency) {
                userCurrency = await Currency.create({
                    userId: actualUserId,
                    usertag: member.user.tag,
                    money: totalReward
                });
            } else {
                userCurrency.money = Math.floor((userCurrency.money || 0) + totalReward); // Ensure integer result
                await userCurrency.save();
            }
            
            // Show bonus in contributor line if applicable, and indicate if familiars helped
            const familiarHelper = playerId !== actualUserId ? ' (+ familiar)' : '';
            if (playerCount > 1) {
                contributorLines.push(`${member.displayName}${familiarHelper}: ${reward.contribution} items → ${reward.coins} coins (+${bonusShare} bonus)`);
            } else {
                contributorLines.push(`${member.displayName}${familiarHelper}: ${reward.contribution} items → ${reward.coins} coins`);
            }
        } catch (error) {
            console.error(`Error rewarding player ${playerId}:`, error);
        }
    }

    // Create enhanced summary embed
    const tierSummary = Object.entries(tierCounts)
        .filter(([, count]) => count > 0)
        .map(([tier, count]) => `${tier}: ${count}`)
        .join(' | ');

    // Build description with contributors in code block
    let description = 'The minecart has been sold to the shop!\n\n';
    
    // Add total value line
    if (playerCount > 1) {
        description += `**Total Value:** ${finalValue} coins (${totalValue} + ${teamBonus} team bonus [${playerCount}p × ${Math.round(teamBonusPercent * 100)}%])\n\n`;
    } else {
        description += `**Total Value:** ${finalValue} coins\n\n`;
    }
    
    // Add contributors and rewards in code block
    description += '**Contributors & Rewards:**\n';
    description += '```\n';
    if (contributorLines.length > 0) {
        description += contributorLines.slice(0, 8).join('\n');
        if (contributorLines.length > 8) {
            description += '\n...and more contributors!';
        }
    } else {
        description += 'No contributors';
    }
    description += '\n```';

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
        .setTitle('🛒 Mining Session Complete')
        .setDescription(description)
        .addFields(
            {
                name: '📦 Items Sold',
                value: itemBreakdown.slice(0, 10).join('\n') + (itemBreakdown.length > 10 ? '\n...and more!' : ''),
                inline: false
            },
            {
                name: '📊 Session Statistics',
                value: `Ore Found: ${sessionStats.totalOreFound}\nWalls Broken: ${sessionStats.wallsBroken}\nTreasures Found: ${sessionStats.treasuresFound}`,
                inline: true
            },
            {
                name: '🏆 Item Tiers',
                value: tierSummary || 'No items found',
                inline: true
            }
        )
        .setColor(0xFFD700)
        .setTimestamp();

    await channel.send({ embeds: [embed] });
    
    console.log(`[MINECART SUMMARY] Sent summary embed, now resetting minecart for channel ${channel.id}`);
    await resetMinecart(channel.id);
    console.log(`[MINECART SUMMARY] Minecart reset complete for channel ${channel.id}`);
}

module.exports = {
    DatabaseTransaction,
    addItemToMinecart,
    addItemWithDestination,  // ← ADD THIS LINE
    resetMinecart,
    breakPickaxe,
    updateItemDurability,
    initializeGameData,
    createMiningSummary
};