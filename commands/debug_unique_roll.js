// Debug command for testing unique item rolling
// Usage: !debugroll [power_level] [luck_stat] [num_rolls]

const { 
    rollForItemFind,
    rollForUniqueItem,
    getPlayerUniqueItems,
    getGlobalUniqueItemStats
} = require('../patterns/uniqueItemFinding');
const { 
    UNIQUE_ITEMS,
    getAvailableUniqueItems,
    calculateUniqueItemDropWeights
} = require('../data/uniqueItemsSheet');
const UniqueItem = require('../models/uniqueItems');

module.exports = {
    name: 'debugroll',
    description: 'Debug command for testing unique item drops',
    category: 'Debug',
    permissions: ['ADMINISTRATOR'], // Admin only
    
    async execute(message, args) {
        // Check if user is admin or specific developer
        const ALLOWED_USERS = [
            // Add your Discord user ID here
            'YOUR_DISCORD_ID', // Replace with your actual Discord ID
        ];
        
        if (!message.member.permissions.has('ADMINISTRATOR') && !ALLOWED_USERS.includes(message.author.id)) {
            return message.reply('⛔ This debug command is restricted to administrators.');
        }
        
        // Parse arguments
        const powerLevel = parseInt(args[0]) || 5;
        const luckStat = parseInt(args[1]) || 10;
        const numRolls = parseInt(args[2]) || 1;
        const forceUnique = args.includes('--unique');
        const showStats = args.includes('--stats');
        const testPlayer = args.includes('--test');
        const resetItem = args.includes('--reset');
        
        // Validate arguments
        if (powerLevel < 1 || powerLevel > 7) {
            return message.reply('⚠️ Power level must be between 1 and 7');
        }
        if (numRolls < 1 || numRolls > 100) {
            return message.reply('⚠️ Number of rolls must be between 1 and 100');
        }
        
        try {
            let response = '```yaml\n🎲 UNIQUE ITEM DROP TESTING 🎲\n';
            response += '================================\n';
            response += `Power Level: ${powerLevel}\n`;
            response += `Luck Stat: ${luckStat}\n`;
            response += `Rolls: ${numRolls}\n`;
            response += `Force Unique: ${forceUnique}\n`;
            response += '================================\n\n';
            
            // Show global stats if requested
            if (showStats) {
                const stats = await getGlobalUniqueItemStats();
                if (stats) {
                    response += 'GLOBAL UNIQUE ITEM STATS:\n';
                    response += `Total Items: ${stats.totalItems}\n`;
                    response += `Owned: ${stats.ownedItems}\n`;
                    response += `Unowned: ${stats.unownedItems}\n`;
                    response += '\nITEM OWNERSHIP:\n';
                    for (const item of stats.items) {
                        response += `- ${item.name}: ${item.owner} (ML: ${item.maintenanceLevel}/10)\n`;
                    }
                    response += '\n================================\n\n';
                }
            }
            
            // Reset specific items if requested (for testing)
            if (resetItem && args.length > 3) {
                const itemIdToReset = parseInt(args[3]);
                const item = await UniqueItem.findOne({ itemId: itemIdToReset });
                if (item) {
                    item.ownerId = null;
                    item.ownerTag = null;
                    item.maintenanceLevel = 10;
                    await item.save();
                    response += `✅ Reset item ID ${itemIdToReset} to unowned state\n\n`;
                }
            }
            
            // Show available items at this power level
            const availableItems = getAvailableUniqueItems(powerLevel);
            response += `AVAILABLE UNIQUE ITEMS (Power ${powerLevel}):\n`;
            for (const item of availableItems) {
                const dbItem = await UniqueItem.findOne({ itemId: item.id });
                const status = dbItem?.ownerId ? `❌ Owned by ${dbItem.ownerTag}` : '✅ Available';
                response += `- [${item.id}] ${item.name} (Weight: ${item.dropWeight}) - ${status}\n`;
            }
            response += '\n';
            
            // Calculate and show drop weights
            const weights = calculateUniqueItemDropWeights(powerLevel);
            const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
            response += 'DROP PROBABILITIES:\n';
            for (const w of weights) {
                const percentage = ((w.weight / totalWeight) * 100).toFixed(2);
                response += `- ${w.item.name}: ${percentage}%\n`;
            }
            response += '\n';
            
            // Perform test rolls
            response += 'ROLL RESULTS:\n';
            const results = {
                unique: [],
                regular: [],
                nothing: 0
            };
            
            for (let i = 0; i < numRolls; i++) {
                let result;
                
                if (forceUnique) {
                    // Force unique item roll
                    result = await rollForUniqueItem(
                        testPlayer ? 'test_player_' + i : message.author.id,
                        testPlayer ? 'TestPlayer#' + i : message.author.tag,
                        powerLevel,
                        null
                    );
                } else {
                    // Normal roll
                    result = await rollForItemFind(
                        testPlayer ? 'test_player_' + i : message.author.id,
                        testPlayer ? 'TestPlayer#' + i : message.author.tag,
                        powerLevel,
                        luckStat,
                        'mining',
                        null,
                        message.guild.id
                    );
                }
                
                if (!result) {
                    results.nothing++;
                } else if (result.type === 'unique') {
                    results.unique.push(result.item.name);
                    response += `Roll ${i + 1}: 🌟 UNIQUE - ${result.item.name}\n`;
                } else {
                    results.regular.push(result.item.name);
                    response += `Roll ${i + 1}: 📦 Regular - ${result.item.name}\n`;
                }
            }
            
            // Summary
            response += '\n================================\n';
            response += 'SUMMARY:\n';
            response += `Unique Items Found: ${results.unique.length}\n`;
            response += `Regular Items Found: ${results.regular.length}\n`;
            response += `No Drop: ${results.nothing}\n`;
            
            if (results.unique.length > 0) {
                response += '\nUnique Items:\n';
                const uniqueCounts = {};
                results.unique.forEach(name => {
                    uniqueCounts[name] = (uniqueCounts[name] || 0) + 1;
                });
                for (const [name, count] of Object.entries(uniqueCounts)) {
                    response += `- ${name}: ${count}x\n`;
                }
            }
            
            response += '```';
            
            // Split message if too long
            if (response.length > 1900) {
                const chunks = response.match(/[\s\S]{1,1900}/g) || [];
                for (const chunk of chunks) {
                    await message.channel.send(chunk);
                }
            } else {
                await message.channel.send(response);
            }
            
            // Additional detailed embed for unique finds
            if (results.unique.length > 0 && !testPlayer) {
                const embed = {
                    color: 0xFFD700,
                    title: '🌟 Unique Items Found in Debug',
                    description: 'These items have been assigned to you (if not using --test flag)',
                    fields: [],
                    timestamp: new Date(),
                    footer: {
                        text: 'Debug Roll System'
                    }
                };
                
                for (const itemName of [...new Set(results.unique)]) {
                    const item = UNIQUE_ITEMS.find(i => i.name === itemName);
                    if (item) {
                        embed.fields.push({
                            name: item.name,
                            value: `${item.description}\n**Slot:** ${item.slot}\n**Value:** ${item.value} coins`,
                            inline: false
                        });
                    }
                }
                
                await message.channel.send({ embeds: [embed] });
            }
            
        } catch (error) {
            console.error('[DEBUG ROLL] Error:', error);
            return message.reply(`❌ Error during debug roll: ${error.message}`);
        }
    }
};

// Additional helper command for testing specific scenarios
module.exports.testScenarios = {
    // Test finding a specific unique item
    async testSpecificItem(message, itemId) {
        const item = UNIQUE_ITEMS.find(i => i.id === itemId);
        if (!item) {
            return message.reply('❌ Invalid item ID');
        }
        
        const dbItem = await UniqueItem.findOne({ itemId });
        if (!dbItem) {
            return message.reply('❌ Item not found in database. Run initialization first.');
        }
        
        if (dbItem.ownerId) {
            return message.reply(`⚠️ ${item.name} is already owned by ${dbItem.ownerTag}`);
        }
        
        // Force assign to user for testing
        dbItem.ownerId = message.author.id;
        dbItem.ownerTag = message.author.tag;
        dbItem.maintenanceLevel = 10;
        await dbItem.save();
        
        return message.reply(`✅ Successfully assigned ${item.name} to you for testing!`);
    },
    
    // Test maintenance decay
    async testMaintenanceDecay(message, itemId, decayAmount) {
        const dbItem = await UniqueItem.findOne({ itemId, ownerId: message.author.id });
        if (!dbItem) {
            return message.reply('❌ You don\'t own this item');
        }
        
        dbItem.maintenanceLevel = Math.max(0, dbItem.maintenanceLevel - decayAmount);
        await dbItem.save();
        
        const item = UNIQUE_ITEMS.find(i => i.id === itemId);
        return message.reply(`📉 ${item.name} maintenance level reduced to ${dbItem.maintenanceLevel}/10`);
    },
    
    // Force a specific drop weight for testing
    async testWithCustomWeights(message, customWeights) {
        // This would modify the drop weights temporarily for testing
        // Implementation depends on your specific needs
    }
};
