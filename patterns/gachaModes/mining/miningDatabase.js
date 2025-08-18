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
    
    setMapUpdate(channelId, mapData) {
        this.mapUpdate = { channelId, mapData };
    }
    
    setVCUpdate(channelId, updates) {
        this.vcUpdates[channelId] = updates;
    }
    
    async commit() {
        const promises = [];
        
        if (this.inventoryUpdates.size > 0) {
            const inventoryPromises = Array.from(this.inventoryUpdates.values()).map(async (update) => {
                let inv = await PlayerInventory.findOne({ 
                    playerId: update.playerId, 
                    playerTag: update.playerTag 
                });
                
                if (!inv) {
                    inv = new PlayerInventory({ 
                        playerId: update.playerId, 
                        playerTag: update.playerTag, 
                        items: [{ itemId: update.itemId, quantity: update.quantity }] 
                    });
                } else {
                    const existing = inv.items.find(i => i.itemId === update.itemId);
                    if (existing) {
                        existing.quantity += update.quantity;
                    } else {
                        inv.items.push({ itemId: update.itemId, quantity: update.quantity });
                    }
                }
                
                return inv.save();
            });
            promises.push(...inventoryPromises);
        }
        
        if (this.pickaxeBreaks.length > 0) {
            const breakPromises = this.pickaxeBreaks.map(breakData => 
                breakPickaxe(breakData.playerId, breakData.playerTag, breakData.pickaxe)
            );
            promises.push(...breakPromises);
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

async function breakPickaxe(playerId, playerTag, pickaxe) {
    const inv = await PlayerInventory.findOne({ playerId });
    if (inv) {
        const itemIndex = inv.items.findIndex(i => i.itemId === pickaxe.itemId);
        if (itemIndex !== -1) {
            if (inv.items[itemIndex].quantity > 1) {
                inv.items[itemIndex].quantity -= 1;
            } else {
                inv.items.splice(itemIndex, 1);
            }
            await inv.save();
        }
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

    // Apply team bonuses
    const teamBonus = Math.floor(totalValue * 0.1); // 10% team bonus
    const finalValue = totalValue + teamBonus;

    // Reward contributors with enhanced error handling
    const contributorLines = [];
    for (const [playerId, reward] of Object.entries(contributorRewards)) {
        try {
            const member = await channel.guild.members.fetch(playerId);
            
            let userCurrency = await Currency.findOne({ userId: playerId });
            
            if (!userCurrency) {
                userCurrency = await Currency.create({
                    userId: playerId,
                    usertag: member.user.tag,
                    money: reward.coins
                });
            } else {
                userCurrency.money = (userCurrency.money || 0) + reward.coins;
                await userCurrency.save();
            }
            
            contributorLines.push(`${member.displayName}: ${reward.contribution} items → ${reward.coins} coins`);
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
        .setDescription(`The minecart has been sold to the shop!\n\n**Total Value:** ${finalValue} coins (${totalValue} + ${teamBonus} team bonus)`)
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
    initializeGameData,
    createMiningSummary
};
