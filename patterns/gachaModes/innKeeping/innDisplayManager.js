// innKeeping/innDisplayManager.js
// Unified display management for inn sales and events

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const InnConfig = require('./innConfig');
const InnAIManager = require('./innAIManager');
const itemSheet = require('../../../data/itemSheet.json');
const npcs = require('../../../data/npcs.json');
const path = require('path');
const fs = require('fs');

class InnDisplayManager {
    constructor() {
        this.config = InnConfig.DISPLAY;
        this.aiManager = new InnAIManager();
        this.messageCache = new Map();
    }

    /**
     * Main update method
     */
    async update(channel, dbEntry) {
        try {
            const sales = dbEntry.gameData?.sales || [];
            const events = dbEntry.gameData?.events || [];
            
            if (sales.length === 0 && events.length === 0) {
                return await this.showEmptyDisplay(channel, dbEntry);
            }
            
            return await this.showActivityDisplay(channel, sales, events, dbEntry);
            
        } catch (error) {
            console.error('[InnDisplay] Error updating display:', error);
            return null;
        }
    }

    /**
     * Show empty inn display
     */
    async showEmptyDisplay(channel, dbEntry) {
        const embed = new EmbedBuilder()
            .setTitle('🏨 Inn Activity')
            .setColor(this.config.COLORS.INN_BROWN)
            .setDescription('```\nThe inn is quiet... waiting for customers.\n```')
            .setTimestamp()
            .setFooter({ 
                text: `No activity yet | Next distribution: ${this.getTimeUntilDistribution(dbEntry)}` 
            });
            
        return await this.postOrUpdate(channel, { embeds: [embed] });
    }

    /**
     * Show activity display with sales and events
     */
    async showActivityDisplay(channel, sales, events, dbEntry) {
        const embed = new EmbedBuilder()
            .setTitle('🏨 Inn Activity')
            .setColor(this.config.COLORS.INN_BROWN)
            .setTimestamp();

        // Get latest highlight
        const latestHighlight = await this.getLatestHighlight(sales, events);
        if (latestHighlight) {
            embed.setAuthor({ name: latestHighlight.title });
            embed.setDescription(latestHighlight.description);
        }

        // Build activity feed
        const activityFeed = this.buildActivityFeed(sales, events);
        if (activityFeed.length > 0) {
            const feedText = activityFeed
                .slice(-this.config.EVENT_LOG.MAX_EVENTS)
                .map(a => a.text)
                .join('\n');
            
            embed.addFields({
                name: '📜 Recent Activity',
                value: `\`\`\`\n${feedText}\`\`\``,
                inline: false
            });
        }

        // Add statistics
        const stats = this.calculateStatistics(sales, events);
        embed.addFields({
            name: '📊 Current Session',
            value: this.formatStatistics(stats),
            inline: false
        });

        // Set footer
        embed.setFooter({ 
            text: `${sales.length} sales | ${events.length} events | Next distribution: ${this.getTimeUntilDistribution(dbEntry)}` 
        });

        // Handle NPC thumbnails
        const files = [];
        const latestNPCSale = sales.filter(s => s.isNPC).pop();
        if (latestNPCSale?.npcData?.image) {
            const imagePath = path.join(__dirname, '..', '..', '..', 'assets', 'npcs', latestNPCSale.npcData.image);
            try {
                if (fs.existsSync(imagePath)) {
                    files.push(new AttachmentBuilder(imagePath, { name: latestNPCSale.npcData.image }));
                    embed.setThumbnail(`attachment://${latestNPCSale.npcData.image}`);
                }
            } catch (err) {
                console.log('[InnDisplay] NPC image not found:', latestNPCSale.npcData.image);
            }
        }

        return await this.postOrUpdate(channel, { embeds: [embed], files });
    }

    /**
     * Get latest highlight for display
     */
    async getLatestHighlight(sales, events) {
        // Find most recent activity
        const allActivities = [
            ...sales.map(s => ({ ...s, type: 'sale', time: new Date(s.timestamp).getTime() })),
            ...events.map(e => ({ ...e, time: new Date(e.timestamp).getTime() }))
        ];
        
        if (allActivities.length === 0) return null;
        
        const latest = allActivities.sort((a, b) => b.time - a.time)[0];
        
        if (latest.type === 'sale') {
            return this.generateSaleHighlight(latest);
        } else {
            return this.generateEventHighlight(latest);
        }
    }

    /**
     * Generate sale highlight
     */
    generateSaleHighlight(sale) {
        const item = itemSheet.find(i => String(i.id) === String(sale.itemId));
        const itemName = item?.name || 'mysterious item';
        
        let title, dialogue;
        
        if (sale.isNPC && sale.npcData) {
            title = `${sale.npcData.name} - ${sale.npcData.description}`;
            dialogue = sale.npcDialogue || sale.npcData.dialogue?.[0] || "The usual, please.";
        } else {
            title = `${sale.buyerName || 'Customer'} makes a purchase`;
            dialogue = "Just what I needed!";
        }
        
        const purchaseInfo = `Purchased **${itemName}** for **${sale.price}** coins`;
        const tipInfo = sale.tip > 0 ? ` | 💝 Tip: **${sale.tip}** coins` : '';
        
        return {
            title,
            description: `\`\`\`\n${dialogue}\n\`\`\`\n${purchaseInfo}${tipInfo}`
        };
    }

    /**
     * Generate event highlight
     */
    generateEventHighlight(event) {
        switch (event.type) {
            case 'barfight':
                let fightDescription = `${event.npc1} and ${event.npc2} got into a fight over ${event.reason}!\n`;
                
                // Add mitigation information if present
                if (event.mitigation) {
                    const mit = event.mitigation;
                    if (mit.mitigationType === 'complete_negation') {
                        fightDescription += `\n🛡️ **${mit.responder} completely stopped the fight!**\n`;
                        fightDescription += `**Damage Prevented:** ${mit.originalCost} coins\n`;
                    } else if (mit.reductionPercent > 0) {
                        fightDescription += `\n🛡️ **${mit.responder} reduced the damage!**\n`;
                        fightDescription += `**Original Damage:** ${mit.originalCost} coins\n`;
                        fightDescription += `**Reduced to:** ${event.cost} coins (${mit.reductionPercent}% saved)\n`;
                    } else {
                        fightDescription += `\n⚠️ **${mit.responder} tried to intervene but failed!**\n`;
                        fightDescription += `**Damage Cost:** ${event.cost} coins\n`;
                    }
                    
                    // Show stats used
                    if (mit.stats.weighted > 0) {
                        fightDescription += `*Stats: Speed ${mit.stats.speed} | Sight ${mit.stats.sight} | Luck ${mit.stats.luck}*\n`;
                    }
                } else {
                    fightDescription += `**Damage Cost:** ${event.cost} coins\n`;
                }
                
                fightDescription += `*${event.outcome || 'They were separated by other patrons.'}*`;
                
                return {
                    title: '⚔️ Bar Fight!',
                    description: fightDescription
                };
                
            case 'rumor':
                return {
                    title: '🗣️ Overheard Rumor',
                    description: `${event.npc1} leans over to ${event.npc2}...\n` +
                                `\`\`\`\n"${event.rumor}"\n\`\`\``
                };
                
            case 'coinFind':
                return {
                    title: '🪙 Lucky Find!',
                    description: `${event.finderName} found **${event.amount} coins** on the floor!\n` +
                                `*${event.description || 'A fortunate discovery!'}*`
                };
                
            case 'innkeeperComment':
                return {
                    title: '💭 Innkeeper Observation',
                    description: `*${event.comment}*\n` +
                                `Business level: ${event.businessLevel}`
                };
                
            default:
                return null;
        }
    }

    /**
     * Build chronological activity feed
     */
    buildActivityFeed(sales, events) {
        const activities = [];
        
        // Add sales
        for (const sale of sales) {
            const item = itemSheet.find(i => String(i.id) === String(sale.itemId));
            const itemName = item?.name || `Item #${sale.itemId}`;
            const buyer = sale.isNPC ? sale.buyerName : (sale.buyerName || 'Customer');
            const tipText = sale.tip > 0 ? ` (+${sale.tip}c tip)` : '';
            
            activities.push({
                timestamp: new Date(sale.timestamp).getTime(),
                text: `💰 ${buyer} bought ${itemName} for ${sale.price}c${tipText}`,
                type: 'sale'
            });
        }
        
        // Add events
        for (const event of events) {
            let text = '';
            
            switch (event.type) {
                case 'barfight':
                    if (event.mitigation) {
                        if (event.mitigation.mitigationType === 'complete_negation') {
                            text = `⚔️ Bar fight stopped! ${event.mitigation.responder} prevented all damage`;
                        } else if (event.mitigation.reductionPercent > 0) {
                            text = `⚔️ Bar fight! ${event.npc1} vs ${event.npc2} (-${event.cost}c, saved ${event.mitigation.reductionPercent}%)`;
                        } else {
                            text = `⚔️ Bar fight! ${event.npc1} vs ${event.npc2} (-${event.cost}c)`;
                        }
                    } else {
                        text = `⚔️ Bar fight! ${event.npc1} vs ${event.npc2} (-${event.cost}c)`;
                    }
                    break;
                case 'rumor':
                    text = `🗣️ ${event.npc1} shares rumors with ${event.npc2}`;
                    break;
                case 'coinFind':
                    text = `🪙 ${event.finderName} found ${event.amount} coins!`;
                    break;
                case 'innkeeperComment':
                    text = `💭 Innkeeper: ${event.businessLevel} business`;
                    break;
            }
            
            if (text) {
                activities.push({
                    timestamp: new Date(event.timestamp).getTime(),
                    text,
                    type: event.type
                });
            }
        }
        
        // Sort by timestamp
        return activities.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Calculate statistics
     */
    calculateStatistics(sales, events) {
        const totalRevenue = sales.reduce((sum, s) => sum + (s.price || 0), 0);
        const totalTips = sales.reduce((sum, s) => sum + (s.tip || 0), 0);
        const totalProfit = sales.reduce((sum, s) => sum + (s.profit || 0), 0);
        
        const barFights = events.filter(e => e.type === 'barfight');
        const totalDamages = barFights.reduce((sum, e) => sum + (e.cost || 0), 0);
        
        const coinFinds = events.filter(e => e.type === 'coinFind');
        const totalFound = coinFinds.reduce((sum, e) => sum + (e.amount || 0), 0);
        
        return {
            sales: sales.length,
            revenue: totalRevenue,
            tips: totalTips,
            profit: totalProfit,
            damages: totalDamages,
            found: totalFound,
            netProfit: totalProfit + totalTips + totalFound - totalDamages
        };
    }

    /**
     * Format statistics for display
     */
    formatStatistics(stats) {
        const lines = [
            `Sales: ${stats.sales} | Revenue: ${stats.revenue}c`,
            `Tips: ${stats.tips}c | Found: ${stats.found}c`
        ];
        
        if (stats.damages > 0) {
            lines.push(`Damages: -${stats.damages}c`);
        }
        
        lines.push(`Net Profit: ${stats.netProfit}c`);
        
        return lines.join('\n');
    }

    /**
     * Calculate time until distribution
     */
    getTimeUntilDistribution(dbEntry) {
        const workStart = new Date(dbEntry.gameData?.workStartTime || Date.now()).getTime();
        const now = Date.now();
        const workDuration = InnConfig.TIMING.WORK_DURATION;
        const timeRemaining = (workStart + workDuration) - now;
        
        if (timeRemaining <= 0) return 'Any moment now...';
        
        const minutes = Math.floor(timeRemaining / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        
        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }

    /**
     * Post or update message
     */
    async postOrUpdate(channel, messageData) {
        try {
            // Check cache first
            const cachedMessageId = this.messageCache.get(channel.id);
            
            if (cachedMessageId) {
                try {
                    const existingMessage = await channel.messages.fetch(cachedMessageId);
                    await existingMessage.edit(messageData);
                    return existingMessage;
                } catch (err) {
                    this.messageCache.delete(channel.id);
                }
            }
            
            // Search for existing message
            const messages = await channel.messages.fetch({ limit: this.config.SALES_LOG.SEARCH_LIMIT });
            for (const message of messages.values()) {
                if (message.author.bot && 
                    message.embeds.length > 0 && 
                    (message.embeds[0].title?.includes('Inn Activity') ||
                     message.embeds[0].title?.includes('Inn Sales'))) {
                    await message.edit(messageData);
                    this.messageCache.set(channel.id, message.id);
                    return message;
                }
            }
            
            // Create new message
            const newMessage = await channel.send(messageData);
            this.messageCache.set(channel.id, newMessage.id);
            
            // Clean up old messages
            await this.cleanupOldMessages(channel);
            
            return newMessage;
            
        } catch (error) {
            console.error('[InnDisplay] Error posting/updating:', error);
            return null;
        }
    }

    /**
     * Clean up old messages
     */
    async cleanupOldMessages(channel) {
        try {
            const messages = await channel.messages.fetch({ limit: this.config.SALES_LOG.DELETE_LIMIT });
            let deleted = 0;
            
            for (const message of messages.values()) {
                if (message.author.bot && 
                    message.embeds.length > 0 && 
                    (message.embeds[0].title?.includes('Inn Activity') ||
                     message.embeds[0].title?.includes('Inn Sales') ||
                     message.embeds[0].title?.includes('Inn Event'))) {
                    
                    if (message.id === this.messageCache.get(channel.id)) continue;
                    
                    try {
                        await message.delete();
                        deleted++;
                    } catch (err) {
                        // Ignore deletion errors
                    }
                }
            }
            
            if (deleted > 0) {
                console.log(`[InnDisplay] Cleaned up ${deleted} old messages`);
            }
            
        } catch (error) {
            console.error('[InnDisplay] Error cleaning up:', error);
        }
    }

    /**
     * Show profit distribution report
     */
    async showProfitReport(channel, data) {
        const { earnings, employeeOfTheDay, sales, events, totalSales, totalProfit, 
                totalTips, eventCosts, synergyBonus, grossTotal, innkeeperCut, 
                innkeeperMargin, grandTotal, shopInfo, serverPower, serverData } = data;
        
        const innkeeperName = shopInfo?.shopkeeper?.name || "The innkeeper";
        const innName = shopInfo?.name || "the inn";
        
        const embed = new EmbedBuilder()
            .setTitle(`🪵 ${innkeeperName}'s Daily Report`)
            .setColor(this.config.COLORS.SUCCESS_GREEN)
            .setTimestamp()
            .setFooter({ text: innName });

        // Set thumbnail for employee of the day or solo worker
        if (earnings.length === 1) {
            embed.setThumbnail(earnings[0].member.user.displayAvatarURL({ dynamic: true, size: 256 }));
        } else if (employeeOfTheDay) {
            embed.setThumbnail(employeeOfTheDay.user.displayAvatarURL({ dynamic: true, size: 256 }));
        }

        // Build payout summary
        let payoutSummary = '';
        
        if (employeeOfTheDay) {
            const employeeEarnings = earnings.find(e => e.member.id === employeeOfTheDay.id);
            payoutSummary = `⭐ **Worker of the Day: ${employeeOfTheDay.user.username}** ⭐\n`;
            payoutSummary += `Total Payout: **${employeeEarnings.total}c** (2x bonus!)\n\n`;
        }
        
        embed.setDescription(payoutSummary || 'Profit distribution complete!');

        // Build detailed report
        let reportText = 'SALES SUMMARY:\n';
        reportText += '─'.repeat(40) + '\n';
        reportText += `Total Sales: ${sales.length}\n`;
        reportText += `Revenue: ${totalSales}c\n`;
        reportText += `Tips: ${totalTips}c\n`;
        reportText += `Base Profit: ${totalProfit}c\n`;
        
        if (eventCosts > 0) {
            reportText += `Event Costs: -${eventCosts}c\n`;
        }
        if (synergyBonus > 0) {
            reportText += `Synergy Bonus: +${synergyBonus}c\n`;
        }
        reportText += `Gross Total: ${grossTotal}c\n`;
        
        // Show innkeeper's cut
        if (innkeeperCut > 0) {
            const percentageText = Math.floor(innkeeperMargin * 100);
            reportText += `\n`;
            reportText += `INNKEEPER'S CUT (${percentageText}%): -${innkeeperCut}c\n`;
            reportText += '─'.repeat(40) + '\n';
        }
        
        reportText += `Net Distribution: ${grandTotal}c\n`;
        
        reportText += '\n';
        reportText += 'WORKER PAYOUTS:\n';
        reportText += '─'.repeat(40) + '\n';
        
        const sortedEarnings = earnings.sort((a, b) => b.total - a.total);
        for (const earning of sortedEarnings) {
            reportText += `${earning.member.user.username}: ${earning.total}c\n`;
            reportText += `  Base: ${earning.base}c | Tips: ${earning.tips}c\n`;
            reportText += `  Salary: ${earning.salary}c | Bonus: +${earning.effectivenessBonus}c\n`;
            reportText += `  Performance: ${earning.performanceTier.toUpperCase()}\n`;
            reportText += '─────\n';
        }
        
        embed.addFields({
            name: '📜 Detailed Report',
            value: `\`\`\`\n${reportText}\`\`\``,
            inline: false
        });

        // Add teamwork summary if multiple workers
        if (earnings.length > 1) {
            const avgEarnings = Math.floor(grandTotal / earnings.length);
            const innInfo = serverData ? ` (${serverData.name})` : '';
            embed.addFields({
                name: '🤝 Teamwork Report',
                value: `**Workers:** ${earnings.length}\n` +
                       `**Average Earnings:** ${avgEarnings}c\n` +
                       `**Synergy Bonus:** ${synergyBonus}c\n` +
                       `**Inn${innInfo}:** Kept ${innkeeperCut}c (${Math.floor(innkeeperMargin * 100)}%)`,
                inline: false
            });
        }

        await channel.send({ embeds: [embed] });
        
        // Clear the display cache
        this.messageCache.delete(channel.id);
    }
}

module.exports = InnDisplayManager;
