// patterns/uniqueItemFinding.js
// System for finding and assigning unique items to players

const UniqueItem = require('../models/uniqueItems');
const PlayerInventory = require('../models/inventory');
const Sacrifice = require('../models/SacrificeSchema');
const { 
    UNIQUE_ITEMS, 
    getUniqueItemById, 
    getAvailableUniqueItems,
    calculateUniqueItemDropWeights 
} = require('../data/uniqueItemsSheet');
const { 
    calculateItemFindChance,
    getAvailableRegularItems 
} = require('./gachaModes/mining/miningConstants_unified');
const { 
    ITEM_FINDING_CONFIG 
} = require('./gachaModes/mining/fixes/miningConstants');
const { 
    tryConditionalDrop,
    isConditionalItem 
} = require('./conditionalUniqueItems');

// Initialize unique items in database if they don't exist
async function initializeUniqueItems() {
    try {
        console.log('[UNIQUE ITEMS] Initializing unique items database...');
        
        for (const itemData of UNIQUE_ITEMS) {
            const exists = await UniqueItem.findOne({ itemId: itemData.id });
            
            if (!exists) {
                await UniqueItem.create({
                    itemId: itemData.id,
                    maintenanceType: itemData.maintenanceType,
                    maintenanceCost: itemData.maintenanceCost,
                    requiresMaintenance: itemData.requiresMaintenance,
                    maintenanceLevel: 10
                });
                
                console.log(`[UNIQUE ITEMS] Created database entry for: ${itemData.name}`);
            }
        }
        
        console.log('[UNIQUE ITEMS] Initialization complete');
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error initializing:', error);
    }
}

// Roll for item finding
async function rollForItemFind(playerId, playerTag, powerLevel, luckStat, activityType = 'mining', biome = null, guildId = null, mineId = null) {
    try {
        // First check for conditional drops (like Midas' Burden)
        // Check more frequently for wealthy players
        if (guildId) {
            // Get player wealth to determine check frequency
            const Money = require('../models/currency');
            const playerMoney = await Money.findOne({ userId: playerId });
            const playerWealth = playerMoney?.money || 0;
            
            // Use the Midas drop chance calculation directly for check frequency
            // This makes wealthy players check for Midas Burden much more often
            const { calculateMidasDropChance } = require('./conditionalUniqueItems');
            const checkChance = calculateMidasDropChance(playerWealth) * 0.11; // Scale down to reasonable check rate (targeting 1 in 1000 at 1M wealth)
            
            if (Math.random() < checkChance) {
                const conditionalItems = [10]; // Midas' Burden
                for (const itemId of conditionalItems) {
                    const result = await tryConditionalDrop(
                        { id: playerId, user: { tag: playerTag }, displayName: playerTag },
                        guildId,
                        itemId
                    );
                    if (result) {
                        const item = getUniqueItemById(itemId);
                        // Include wealth info in the announcement
                        const wealthDisplay = playerWealth >= 1000000 
                            ? `${(playerWealth / 1000000).toFixed(1)}M` 
                            : playerWealth >= 1000 
                            ? `${(playerWealth / 1000).toFixed(0)}K`
                            : `${playerWealth}`;
                        
                        return {
                            type: 'unique',
                            item: item,
                            message: result.message,
                            // Special announcement for system channel with big text
                            systemAnnouncement: {
                                enabled: true,
                                bigText: true,
                                message: `# 🌟 LEGENDARY DISCOVERY! 🌟\n## ${playerTag} has found the legendary **${item.name}**!\n### ${item.description || 'A unique and powerful item!'}\n### 💰 Player Wealth: ${wealthDisplay} coins\n\n*This item is one-of-a-kind and now belongs to ${playerTag}!*`
                            }
                        };
                    }
                }
            }
        }
        // Check if this is a boosted mine - if so, use 100% find chance
        const { UNIQUE_ITEMS } = require('../data/uniqueItemsSheet');
        const boostedItems = UNIQUE_ITEMS.filter(item => 
            item.mineSpecificDropRates && item.mineSpecificDropRates[String(mineId)]
        );
        
        let findChance;
        if (boostedItems.length > 0) {
            findChance = 1.0; // 100% for boosted mines
            console.log(`[ROLL DEBUG] BOOSTED MINE - using 100% find chance instead of calculated chance`);
        } else {
            findChance = calculateItemFindChance(powerLevel, luckStat, activityType);
            console.log(`[ROLL DEBUG] calculateItemFindChance returned: ${(findChance * 100).toFixed(3)}% for power ${powerLevel}, luck ${luckStat}, activity ${activityType}`);
        }
        
        const itemFindRoll = Math.random();
        console.log(`[ROLL DEBUG] Item find roll: ${(itemFindRoll * 100).toFixed(3)}% vs ${(findChance * 100).toFixed(3)}% threshold`);
        
        if (itemFindRoll > findChance) {
            console.log(`[ROLL DEBUG] ❌ Item find failed - roll too high`);
            return null; // No item found
        }
        
        console.log(`[ROLL DEBUG] ✅ Item find succeeded - proceeding to unique/regular decision`);
        
        // Determine if it should be unique or regular
        const uniqueRoll = Math.random();
        const uniqueThreshold = ITEM_FINDING_CONFIG.uniqueItemWeight;
        console.log(`[ROLL DEBUG] Unique roll: ${(uniqueRoll * 100).toFixed(3)}% vs ${(uniqueThreshold * 100).toFixed(3)}% threshold (uniqueItemWeight)`);
        
        const isUnique = uniqueRoll < uniqueThreshold;
        console.log(`[ROLL DEBUG] Will try for: ${isUnique ? 'UNIQUE' : 'REGULAR'} item`);
        
        if (isUnique) {
            // Try to find an unowned unique item
            console.log(`[ROLL DEBUG] Calling rollForUniqueItem for mine ${mineId}...`);
            const uniqueItem = await rollForUniqueItem(playerId, playerTag, powerLevel, biome, mineId);
            console.log(`[ROLL DEBUG] rollForUniqueItem result: ${uniqueItem ? `SUCCESS - ${uniqueItem.item.name}` : 'FAILED/NULL'}`);
            if (uniqueItem) {
                return uniqueItem;
            }
            console.log(`[ROLL DEBUG] No unique item available, falling back to regular item...`);
        }
        
        // Fall back to regular item
        return await rollForRegularItem(playerId, playerTag, powerLevel);
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error in item roll:', error);
        return null;
    }
}

// Roll for a unique item
async function rollForUniqueItem(playerId, playerTag, powerLevel, biome = null, mineId = null) {
    try {
        // Get available unique items for this power level
        let availableItems = getAvailableUniqueItems(powerLevel);
        
        // If in a boosted mine, ONLY consider boosted items
        if (mineId) {
            const boostedItems = availableItems.filter(item => 
                item.mineSpecificDropRates && item.mineSpecificDropRates[String(mineId)]
            );
            
            if (boostedItems.length > 0) {
                availableItems = boostedItems;
                console.log(`[UNIQUE FINDING] Mine ${mineId} - restricting to ${boostedItems.length} boosted unique(s): ${boostedItems.map(i => i.name).join(', ')}`);
            }
        }
        
        if (availableItems.length === 0) return null;
        
        // Find which ones are unowned (excluding conditional items)
        console.log(`[UNIQUE ROLL DEBUG] Checking ownership status for ${availableItems.length} available items...`);
        
        const unownedItems = [];
        for (const itemData of availableItems) {
            console.log(`[UNIQUE ROLL DEBUG] Checking ${itemData.name} (ID: ${itemData.id})...`);
            
            // Skip conditional items in normal rolling
            if (isConditionalItem(itemData.id)) {
                console.log(`[UNIQUE ROLL DEBUG] - Skipping ${itemData.name} - is conditional item`);
                continue;
            }
            
            const dbItem = await UniqueItem.findOne({ itemId: itemData.id });
            console.log(`[UNIQUE ROLL DEBUG] - Database lookup result: ${dbItem ? `found, ownerId: ${dbItem.ownerId || 'UNOWNED'}` : 'NOT FOUND IN DB'}`);
            
            if (dbItem && !dbItem.ownerId) {
                unownedItems.push({ itemData, dbItem });
                console.log(`[UNIQUE ROLL DEBUG] - ✅ ${itemData.name} is UNOWNED and available`);
            } else {
                console.log(`[UNIQUE ROLL DEBUG] - ❌ ${itemData.name} is ${!dbItem ? 'NOT IN DATABASE' : 'ALREADY OWNED'}`);
            }
        }
        
        console.log(`[UNIQUE ROLL DEBUG] Found ${unownedItems.length} unowned items: ${unownedItems.map(u => u.itemData.name).join(', ')}`);
        
        if (unownedItems.length === 0) {
            console.log(`[UNIQUE ROLL DEBUG] ❌ NO UNOWNED ITEMS AVAILABLE - all boosted items are already owned!`);
            return null;
        }
        
        // Calculate weights for unowned items - now includes mine-specific bonuses
        const weights = calculateUniqueItemDropWeights(powerLevel, biome, mineId)
            .filter(w => unownedItems.some(u => u.itemData.id === w.item.id));
        
        if (weights.length === 0) return null;
        
        // Weighted random selection
        const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
        let random = Math.random() * totalWeight;
        
        let selectedItem = null;
        for (const weightedItem of weights) {
            random -= weightedItem.weight;
            if (random <= 0) {
                const found = unownedItems.find(u => u.itemData.id === weightedItem.item.id);
                if (found) {
                    selectedItem = found;
                    break;
                }
            }
        }
        
        if (!selectedItem) {
            selectedItem = unownedItems[0]; // Fallback
        }
        
        // Assign the item to the player
        await selectedItem.dbItem.assignToPlayer(playerId, playerTag);
        
        console.log(`[UNIQUE ITEMS] Player ${playerTag} found unique item: ${selectedItem.itemData.name}`);
        
        return {
            type: 'unique',
            item: selectedItem.itemData,
            dbItem: selectedItem.dbItem,
            message: `🌟 LEGENDARY FIND! ${playerTag} discovered **${selectedItem.itemData.name}**! This unique item is now yours!`,
            // Special announcement for system channel with big text
            systemAnnouncement: {
                enabled: true,
                bigText: true,
                message: `# 🌟 LEGENDARY DISCOVERY! 🌟\n## ${playerTag} has found the legendary **${selectedItem.itemData.name}**!\n### ${selectedItem.itemData.description || 'A unique and powerful item!'}\n\n*This item is one-of-a-kind and now belongs to ${playerTag}!*`
            }
        };
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error rolling for unique:', error);
        return null;
    }
}

// Roll for a regular item
async function rollForRegularItem(playerId, playerTag, powerLevel) {
    try {
        const availableItems = getAvailableRegularItems(powerLevel);
        if (availableItems.length === 0) return null;
        
        // Weighted random selection
        const totalWeight = availableItems.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;
        
        let selectedItem = availableItems[0];
        for (const item of availableItems) {
            random -= item.weight;
            if (random <= 0) {
                selectedItem = item;
                break;
            }
        }
        
        // Add to player inventory
        await addItemToPlayerInventory(playerId, playerTag, selectedItem.itemId, 1);
        
        return {
            type: 'regular',
            item: selectedItem,
            message: `📦 ${playerTag} found: **${selectedItem.name}**!`
        };
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error rolling for regular item:', error);
        return null;
    }
}

// Add item to player inventory (for regular items)
async function addItemToPlayerInventory(playerId, playerTag, itemId, quantity) {
    try {
        let inventory = await PlayerInventory.findOne({ playerId });
        
        if (!inventory) {
            inventory = await PlayerInventory.create({
                playerId,
                playerTag,
                items: []
            });
        }
        
        // Find existing item or add new
        const existingItem = inventory.items.find(i => i.itemId === itemId);
        
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            inventory.items.push({
                itemId,
                quantity
            });
        }
        
        await inventory.save();
        return true;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error adding to inventory:', error);
        return false;
    }
}

// Get all unique items owned by a player
async function getPlayerUniqueItems(playerId) {
    try {
        const items = await UniqueItem.findPlayerUniqueItems(playerId);
        const itemsWithData = [];
        
        for (const dbItem of items) {
            const itemData = getUniqueItemById(dbItem.itemId);
            if (itemData) {
                itemsWithData.push({
                    ...itemData,
                    maintenanceLevel: dbItem.maintenanceLevel,
                    lastMaintenance: dbItem.lastMaintenanceDate,
                    statistics: dbItem.statistics
                });
            }
        }
        
        return itemsWithData;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error getting player items:', error);
        return [];
    }
}

// Check if a player owns any unique items
async function playerHasUniqueItems(playerId) {
    try {
        const count = await UniqueItem.countDocuments({ ownerId: playerId });
        return count > 0;
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error checking player items:', error);
        return false;
    }
}

// Transfer unique item between players (for trading)
async function transferUniqueItem(fromPlayerId, toPlayerId, toPlayerTag, itemId) {
    try {
        const item = await UniqueItem.findOne({ itemId, ownerId: fromPlayerId });
        
        if (!item) {
            throw new Error('Item not found or you do not own it');
        }
        
        // Add to history
        item.previousOwners.push({
            userId: fromPlayerId,
            userTag: item.ownerTag,
            acquiredDate: item.updatedAt,
            lostDate: new Date(),
            lostReason: 'traded'
        });
        
        // Transfer ownership
        item.ownerId = toPlayerId;
        item.ownerTag = toPlayerTag;
        item.maintenanceLevel = 10; // Reset maintenance for new owner
        
        await item.save();
        
        const itemData = getUniqueItemById(itemId);
        console.log(`[UNIQUE ITEMS] ${itemData.name} transferred from ${fromPlayerId} to ${toPlayerTag}`);
        
        return true;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error transferring item:', error);
        throw error;
    }
}

// Get global unique item statistics
async function getGlobalUniqueItemStats() {
    try {
        const allItems = await UniqueItem.find({});
        const stats = {
            totalItems: UNIQUE_ITEMS.length,
            ownedItems: 0,
            unownedItems: 0,
            mostFound: null,
            mostLost: null,
            items: []
        };
        
        for (const dbItem of allItems) {
            const itemData = getUniqueItemById(dbItem.itemId);
            if (!itemData) continue;
            
            const itemStat = {
                id: dbItem.itemId, // Add the ID field
                name: itemData.name,
                owner: dbItem.ownerTag || 'Unowned',
                timesFound: dbItem.statistics.timesFound,
                timesLost: dbItem.statistics.timesLostToMaintenance,
                maintenanceLevel: dbItem.maintenanceLevel
            };
            
            stats.items.push(itemStat);
            
            if (dbItem.ownerId) {
                stats.ownedItems++;
            } else {
                stats.unownedItems++;
            }
            
            if (!stats.mostFound || itemStat.timesFound > stats.mostFound.timesFound) {
                stats.mostFound = itemStat;
            }
            
            if (!stats.mostLost || itemStat.timesLost > stats.mostLost.timesLost) {
                stats.mostLost = itemStat;
            }
        }
        
        return stats;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error getting global stats:', error);
        return null;
    }
}

// Send legendary announcement to PUBLIC channels only (text channels and voice channel text)
async function sendLegendaryAnnouncement(client, guildId, itemResult, playerTag) {
    try {
        if (!itemResult.systemAnnouncement || !itemResult.systemAnnouncement.enabled) {
            return false;
        }
        
        // Fetch the guild
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.error('[LEGENDARY] Guild not found:', guildId);
            return false;
        }
        
        // Get @everyone role to check public channels
        const everyoneRole = guild.roles.everyone;
        
        // Get all public channels (text channels and voice channel text areas)
        const publicChannels = guild.channels.cache.filter(channel => {
            // Check if it's a text channel (0) or voice channel (2) 
            const isTextChannel = channel.type === 0; // GUILD_TEXT
            const isVoiceChannel = channel.type === 2; // GUILD_VOICE
            
            // Skip if not text or voice
            if (!isTextChannel && !isVoiceChannel) return false;
            
            // Check if bot can send messages
            const botPerms = channel.permissionsFor(guild.members.me);
            if (!botPerms || !botPerms.has(['SendMessages', 'ViewChannel'])) return false;
            
            // Check if @everyone can view the channel (making it "public")
            const everyonePerms = channel.permissionsFor(everyoneRole);
            if (!everyonePerms || !everyonePerms.has('ViewChannel')) return false;
            
            // For voice channels, only include if text-in-voice is enabled
            if (isVoiceChannel) {
                // Voice channels can have text if SendMessages permission exists
                return botPerms.has('SendMessages');
            }
            
            return true;
        });
        
        if (publicChannels.size === 0) {
            console.error('[LEGENDARY] No accessible public channels in guild:', guildId);
            return false;
        }
        
        // Create the legendary announcement with big text
        const announcementMessage = itemResult.systemAnnouncement.message;
        
        // Track successful sends
        let successCount = 0;
        let failCount = 0;
        
        console.log(`[LEGENDARY] Sending announcement to ${publicChannels.size} public channels...`);
        
        // Send to all public channels with a small delay to avoid rate limits
        for (const [channelId, channel] of publicChannels) {
            try {
                // Send the announcement
                const message = await channel.send(announcementMessage);
                
                // Add celebration reactions (only to first few messages to avoid rate limits)
                if (successCount < 5) {
                    const reactions = ['🎉', '🌟', '💎', '🏆', '✨', '🔥'];
                    for (const reaction of reactions) {
                        await message.react(reaction).catch(err => 
                            console.error('[LEGENDARY] Failed to add reaction:', err)
                        );
                    }
                }
                
                successCount++;
                
                // Small delay between sends to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                failCount++;
                console.error(`[LEGENDARY] Failed to send to channel ${channel.name}:`, error.message);
            }
        }
        
        console.log(`[LEGENDARY] Announced ${itemResult.item.name} found by ${playerTag} in ${successCount}/${publicChannels.size} public channels`);
        
        return successCount > 0;
        
    } catch (error) {
        console.error('[LEGENDARY] Error sending announcements:', error);
        return false;
    }
}

// Alternative: Send legendary announcement with embed for extra flair
async function sendLegendaryAnnouncementWithEmbed(client, guildId, itemResult, playerTag) {
    try {
        if (!itemResult.systemAnnouncement || !itemResult.systemAnnouncement.enabled) {
            return false;
        }
        
        // Fetch the guild
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.error('[LEGENDARY] Guild not found:', guildId);
            return false;
        }
        
        // Create a rich embed for the announcement
        const { EmbedBuilder } = require('discord.js');
        const legendaryEmbed = new EmbedBuilder()
            .setColor('#FFD700') // Gold color
            .setTitle('🌟 LEGENDARY ITEM DISCOVERED! 🌟')
            .setDescription(`**${playerTag}** has found the legendary\n# **${itemResult.item.name}**`)
            .addFields(
                { name: '📜 Description', value: itemResult.item.description || 'A unique and powerful item!' },
                { name: '⚡ Power Level', value: `${itemResult.item.powerLevel || 'Unknown'}`, inline: true },
                { name: '🎯 Rarity', value: 'LEGENDARY', inline: true },
                { name: '🏆 Status', value: 'One-of-a-kind item!', inline: true }
            )
            .setThumbnail('https://i.imgur.com/AfFp7pu.png') // Replace with your legendary icon
            .setTimestamp()
            .setFooter({ text: 'A legendary moment in server history!' });
        
        // Get @everyone role to check public channels
        const everyoneRole = guild.roles.everyone;
        
        // Get all public channels (text channels and voice channel text areas)
        const publicChannels = guild.channels.cache.filter(channel => {
            // Check if it's a text channel (0) or voice channel (2)
            const isTextChannel = channel.type === 0; // GUILD_TEXT
            const isVoiceChannel = channel.type === 2; // GUILD_VOICE
            
            // Skip if not text or voice
            if (!isTextChannel && !isVoiceChannel) return false;
            
            // Check if bot can send messages and embeds
            const botPerms = channel.permissionsFor(guild.members.me);
            if (!botPerms || !botPerms.has(['SendMessages', 'ViewChannel', 'EmbedLinks'])) return false;
            
            // Check if @everyone can view the channel (making it "public")
            const everyonePerms = channel.permissionsFor(everyoneRole);
            if (!everyonePerms || !everyonePerms.has('ViewChannel')) return false;
            
            // For voice channels, only include if text-in-voice is enabled
            if (isVoiceChannel) {
                // Voice channels can have text if SendMessages permission exists
                return botPerms.has('SendMessages');
            }
            
            return true;
        });
        
        // Send to all public channels
        let successCount = 0;
        
        for (const [channelId, channel] of publicChannels) {
            try {
                // Send both the big text and the embed
                const message = await channel.send({
                    content: itemResult.systemAnnouncement.message,
                    embeds: [legendaryEmbed]
                });
                
                // Add reactions to first few messages
                if (successCount < 3) {
                    const reactions = ['🎉', '🌟', '💎'];
                    for (const reaction of reactions) {
                        await message.react(reaction).catch(() => {});
                    }
                }
                
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 150)); // Rate limit protection
                
            } catch (error) {
                // Silently skip channels we can't send to
            }
        }
        
        console.log(`[LEGENDARY] Sent legendary announcement to ${successCount} public channels`);
        return successCount > 0;
        
    } catch (error) {
        console.error('[LEGENDARY] Error sending embed announcements:', error);
        return false;
    }
}

module.exports = {
    initializeUniqueItems,
    rollForItemFind,
    rollForUniqueItem,
    rollForRegularItem,
    getPlayerUniqueItems,
    playerHasUniqueItems,
    transferUniqueItem,
    getGlobalUniqueItemStats,
    sendLegendaryAnnouncement,
    sendLegendaryAnnouncementWithEmbed
};
