// miningDatabase.js - Database operations for mining
const gachaVC = require('../../../models/activevcs');
const PlayerInventory = require('../../../models/inventory');
const Currency = require('../../../models/currency');
const { miningItemPool, treasureItems } = require('./miningConstants');

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
            
            // Process all removals (pickaxe breaks) for this player
            for (const removal of ops.removals) {
                await breakPickaxe(ops.playerId, ops.playerTag, removal);
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

// Atomic minecart operations
async function addItemToMinecart(dbEntry, playerId, itemId, amount) {
    const channelId = dbEntry.channelId;
    
    try {
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
        
        existingItems[itemId] = existingItems[itemId] || { quantity: 0, contributors: {} };
        existingItems[itemId].quantity = (existingItems[itemId].quantity || 0) + amount;
        existingItems[itemId].contributors[playerId] = (existingItems[itemId].contributors[playerId] || 0) + amount;
        existingContributors[playerId] = (existingContributors[playerId] || 0) + amount;
        existingStats.totalOreFound = (existingStats.totalOreFound || 0) + amount;
        
        await gachaVC.updateOne(
            { channelId: channelId },
            {
                $set: {
                    'gameData.minecart.items': existingItems,
                    'gameData.minecart.contributors': existingContributors,
                    'gameData.stats': existingStats
                }
            },
            { upsert: true }
        );
    }
}

async function resetMinecart(channelId) {
    await gachaVC.updateOne(
        { channelId: channelId },
        {
            $set: {
                'gameData.minecart.items': {},
                'gameData.minecart.contributors': {},
                'gameData.sessionStart': new Date()
            }
        }
    );
}

// Update item durability in inventory
async function updateItemDurability(playerId, itemId, newDurability) {
    try {
        // First check if item exists and update durability
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
            console.log(`Updated durability for item ${itemId} to ${newDurability}`);
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
                console.log(`Updated durability for item ${itemId} to ${newDurability} (using 'id' field)`);
            } else {
                console.log(`Could not find item ${itemId} to update durability`);
            }
        }
    } catch (error) {
        console.error(`Error updating durability for item ${itemId}:`, error);
    }
}

async function breakPickaxe(playerId, playerTag, pickaxe) {
    console.log('Attempting to break pickaxe:', pickaxe.name, 'for player:', playerId);
    console.log('Pickaxe object:', pickaxe);
    
    // Handle different possible field names for the ID
    const pickaxeId = pickaxe.id || pickaxe.itemId || pickaxe._id;
    
    console.log('Pickaxe ID to search for:', pickaxeId);
    
    if (!pickaxeId) {
        console.error('No pickaxe ID found in:', pickaxe);
        return;
    }
    
    try {
        // First, let's check what the actual structure is
        const inventory = await PlayerInventory.findOne({ playerId });
        console.log('Current inventory items:', JSON.stringify(inventory?.items, null, 2));
        
        // Find the actual item to see its structure
        const actualItem = inventory?.items?.find(item => 
            (item.itemId?.toString() === pickaxeId.toString()) || 
            (item.id?.toString() === pickaxeId.toString()) ||
            (item._id?.toString() === pickaxeId.toString())
        );
        console.log('Found item in inventory:', actualItem);
        
        if (!actualItem) {
            console.log(`Pickaxe ${pickaxe.name} not found in inventory`);
            return;
        }
        
        // Determine the correct field name based on what we found
        let idFieldName = 'itemId';
        if (actualItem.id && !actualItem.itemId) {
            idFieldName = 'id';
        } else if (actualItem._id && !actualItem.itemId && !actualItem.id) {
            idFieldName = '_id';
        }
        
        console.log(`Using field name: items.${idFieldName}`);
        console.log('Current quantity:', actualItem.quantity);
        
        // Now perform the update with the correct field name
        if (actualItem.quantity > 1) {
            // Decrement quantity
            const updateQuery = { 
                playerId,
                [`items.${idFieldName}`]: pickaxeId
            };
            
            const updateOperation = {
                $inc: { 'items.$.quantity': -1 }
            };
            
            console.log('Update query:', updateQuery);
            console.log('Update operation:', updateOperation);
            
            const result = await PlayerInventory.findOneAndUpdate(
                updateQuery,
                updateOperation,
                { new: true }
            );
            
            if (result) {
                // Verify the update actually happened
                const updatedItem = result.items.find(item => 
                    (item[idFieldName]?.toString() === pickaxeId.toString())
                );
                console.log(`Successfully decremented ${pickaxe.name} quantity from ${actualItem.quantity} to ${updatedItem?.quantity}`);
            } else {
                console.log('Update failed - no document matched');
            }
        } else {
            // Remove the item entirely if quantity is 1 or less
            const pullQuery = {};
            pullQuery[idFieldName] = pickaxeId;
            
            console.log('Removing item with pull query:', pullQuery);
            
            const result = await PlayerInventory.findOneAndUpdate(
                { playerId },
                { 
                    $pull: { items: pullQuery }
                },
                { new: true }
            );
            
            if (result) {
                // Verify the item was removed
                const stillExists = result.items.find(item => 
                    (item[idFieldName]?.toString() === pickaxeId.toString())
                );
                
                if (!stillExists) {
                    console.log(`Successfully removed ${pickaxe.name} from ${playerTag}'s inventory`);
                } else {
                    console.log(`Failed to remove ${pickaxe.name} - item still exists`);
                }
            } else {
                console.log('Remove failed - no document found');
            }
        }
    } catch (error) {
        console.error(`Error breaking pickaxe for player ${playerId}:`, error);
        // Don't throw - just log the error to prevent mining from stopping
    }
}

// Game Data Helpers
function initializeGameData(dbEntry, channelId) {
    if (!dbEntry.gameData || dbEntry.gameData.gamemode !== 'mining') {
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
                treasuresFound: 0
            }
        };
        
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.minecart) {
        dbEntry.gameData.minecart = { items: {}, contributors: {} };
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.stats) {
        dbEntry.gameData.stats = {
            totalOreFound: 0,
            wallsBroken: 0,
            treasuresFound: 0
        };
        dbEntry.markModified('gameData');
    }
}

// Enhanced Mining Summary
async function createMiningSummary(channel, dbEntry) {
    const gameData = dbEntry.gameData;
    if (!gameData || gameData.gamemode !== 'mining') return;

    const minecart = gameData.minecart;
    const sessionStats = gameData.stats || { totalOreFound: 0, wallsBroken: 0, treasuresFound: 0 };
    
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
            const member = await channel.guild.members.fetch(playerId);
            
            // Calculate individual reward including team bonus share
            const bonusShare = playerCount > 1 ? Math.floor(teamBonus / playerCount) : 0;
            const totalReward = reward.coins + bonusShare;
            
            let userCurrency = await Currency.findOne({ userId: playerId });
            
            if (!userCurrency) {
                userCurrency = await Currency.create({
                    userId: playerId,
                    usertag: member.user.tag,
                    money: totalReward
                });
            } else {
                userCurrency.money = (userCurrency.money || 0) + totalReward;
                await userCurrency.save();
            }
            
            // Show bonus in contributor line if applicable
            if (playerCount > 1) {
                contributorLines.push(`${member.displayName}: ${reward.contribution} items → ${reward.coins} coins (+${bonusShare} bonus)`);
            } else {
                contributorLines.push(`${member.displayName}: ${reward.contribution} items → ${reward.coins} coins`);
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

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
        .setTitle('🛒 Mining Session Complete')
        .setDescription(
            playerCount > 1 
                ? `The minecart has been sold to the shop!\n\n**Total Value:** ${finalValue} coins (${totalValue} + ${teamBonus} team bonus [${playerCount}p × ${Math.round(teamBonusPercent * 100)}%])`
                : `The minecart has been sold to the shop!\n\n**Total Value:** ${finalValue} coins`
        )
        .addFields(
            {
                name: '📦 Items Sold',
                value: itemBreakdown.slice(0, 10).join('\n') + (itemBreakdown.length > 10 ? '\n...and more!' : ''),
                inline: false
            },
            {
                name: '👥 Contributors & Rewards',
                value: contributorLines.slice(0, 8).join('\n') || 'None',
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
    await resetMinecart(channel.id);
}

module.exports = {
    DatabaseTransaction,
    addItemToMinecart,
    resetMinecart,
    breakPickaxe,
    updateItemDurability,
    initializeGameData,
    createMiningSummary
};
