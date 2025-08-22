// when users are in this channel >
// they passively gain 1-3 coins based on randomness >
// 
const Money = require('../../models/currency'); // Adjust path as needed
const PlayerInventory = require('../../models/inventory'); // your inventory schema
const generateShop = require('../generateShop');
const { EmbedBuilder } = require('discord.js');
const InnKeeperSales = require('./innKeeping/innKeeperSales');
const InnSalesLog = require('./innKeeping/innSalesLog');
const getPlayerStats = require('../calculatePlayerStat');
const gachaServers = require('../../data/gachaServers.json');
const itemSheet = require('../../data/itemSheet.json');
const shopData = require('../../data/shops.json');
const npcs = require('../../data/npcs.json');
const ActiveVCs = require('../../models/activevcs');

// Function to calculate salary based on power level
function calculateBaseSalary(power) {
    // Power 1 = 100, exponential increase
    const baseSalary = 100 * Math.pow(2, power - 1);
    return Math.floor(baseSalary);
}

// Function to calculate effectiveness bonus
async function calculateEffectivenessBonus(memberId, baseSalary) {
    try {
        const playerData = await getPlayerStats(memberId);
        const speedStat = playerData.stats.speed || 0;
        const sightStat = playerData.stats.sight || 0;
        
        // Combined effectiveness from speed and sight
        // Each stat point adds 1% effectiveness
        const effectivenessMultiplier = 1 + ((speedStat + sightStat) / 100);
        const effectivenessBonus = Math.floor(baseSalary * (effectivenessMultiplier - 1));
        
        return {
            bonus: effectivenessBonus,
            speedStat,
            sightStat,
            multiplier: effectivenessMultiplier
        };
    } catch (error) {
        console.error('[InnKeeper] Error calculating effectiveness:', error);
        return {
            bonus: 0,
            speedStat: 0,
            sightStat: 0,
            multiplier: 1
        };
    }
}

// Function to generate NPC customer sales
async function generateNPCSale(channel, dbEntry) {
    try {
        // Get current shop items
        const gachaInfo = gachaServers.find(g => g.id === dbEntry.typeId);
        if (!gachaInfo) return null;
        
        const shopInfo = shopData.find(s => s.id === gachaInfo.shop);
        if (!shopInfo) return null;
        
        // Get available items (static + rotational)
        const availableItems = [...shopInfo.staticItems];
        
        // Only add consumables from the available items
        const consumableItems = availableItems
            .map(id => itemSheet.find(item => String(item.id) === String(id)))
            .filter(item => item && (item.type === 'consumable' || item.subtype === 'food' || item.subtype === 'drink'));
        
        if (consumableItems.length === 0) return null;
        
        // Select a random NPC based on frequency
        const npcWeights = {
            'very_common': 5,
            'common': 3,
            'uncommon': 2,
            'rare': 1
        };
        
        const weightedNPCs = [];
        npcs.forEach(npc => {
            const weight = npcWeights[npc.frequency] || 1;
            for (let i = 0; i < weight; i++) {
                weightedNPCs.push(npc);
            }
        });
        
        const selectedNPC = weightedNPCs[Math.floor(Math.random() * weightedNPCs.length)];
        
        // Select item based on NPC preferences
        let eligibleItems = consumableItems.filter(item => {
            // Check if item matches NPC preferences
            return selectedNPC.preferences.some(pref => 
                item.type === pref || 
                item.subtype === pref ||
                (pref === 'food' && item.subtype === 'food') ||
                (pref === 'drink' && item.subtype === 'drink')
            );
        });
        
        // Fall back to all consumables if no preferences match
        if (eligibleItems.length === 0) {
            eligibleItems = consumableItems;
        }
        
        // Filter by budget
        const budgetLimits = {
            'low': 50,
            'medium': 200,
            'high': 10000
        };
        const maxPrice = budgetLimits[selectedNPC.budget] || 100;
        eligibleItems = eligibleItems.filter(item => item.value <= maxPrice);
        
        if (eligibleItems.length === 0) return null;
        
        // Select random item
        const selectedItem = eligibleItems[Math.floor(Math.random() * eligibleItems.length)];
        
        // Calculate price with shop fluctuation (simplified)
        const basePrice = selectedItem.value;
        const fluctuation = 0.8 + Math.random() * 0.4; // ±20% price fluctuation
        const salePrice = Math.floor(basePrice * fluctuation);
        
        // Calculate tip based on NPC's tip modifier
        const baseTip = salePrice * 0.1; // 10% base
        const finalTip = Math.floor(baseTip * selectedNPC.tipModifier);
        
        // Calculate profit (95% margin)
        const costBasis = Math.floor(basePrice * 0.05);
        const profit = salePrice - costBasis;
        
        // Record the sale
        const saleRecord = {
            itemId: selectedItem.id,
            profit: profit,
            buyer: selectedNPC.id,
            buyerName: selectedNPC.name,
            price: salePrice,
            tip: finalTip,
            timestamp: new Date(),
            isNPC: true
        };
        
        // Add to gameData sales
        if (!dbEntry.gameData.sales) {
            dbEntry.gameData.sales = [];
        }
        dbEntry.gameData.sales.push(saleRecord);
        
        // Store the NPC's dialogue for the sales log
        const dialogue = selectedNPC.dialogue[Math.floor(Math.random() * selectedNPC.dialogue.length)];
        saleRecord.npcDialogue = dialogue;
        saleRecord.npcData = selectedNPC;
        
        return saleRecord;
        
    } catch (error) {
        console.error('[InnKeeper] Error generating NPC sale:', error);
        return null;
    }
}

// Function to distribute profits among VC members
async function distributeProfits(channel, dbEntry) {
    try {
        // Get voice channel if it exists
        const voiceChannel = channel.guild.channels.cache.get(channel.id);
        if (!voiceChannel || !voiceChannel.isVoiceBased()) {
            console.log('[InnKeeper] No voice channel found for profit distribution');
            return;
        }

        // Get members currently in the voice channel
        const membersInVC = Array.from(voiceChannel.members.values())
            .filter(member => !member.user.bot); // Exclude bots

        if (membersInVC.length === 0) {
            console.log('[InnKeeper] No members in voice channel for profit distribution');
            return;
        }

        // Get server data for salary calculation
        const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
        const serverPower = serverData?.power || 1;
        const baseSalary = calculateBaseSalary(serverPower);

        // Calculate total profit and tips (with null safety)
        const sales = dbEntry.gameData.sales || [];
        const totalSales = sales.reduce((sum, sale) => sum + (sale.price || 0), 0);
        const totalProfit = sales.reduce((sum, sale) => sum + (sale.profit || 0), 0);
        const totalTips = sales.reduce((sum, sale) => sum + (sale.tip || 0), 0);
        const grandTotal = totalProfit + totalTips;
        
        // Track earnings for each member
        const earnings = {};
        const memberIds = membersInVC.map(m => m.id);
        
        // Initialize earnings and calculate salaries for all VC members
        for (const member of membersInVC) {
            const effectivenessData = await calculateEffectivenessBonus(member.id, baseSalary);
            earnings[member.id] = {
                base: 0,
                tips: 0,
                salary: baseSalary,
                effectivenessBonus: effectivenessData.bonus,
                speedStat: effectivenessData.speedStat,
                sightStat: effectivenessData.sightStat,
                total: baseSalary + effectivenessData.bonus
            };
        }

        // Distribute profit and tips from each sale
        for (const sale of sales) {
            // Skip sales with invalid data
            if (!sale.profit && !sale.tip) continue;
            
            // For NPC sales, distribute to all workers
            // For player sales, exclude the buyer
            const eligibleMembers = sale.isNPC ? 
                memberIds : 
                memberIds.filter(id => id !== sale.buyer);
            
            if (eligibleMembers.length > 0) {
                // Split this sale's profit equally among eligible members
                const profitPerMember = Math.floor((sale.profit || 0) / eligibleMembers.length);
                const tipPerMember = sale.tip ? Math.floor(sale.tip / eligibleMembers.length) : 0;
                
                eligibleMembers.forEach(memberId => {
                    earnings[memberId].base += profitPerMember;
                    earnings[memberId].tips += tipPerMember;
                    earnings[memberId].total += profitPerMember + tipPerMember;
                });
            }
        }

        // Select Employee of the Day only if there's more than one worker
        let employeeOfTheDay = null;
        if (membersInVC.length > 1) {
            employeeOfTheDay = membersInVC[Math.floor(Math.random() * membersInVC.length)];
            // Double the employee of the day's total payout
            earnings[employeeOfTheDay.id].total *= 2;
            earnings[employeeOfTheDay.id].isEmployeeOfDay = true;
        }

        // Award the earnings to each member
        const Currency = require('../../models/currency');
        const payouts = [];
        
        for (const [memberId, earningData] of Object.entries(earnings)) {
            const member = membersInVC.find(m => m.id === memberId);
            
            // Update currency
            await Currency.findOneAndUpdate(
                { userId: memberId },
                { 
                    $inc: { money: earningData.total },
                    $set: { usertag: member.user.tag }
                },
                { upsert: true, new: true }
            );
            
            payouts.push({
                member: member,
                ...earningData
            });
        }

        // Aggregate item sales data and map IDs to names
        const itemSalesMap = new Map();
        for (const sale of sales) {
            const key = sale.itemId;
            // Get item name from itemSheet
            const item = itemSheet.find(i => String(i.id) === String(sale.itemId));
            const itemName = item ? item.name : `Item #${sale.itemId}`;
            
            if (!itemSalesMap.has(key)) {
                itemSalesMap.set(key, { 
                    name: itemName,
                    count: 0, 
                    totalRevenue: 0 
                });
            }
            const itemData = itemSalesMap.get(key);
            itemData.count += 1;
            // Use sale.price if available, otherwise default to 0 to avoid NaN
            itemData.totalRevenue += (sale.price || 0);
            itemSalesMap.set(key, itemData);
        }

        // Create and send the summary embed
        if (payouts.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle('🪵 End of Work Day Report')
                .setColor(0x8B4513) // Wooden brown color
                .setTimestamp();

            // Add profile picture
            if (membersInVC.length === 1) {
                // Solo worker
                embed.setThumbnail(membersInVC[0].user.displayAvatarURL({ dynamic: true, size: 256 }));
            } else if (employeeOfTheDay) {
                // Employee of the day
                embed.setThumbnail(employeeOfTheDay.user.displayAvatarURL({ dynamic: true, size: 256 }));
            }

            // Prepare payout summary text
            let payoutSummary = '';
            
            // Sort workers by total earnings
            const sortedPayouts = payouts.sort((a, b) => b.total - a.total);
            
            // Handle employee of the day or solo shift at the top
            if (membersInVC.length === 1) {
                const soloPayout = sortedPayouts[0];
                payoutSummary = `✨ **${soloPayout.member.user.username}'s Shift** ✨\n`;
                payoutSummary += `\`\`\`\n`;
                payoutSummary += `Base Earnings: ${soloPayout.base}c | Tips: ${soloPayout.tips}c\n`;
                payoutSummary += `Salary: ${soloPayout.salary}c | Effectiveness Bonus: ${soloPayout.effectivenessBonus}c\n`;
                payoutSummary += `\`\`\`\n`;
                payoutSummary += `\n**Total Payout:**  『 **${soloPayout.total}c** 』\n`;
            } else if (employeeOfTheDay) {
                const employeePayout = sortedPayouts.find(p => p.isEmployeeOfDay);
                payoutSummary = `⭐ **Worker of the Day** ⭐\n`;
                payoutSummary += `**${employeePayout.member.user.username}** has been selected!\n\n`;
                payoutSummary += `\`\`\`\n`;
                payoutSummary += `Base Earnings: ${employeePayout.base}c | Tips: ${employeePayout.tips}c\n`;
                payoutSummary += `Salary: ${employeePayout.salary}c | Bonus: ${employeePayout.effectivenessBonus}c\n`;
                payoutSummary += `\`\`\`\n`;
                payoutSummary += `\n**Total Payout:**  『 **${employeePayout.total}c** 』 *(2x bonus!)*\n`;
            }
            
            // Add description with payout summary
            embed.setDescription(payoutSummary);

            // Create item sales list for code block
            let itemSalesList = 'ITEM SALES BREAKDOWN:\n';
            itemSalesList += '─'.repeat(40) + '\n';
            
            // Sort items by revenue
            const sortedItems = Array.from(itemSalesMap.entries())
                .sort((a, b) => b[1].totalRevenue - a[1].totalRevenue);
            
            for (const [itemId, data] of sortedItems) {
                // Only show items with actual revenue
                if (data.totalRevenue > 0) {
                    itemSalesList += `${data.name}: ${data.count}x sold | 💰 ${data.totalRevenue}c\n`;
                } else {
                    itemSalesList += `${data.name}: ${data.count}x sold | 💰 0c\n`;
                }
            }
            
            itemSalesList += '\n';
            itemSalesList += 'SALES REPORT:\n';
            itemSalesList += '─'.repeat(40) + '\n';
            itemSalesList += `Total Sales: ${sales.length}\n`;
            itemSalesList += `Revenue: ${totalSales}c\n`;
            itemSalesList += `Base Profit: ${totalProfit}c\n`;
            itemSalesList += `Tips Earned: ${totalTips}c\n`;
            itemSalesList += `Grand Total: ${grandTotal}c\n`;
            
            // Add best sale to sales report
            if (sales.length > 0) {
                const topSale = sales.reduce((max, sale) => 
                    (sale.profit + (sale.tip || 0)) > (max.profit + (max.tip || 0)) ? sale : max, sales[0]);
                
                // Get item name for top sale
                const topItem = itemSheet.find(i => String(i.id) === String(topSale.itemId));
                const topItemName = topItem ? topItem.name : `Item #${topSale.itemId}`;
                itemSalesList += `\n🏆 Best Sale: ${topItemName}\n`;
                itemSalesList += `   Profit: ${topSale.profit}c | Tip: ${topSale.tip || 0}c\n`;
            }
            
            itemSalesList += '\n';
            itemSalesList += 'WORKER PAYOUTS:\n';
            itemSalesList += '─'.repeat(40) + '\n';
            itemSalesList += `Base Salary: ${baseSalary}c (Power Level ${serverPower})\n`;
            itemSalesList += '─'.repeat(40) + '\n';
            
            // Add other workers (excluding employee of the day if shown above)
            for (const payout of sortedPayouts) {
                // Skip if this is the employee of the day or solo worker (already shown above)
                if ((membersInVC.length === 1) || (employeeOfTheDay && payout.isEmployeeOfDay)) {
                    continue;
                }
                
                itemSalesList += `${payout.member.user.username}:\n`;
                itemSalesList += `  Base: ${payout.base}c | Tips: ${payout.tips}c\n`;
                itemSalesList += `  Effectiveness: +${payout.effectivenessBonus}c (Speed: ${payout.speedStat}, Sight: ${payout.sightStat})\n`;
                itemSalesList += `  TOTAL: ${payout.total}c\n`;
                itemSalesList += '─────\n';
            }
            
            // Add fields with code block
            embed.addFields({
                name: '📜 Detailed Report',
                value: `\`\`\`\n${itemSalesList}\`\`\``,
                inline: false
            });

            await channel.send({ embeds: [embed] });
        }
        
        // Clear the sales log after distribution
        await InnSalesLog.clearSalesLog(channel);
        
        console.log(`[InnKeeper] Distributed ${grandTotal} coins among ${payouts.length} workers`);
        
    } catch (error) {
        console.error('[InnKeeper] Error distributing profits:', error);
    }
}

module.exports = async (channel, dbEntry, json) => {
    const now = Date.now(); // current timestamp in milliseconds

    // Initialize gameData with sales array and gamemode identifier if it doesn't exist
    if (!dbEntry.gameData) {
        dbEntry.gameData = {
            gamemode: 'innkeeper', // Identifier for this game mode
            sales: [], // Array to store sales records
            lastProfitDistribution: new Date(), // Track when profits were last distributed
            lastNPCSale: new Date() // Track last NPC sale
        };
    } else {
        // Ensure gamemode is set
        if (!dbEntry.gameData.gamemode) {
            dbEntry.gameData.gamemode = 'innkeeper';
        }
        // Ensure sales array exists
        if (!dbEntry.gameData.sales) {
            dbEntry.gameData.sales = [];
        }
        // Ensure lastProfitDistribution exists
        if (!dbEntry.gameData.lastProfitDistribution) {
            dbEntry.gameData.lastProfitDistribution = new Date();
        }
        // Initialize lastNPCSale if not exists
        if (!dbEntry.gameData.lastNPCSale) {
            dbEntry.gameData.lastNPCSale = new Date(now - 5 * 60 * 1000); // 5 minutes ago
        }
    }

    // Check for NPC customer sales (20% chance every minute after 3 minute cooldown)
    const lastNPCSale = new Date(dbEntry.gameData.lastNPCSale).getTime();
    const npcCooldown = 3 * 60 * 1000; // 3 minutes
    
    if (now - lastNPCSale >= npcCooldown && Math.random() < 0.20) {
        const npcSale = await generateNPCSale(channel, dbEntry);
        if (npcSale) {
            dbEntry.gameData.lastNPCSale = new Date();
            dbEntry.markModified('gameData');
            await dbEntry.save();
            
            // Update the sales log with NPC info
            await InnSalesLog.updateWithNPCPurchase(channel, dbEntry, npcSale);
        }
    }

    // Check if 20 minutes have passed since last profit distribution
    const lastDistribution = new Date(dbEntry.gameData.lastProfitDistribution).getTime();
    const twentyMinutesInMs = 20 * 60 * 1000; // 20 minutes
    
    if (now - lastDistribution >= twentyMinutesInMs && dbEntry.gameData.sales.length > 0) {
        // Time to distribute profits!
        await distributeProfits(channel, dbEntry);
        
        // Update last distribution time
        dbEntry.gameData.lastProfitDistribution = new Date();
        
        // Clear sales data after distribution
        dbEntry.gameData.sales = [];
    }

    dbEntry.nextTrigger = new Date(now + 60 * 1000);
    
    // Mark gameData as modified since it's a Mixed type
    dbEntry.markModified('gameData');
    
    await dbEntry.save();

    // Send the event message
    if (channel && channel.isTextBased()) {
        generateShop(channel);
        
        // Debug: Log current sales count (optional)
        console.log(`[InnKeeper] Channel ${dbEntry.channelId} - Total sales: ${dbEntry.gameData.sales.length}`);
    }
   
};
