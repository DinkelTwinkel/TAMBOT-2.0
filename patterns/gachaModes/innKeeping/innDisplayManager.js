// innKeeping/innDisplayManager.js
// Unified display management for inn sales and events

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const InnConfig = require('./innConfig');
const InnAIManager = require('./innAIManagerIntegrated');
const itemSheet = require('../../../data/itemSheet.json');
const npcs = require('../../../data/npcs.json');
const path = require('path');
const fs = require('fs');
const generateShop = require('../../generateShop');

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
        const embeds = [];
        const mainEmbed = new EmbedBuilder()
            .setTitle('🏨 Inn Activity')
            .setColor(this.config.COLORS.INN_BROWN)
            .setTimestamp();

        // Build activity feed for the description (has higher character limit)
        const activityFeed = this.buildActivityFeed(sales, events);
        if (activityFeed.length > 0) {
            const feedText = activityFeed
                .slice(-this.config.EVENT_LOG.MAX_EVENTS)
                .map(a => a.text)
                .join('\n');
            
            const logDescription = `**📜 Recent Activity Log**\n\`\`\`\n${feedText}\`\`\``;
            
            // Check if log exceeds Discord's limit (4096 characters)
            if (logDescription.length > 4096) {
                // Split into main embed and overflow embeds
                const maxDescLength = 4000; // Leave some buffer
                let currentPos = 0;
                let embedIndex = 0;
                
                while (currentPos < logDescription.length) {
                    let endPos = Math.min(currentPos + maxDescLength, logDescription.length);
                    let descPart = logDescription.substring(currentPos, endPos);
                    
                    // Add continuation indicators
                    if (currentPos > 0) {
                        descPart = '\`\`\`...\n' + descPart.substring(3); // Replace opening backticks with continuation
                    }
                    if (endPos < logDescription.length) {
                        // Ensure we close the code block and add continuation note
                        if (!descPart.endsWith('\`\`\`')) {
                            descPart = descPart + '\n...\`\`\`\n*(continued in next message)*';
                        }
                    }
                    
                    const embed = new EmbedBuilder()
                        .setTitle(embedIndex === 0 ? '🏨 Inn Activity' : `🏨 Inn Activity (Part ${embedIndex + 1})`)
                        .setColor(this.config.COLORS.INN_BROWN)
                        .setDescription(descPart);
                    
                    if (embedIndex === 0) {
                        embed.setTimestamp();
                    }
                    
                    embeds.push(embed);
                    currentPos = endPos;
                    embedIndex++;
                }
            } else {
                mainEmbed.setDescription(logDescription);
                embeds.push(mainEmbed);
            }
        } else {
            mainEmbed.setDescription('*No recent activity to display*');
            embeds.push(mainEmbed);
        }

        // Get latest highlight and add as a field (has lower character limit)
        const latestHighlight = await this.getLatestHighlight(sales, events);
        if (latestHighlight) {
            // Combine title and description for the field
            let highlightText = latestHighlight.description;
            
            // Truncate if needed to fit in field limit (1024 characters)
            if (highlightText.length > 1020) {
                highlightText = highlightText.substring(0, 1017) + '...';
            }
            
            // Add to the last embed in the array
            embeds[embeds.length - 1].addFields({
                name: latestHighlight.title,
                value: highlightText,
                inline: false
            });
        }

        // Calculate statistics for footer
        const stats = this.calculateStatistics(sales, events);
        
        // Set footer with revenue info on the last embed
        embeds[embeds.length - 1].setFooter({ 
            text: `${sales.length} sales | ${events.length} events | Revenue: ${stats.revenue}c (excl tips) | Next: ${this.getTimeUntilDistribution(dbEntry)}` 
        });

        // Handle NPC thumbnails
        const files = [];
        const latestNPCSale = sales.filter(s => s.isNPC).pop();
        if (latestNPCSale?.npcData?.image) {
            const imagePath = path.join(__dirname, '..', '..', '..', 'assets', 'npcs', latestNPCSale.npcData.image);
            try {
                if (fs.existsSync(imagePath)) {
                    files.push(new AttachmentBuilder(imagePath, { name: latestNPCSale.npcData.image }));
                    //embed.setThumbnail(`attachment://${latestNPCSale.npcData.image}`);
                }
            } catch (err) {
                console.log('[InnDisplay] NPC image not found:', latestNPCSale.npcData.image);
            }
        }

        return await this.postOrUpdate(channel, { embeds, files });
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
            description: `\`\`\`\n"${dialogue}"\n\`\`\`\n${purchaseInfo}${tipInfo}`
        };
    }

    /**
     * Generate event highlight
     */
    generateEventHighlight(event) {
        switch (event.type) {
            case 'barfight':
                let fightDescription = `${event.npc1} and ${event.npc2} got into a fight over ${event.reason}!\n`;
                fightDescription += '```' +`${event.outcome || 'They were separated by other patrons.'}` + '```';;
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
                
                //fightDescription += 
                
                return {
                    title: '👊 Bar Fight!',
                    description: fightDescription 
                };
                
            case 'rumor':
                return {
                    title: '🐍 Overheard Rumor',
                    description: `${event.npc1} leans over to ${event.npc2}...\n` +
                                `\`\`\`\n${event.rumor}\n\`\`\``
                };
                
            case 'coinFind':
                return {
                    title: '🍀 Lucky Find!',
                    description: `${event.finderName} found **${event.amount} coins** on the floor!\n` +
                                '```' + `${event.description || 'A fortunate discovery!'}` + '```'
                };
                
            case 'innkeeperComment':
            return {
            title: '💭 Innkeeper Observation',
            description: '```' + `${event.comment}*\n` +
            `Business level: ${event.businessLevel}` + '```'
            };
                    
                case 'friendship':
                    let friendshipDesc = `${event.npc1} and ${event.npc2} have discovered a shared interest!\n\n`;
                    
                    if (event.bondingTopic) {
                        friendshipDesc += `**What they're bonding over:**\n${event.bondingTopic}\n\n`;
                    }
                    
                    if (event.purchases && event.purchases.length > 0) {
                        friendshipDesc += `**Celebratory Purchases:**\n`;
                        for (const purchase of event.purchases) {
                            const item = itemSheet.find(i => String(i.id) === String(purchase.itemId));
                            const itemName = item?.name || 'mysterious item';
                            friendshipDesc += `• ${purchase.buyerName} bought ${itemName} for ${purchase.price}c\n`;
                        }
                        const totalRevenue = event.purchases.reduce((sum, p) => sum + p.price, 0);
                        friendshipDesc += `\n💰 **Total Revenue: ${totalRevenue}c**`;
                    }
                    
                    return {
                        title: '🤝 New Friendship Formed!',
                        description: friendshipDesc
                    };
                
            default:
                return null;
        }
    }

    /**
     * Build chronological activity feed with full details
     */
    buildActivityFeed(sales, events) {
        const activities = [];
        
        // Add sales with dialogue
        for (const sale of sales) {
            const item = itemSheet.find(i => String(i.id) === String(sale.itemId));
            const itemName = item?.name || `Item #${sale.itemId}`;
            const buyer = sale.isNPC ? sale.buyerName : (sale.buyerName || 'Customer');
            const tipText = sale.tip > 0 ? ` (+${sale.tip}c tip)` : '';
            
            let saleText = `💰 ${buyer} bought ${itemName} for ${sale.price}c${tipText}`;
            
            // Add dialogue if available
            if (sale.npcDialogue) {
                const shortDialogue = sale.npcDialogue.length > 30 
                    ? sale.npcDialogue.substring(0, 27) + '...' 
                    : sale.npcDialogue;
                saleText += `\n   "${shortDialogue}"`;
            }
            
            activities.push({
                timestamp: new Date(sale.timestamp).getTime(),
                text: saleText,
                type: 'sale'
            });
        }
        
        // Add events with full details
        for (const event of events) {
            let text = '';
            
            switch (event.type) {
                case 'barfight':
                    // Include reason for the fight
                    const fightReason = event.reason ? 
                        (event.reason.length > 25 ? event.reason.substring(0, 22) + '...' : event.reason) : 
                        'unknown reasons';
                    
                    text = `⚔️ FIGHT! ${event.npc1} vs ${event.npc2} over ${fightReason}`;
                    
                    if (event.mitigation) {
                        const mit = event.mitigation;
                        if (mit.mitigationType === 'complete_negation') {
                            text += `\n   🛡️ ${mit.responder} stopped it! Saved ${mit.originalCost}c`;
                        } else if (mit.reductionPercent > 0) {
                            const saved = mit.originalCost - event.cost;
                            text += `\n   🛡️ ${mit.responder} intervened! Damage: ${event.cost}c (saved ${saved}c)`;
                        } else {
                            text += `\n   ⚠️ ${mit.responder} tried to help. Damage: ${event.cost}c`;
                        }
                    } else {
                        text += `\n   Damage: ${event.cost}c`;
                    }
                    
                    // Add outcome if available
                    if (event.outcome) {
                        const shortOutcome = event.outcome.length > 35 
                            ? event.outcome.substring(0, 32) + '...' 
                            : event.outcome;
                        text += `\n   ${shortOutcome}`;
                    }
                    break;
                    
                case 'rumor':
                    text = `🗣️ ${event.npc1} whispers to ${event.npc2}`;
                    if (event.rumor) {
                        const shortRumor = event.rumor.length > 40 
                            ? event.rumor.substring(0, 37) + '...' 
                            : event.rumor;
                        text += `\n   "${shortRumor}"`;
                    }
                    break;
                    
                case 'coinFind':
                    text = `🪙 ${event.finderName} found ${event.amount} coins!`;
                    if (event.description) {
                        const shortDesc = event.description.length > 35 
                            ? event.description.substring(0, 32) + '...' 
                            : event.description;
                        text += `\n   ${shortDesc}`;
                    }
                    break;
                    
                case 'innkeeperComment':
                    text = `💭 Innkeeper observes: ${event.businessLevel} business`;
                    if (event.comment) {
                        const shortComment = event.comment.length > 40 
                            ? event.comment.substring(0, 37) + '...' 
                            : event.comment;
                        text += `\n   "${shortComment}"`;
                    }
                    break;
                    
                case 'friendship':
                    text = `🤝 ${event.npc1} & ${event.npc2} became friends!`;
                    if (event.bondingTopic) {
                        const shortTopic = event.bondingTopic.length > 40 
                            ? event.bondingTopic.substring(0, 37) + '...' 
                            : event.bondingTopic;
                        text += `\n   Bonding over: ${shortTopic}`;
                    }
                    if (event.purchases && event.purchases.length > 0) {
                        const totalSpent = event.purchases.reduce((sum, p) => sum + p.price, 0);
                        text += `\n   They celebrated with purchases! (+${totalSpent}c)`;
                    }
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
            
            // Generate shop for fresh embeds
            try {
                await generateShop(channel);
                console.log('[InnDisplay] Generated shop for fresh inn display');
            } catch (error) {
                console.error('[InnDisplay] Error generating shop:', error);
            }
            
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
            const employeeName = employeeOfTheDay.displayName || employeeOfTheDay.user.username;
            payoutSummary = `⭐ **Worker of the Day: ${employeeName}** ⭐\n`;
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
            const workerName = earning.member.displayName || earning.member.user.username;
            reportText += `${workerName}: ${earning.total}c\n`;
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

        // Try to send the profit report, but don't fail distribution if it doesn't work
        try {
            await channel.send({ embeds: [embed] });
        } catch (messageError) {
            console.error('[InnDisplay] Failed to send profit distribution report (distribution still successful):', messageError);
            // Distribution was successful, just couldn't send the log
        }
        
        // Clear the display cache
        this.messageCache.delete(channel.id);
        
        // Generate shop after profit report
        try {
            await generateShop(channel);
            console.log('[InnDisplay] Generated shop after profit report');
        } catch (error) {
            console.error('[InnDisplay] Error generating shop after profit report:', error);
        }
    }
}

module.exports = InnDisplayManager;
