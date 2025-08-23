// Inn Event Log System - Manages and displays all inn events (sales, fights, rumors, coin finds)
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const itemSheet = require('../../../data/itemSheet.json');
const npcs = require('../../../data/npcs.json');
const gachaServers = require('../../../data/gachaServers.json');
const shops = require('../../../data/shops.json');
const path = require('path');
const fs = require('fs');
const AIDialogueGenerator = require('./aiDialogueGenerator');
const Money = require('../../../models/currency');
const UniqueItem = require('../../../models/uniqueItems');
const ActiveVCs = require('../../../models/activevcs');
const { UNIQUE_ITEMS } = require('../../../data/uniqueItemsSheet');

// Create item lookup map for performance
const itemMap = new Map(itemSheet.map(item => [item.id, item]));
const npcMap = new Map(npcs.map(npc => [npc.id, npc]));
const uniqueItemMap = new Map(UNIQUE_ITEMS.map(item => [item.id, item]));

class InnEventLog {
    // Initialize AI dialogue generator (will be set per channel)
    static aiDialogue = null;
    static aiDialogueMap = new Map(); // Store per-channel AI instances
    
    static initializeAI(channelId = null) {
        try {
            // If channelId provided, create/get channel-specific instance
            if (channelId) {
                if (!this.aiDialogueMap.has(channelId)) {
                    const AIDialogueGenerator = require('./aiDialogueGenerator');
                    const aiInstance = new AIDialogueGenerator(channelId);
                    if (aiInstance.isAvailable()) {
                        this.aiDialogueMap.set(channelId, aiInstance);
                        console.log(`[InnEventLog] AI dialogue generator initialized for channel ${channelId}`);
                    } else {
                        console.log('[InnEventLog] AI dialogue generator not configured (no API key)');
                        return null;
                    }
                }
                return this.aiDialogueMap.get(channelId);
            } else {
                // Fallback to generic instance
                if (!this.aiDialogue) {
                    const AIDialogueGenerator = require('./aiDialogueGenerator');
                    this.aiDialogue = new AIDialogueGenerator();
                    if (this.aiDialogue.isAvailable()) {
                        console.log('[InnEventLog] Generic AI dialogue generator initialized');
                    } else {
                        console.log('[InnEventLog] AI dialogue generator not configured (no API key)');
                        this.aiDialogue = null;
                    }
                }
                return this.aiDialogue;
            }
        } catch (error) {
            console.error('[InnEventLog] Failed to initialize AI dialogue:', error.message);
            return null;
        }
    }
    
    /**
     * Get AI dialogue instance for a channel
     */
    static getAIForChannel(channelId) {
        if (channelId && this.aiDialogueMap.has(channelId)) {
            return this.aiDialogueMap.get(channelId);
        }
        return this.aiDialogue; // Fallback to generic
    }
    
    /**
     * Find existing event log in recent messages
     * @param {Channel} channel - The Discord channel
     * @param {number} limit - Number of messages to search
     * @returns {Promise<Message|null>} - The event log message if found
     */
    static async findExistingEventLog(channel, limit = 3) {
        try {
            // Fetch last N messages
            const messages = await channel.messages.fetch({ limit });
            
            // Look for our event log embed - check for "Event Log" in title
            // This will match any title containing "Event Log" regardless of shop name
            for (const message of messages.values()) {
                if (message.author.bot && 
                    message.embeds.length > 0) {
                    const title = message.embeds[0].title || '';
                    // Check for "Event Log" anywhere in the title
                    if (title.includes('Event Log')) {
                        console.log(`[InnEventLog] Found existing event log: "${title}"`);
                        return message;
                    }
                }
            }
            
            console.log('[InnEventLog] No event log found in recent messages');
            return null;
        } catch (error) {
            console.error('[InnEventLog] Error finding existing log:', error);
            return null;
        }
    }

    /**
     * Delete all event logs in recent messages
     * @param {Channel} channel - The Discord channel
     * @param {number} limit - Number of messages to search
     * @returns {Promise<number>} - Number of messages deleted
     */
    static async deleteOldEventLogs(channel, limit = 10) {
        try {
            // Fetch last N messages
            const messages = await channel.messages.fetch({ limit });
            let deletedCount = 0;
            
            // Find and delete all event log messages
            for (const message of messages.values()) {
                if (message.author.bot && 
                    message.embeds.length > 0 && 
                    message.embeds[0].title?.includes('Event Log')) {
                    try {
                        await message.delete();
                        deletedCount++;
                    } catch (deleteError) {
                        console.error('[InnEventLog] Error deleting old log:', deleteError);
                    }
                }
            }
            
            if (deletedCount > 0) {
                console.log(`[InnEventLog] Deleted ${deletedCount} old event log(s)`);
            }
            
            return deletedCount;
        } catch (error) {
            console.error('[InnEventLog] Error deleting old logs:', error);
            return 0;
        }
    }

    /**
     * Get server context for smart rumors
     * @param {Guild} guild - Discord guild
     * @param {string} currentChannelId - Current voice channel ID
     * @returns {Promise<Object>} - Context object with server data
     */
    static async getServerContext(guild, currentChannelId) {
        const context = {
            richestPlayers: [],
            legendaryOwners: [],
            activeEstablishments: [],
            currentEstablishment: null
        };

        try {
            // Get richest players (top 5)
            const guildMembers = await guild.members.fetch();
            const memberIds = guildMembers.map(member => member.id);
            const richProfiles = await Money.find({ 
                userId: { $in: memberIds }, 
                money: { $gt: 0 } 
            }).sort({ money: -1 }).limit(5);
            
            for (const profile of richProfiles) {
                try {
                    const member = await guild.members.fetch(profile.userId);
                    context.richestPlayers.push({
                        name: member.nickname || member.user.username,
                        userId: profile.userId,
                        wealth: profile.money
                    });
                } catch (err) {
                    // Skip if member not found
                }
            }

            // Get legendary item owners
            const uniqueItems = await UniqueItem.find({ 
                ownerId: { $in: memberIds, $ne: null }
            });
            
            for (const item of uniqueItems) {
                const itemData = uniqueItemMap.get(item.itemId);
                if (itemData) {
                    try {
                        const member = await guild.members.fetch(item.ownerId);
                        context.legendaryOwners.push({
                            ownerName: member.nickname || member.user.username,
                            ownerId: item.ownerId,
                            itemName: itemData.name,
                            itemId: item.itemId,
                            maintenanceLevel: item.maintenanceLevel
                        });
                    } catch (err) {
                        // Skip if member not found
                    }
                }
            }

            // Get other active establishments
            const activeVCs = await ActiveVCs.find({ 
                guildId: guild.id
            });
            
            for (const vc of activeVCs) {
                const serverData = gachaServers.find(s => s.id === vc.typeId);
                if (serverData) {
                    const shopData = shops.find(s => s.id === serverData.shop);
                    
                    // Get members in VC
                    let memberCount = 0;
                    try {
                        const voiceChannel = guild.channels.cache.get(vc.channelId);
                        if (voiceChannel && voiceChannel.isVoiceBased()) {
                            memberCount = voiceChannel.members.filter(m => !m.user.bot).size;
                        }
                    } catch (err) {
                        // Skip if channel not accessible
                    }
                    
                    const establishment = {
                        name: serverData.name,
                        type: serverData.type,
                        shopName: shopData?.name,
                        shopkeeper: shopData?.shopkeeper?.name,
                        channelId: vc.channelId,
                        power: serverData.power,
                        memberCount: memberCount,
                        isCompetitor: false,
                        isMine: serverData.type === 'mining'
                    };
                    
                    // Mark if this is the current establishment
                    if (vc.channelId === currentChannelId) {
                        context.currentEstablishment = establishment;
                    } else {
                        // Check if it's a competitor (another inn/tavern)
                        if (serverData.type === 'innkeeper') {
                            establishment.isCompetitor = true;
                        }
                        context.activeEstablishments.push(establishment);
                    }
                }
            }

        } catch (error) {
            console.error('[InnEventLog] Error getting server context:', error);
        }

        return context;
    }

    /**
     * Generate smart rumor based on server context
     * @param {Object} context - Server context from getServerContext
     * @param {Object} shopInfo - Current shop information
     * @returns {string} - Generated rumor
     */
    static generateSmartRumor(context, shopInfo) {
        const rumors = [];
        
        // Rumors about rich players
        if (context.richestPlayers.length > 0) {
            const richest = context.richestPlayers[0];
            rumors.push(
                `${richest.name} has been hoarding ${richest.wealth.toLocaleString()} coins`,
                `the wealthy ${richest.name} could buy this entire establishment`,
                `${richest.name}'s fortune grows while miners starve`
            );
            
            if (context.richestPlayers.length > 1) {
                const second = context.richestPlayers[1];
                rumors.push(
                    `${second.name} plots to overtake ${richest.name}'s wealth`,
                    `there's a rivalry between ${richest.name} and ${second.name} over coins`
                );
            }
        }
        
        // Rumors about legendary items
        if (context.legendaryOwners.length > 0) {
            for (const owner of context.legendaryOwners) {
                rumors.push(
                    `${owner.ownerName} wields the legendary ${owner.itemName}`,
                    `the ${owner.itemName} in ${owner.ownerName}'s possession grows restless`,
                    `${owner.ownerName} hasn't been maintaining their ${owner.itemName} properly`
                );
                
                if (owner.maintenanceLevel < 5) {
                    rumors.push(
                        `${owner.itemName} might abandon ${owner.ownerName} soon`,
                        `the legendary ${owner.itemName} seeks a new worthy owner`
                    );
                }
            }
        }
        
        // Rumors about competitor establishments
        const competitors = context.activeEstablishments.filter(e => e.isCompetitor);
        if (competitors.length > 0) {
            for (const comp of competitors) {
                if (comp.memberCount > 0) {
                    rumors.push(
                        `${comp.shopkeeper} at ${comp.shopName} is stealing our customers`,
                        `${comp.memberCount} patrons are drinking at ${comp.shopName} instead`,
                        `${comp.shopName} has been undercutting our prices`
                    );
                } else {
                    rumors.push(
                        `${comp.shopName} sits empty tonight`,
                        `${comp.shopkeeper} complains about lack of customers`
                    );
                }
            }
        }
        
        // Rumors about active mines
        const activeMines = context.activeEstablishments.filter(e => e.isMine);
        if (activeMines.length > 0) {
            for (const mine of activeMines) {
                if (mine.memberCount > 0) {
                    rumors.push(
                        `${mine.memberCount} miners are working the ${mine.name}`,
                        `fresh ore is coming from the ${mine.name}`,
                        `something valuable was found in the ${mine.name}`
                    );
                }
            }
        }
        
        // Crossover rumors (legendary owners + wealth)
        if (context.legendaryOwners.length > 0 && context.richestPlayers.length > 0) {
            const legendaryOwner = context.legendaryOwners[0];
            const richest = context.richestPlayers[0];
            
            if (legendaryOwner.ownerId === richest.userId) {
                rumors.push(
                    `${richest.name} uses ${legendaryOwner.itemName} to hoard wealth`,
                    `the ${legendaryOwner.itemName} made ${richest.name} the richest`
                );
            } else {
                rumors.push(
                    `${richest.name} seeks to buy ${legendaryOwner.ownerName}'s ${legendaryOwner.itemName}`,
                    `${legendaryOwner.ownerName} refuses to sell ${legendaryOwner.itemName} to ${richest.name}`
                );
            }
        }
        
        // If no context-based rumors, use generic ones
        if (rumors.length === 0) {
            rumors.push(
                "strange tremors have been felt in the lower mines",
                "the mining guild is planning new regulations",
                "travelers speak of danger on the roads",
                "the harvest this year was particularly poor",
                "mysterious figures were seen near the old ruins"
            );
        }
        
        return rumors[Math.floor(Math.random() * rumors.length)];
    }

    /**
     * Format event for display in the log
     * @param {Object} event - Event object
     * @param {number} index - Event index
     * @returns {string} - Formatted event string
     */
    static formatEvent(event, index) {
        const timestamp = new Date(event.timestamp).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        switch (event.type) {
            case 'sale':
            case 'npcSale':
                const item = itemMap.get(event.itemId);
                const itemName = item ? item.name : `Item #${event.itemId}`;
                const buyerName = event.buyerName || event.npcName || 'Customer';
                const tipText = event.tip > 0 ? ` +${event.tip}c tip` : '';
                return `[${timestamp}] 🍺 ${buyerName} bought ${itemName} for ${event.price}c${tipText}`;
                
            case 'barfight':
                const fightOutcome = event.outcome ? ` | ${event.outcome}` : '';
                return `[${timestamp}] ⚔️ Bar fight! ${event.npc1} vs ${event.npc2} - Cost: ${event.cost}c${fightOutcome}`;
                
            case 'coinFind':
                return `[${timestamp}] 💰 ${event.finderName || 'Someone'} found ${event.amount} coins!`;
                
            case 'rumor':
                return `[${timestamp}] 🗣️ Rumor: "${event.rumor}"`;
                
            default:
                return `[${timestamp}] 📝 ${event.description || 'Something happened'}`;
        }
    }

    /**
     * Create or update the event log embed
     * @param {Object} dbEntry - The database entry with gameData
     * @param {Guild} guild - Discord guild for fetching member info
     * @param {string} channelId - Channel ID for AI context
     * @returns {Object} - Object with embed and files array
     */
    static async createEventLogEmbed(dbEntry, guild = null, channelId = null) {
        const events = dbEntry.gameData?.events || [];
        const sales = dbEntry.gameData?.sales || [];
        const files = [];
        
        // Combine sales and events into a single timeline
        const allEvents = [];
        
        // Add sales as events
        for (const sale of sales) {
            allEvents.push({
                type: sale.isNPC ? 'npcSale' : 'sale',
                timestamp: sale.timestamp || new Date(),
                itemId: sale.itemId,
                price: sale.price,
                tip: sale.tip || 0,
                buyerName: sale.buyerName,
                npcName: sale.isNPC ? sale.buyerName : null,
                profit: sale.profit
            });
        }
        
        // Add other events
        for (const event of events) {
            allEvents.push({
                ...event,
                timestamp: event.timestamp || new Date()
            });
        }
        
        // Sort by timestamp (oldest first - new events at bottom)
        allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Get shop info
        const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
        const shopInfo = shops.find(s => s.id === serverData?.shop);
        const innkeeperName = shopInfo?.shopkeeper?.name || "the innkeeper";
        const innName = shopInfo?.name || "the inn";
        
        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(`📋 ${innName} - Event Log`)
            .setColor(0x8B4513) // Brown color for inn theme
            .setTimestamp();
        
        // Default embed for no events
        if (allEvents.length === 0) {
            const timeUntilDist = this.getTimeUntilDistribution(dbEntry);
            const workState = dbEntry.gameData?.workState || 'working';
            
            if (workState === 'break') {
                embed.setDescription('```\nThe inn is closed for a break. Workers are resting...\n```');
                embed.setFooter({
                    text: `On break | Reopening: ${timeUntilDist}`
                });
            } else {
                embed.setDescription('```\nThe inn is quiet... waiting for patrons.\n```');
                embed.setFooter({
                    text: `No activity | Next payout: ${timeUntilDist}`
                });
            }
            return { embed, files };
        }
        
        // Get the most recent NPC sale with dialogue for highlight
        let npcDialogueHighlight = '';
        let highlightText = '';
        
        // Get the last (most recent) event since we're sorting oldest first
        const latestEvent = allEvents[allEvents.length - 1];
        
        // First check for recent NPC sales with dialogue
        const recentNPCSale = sales.filter(s => s.isNPC && s.npcDialogue)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        if (recentNPCSale) {
            const npc = npcMap.get(recentNPCSale.buyer) || { name: recentNPCSale.buyerName };
            const item = itemMap.get(recentNPCSale.itemId);
            npcDialogueHighlight = `💬 **${npc.name || recentNPCSale.buyerName}:** "${recentNPCSale.npcDialogue}"`;
            highlightText = `*Purchased ${item?.name || 'something'} for ${recentNPCSale.price}c${recentNPCSale.tip > 0 ? ` with a ${recentNPCSale.tip}c tip` : ''}*`;
        } else if (latestEvent) {
            // Fall back to latest event highlight
            switch (latestEvent.type) {
                case 'sale':
                case 'npcSale':
                    const item = itemMap.get(latestEvent.itemId);
                    highlightText = `Latest: ${latestEvent.buyerName || latestEvent.npcName} purchased ${item?.name || 'something'}`;
                    break;
                case 'barfight':
                    highlightText = `Latest: Bar fight between ${latestEvent.npc1} and ${latestEvent.npc2}! Damage: ${latestEvent.cost}c`;
                    break;
                case 'coinFind':
                    highlightText = `Latest: ${latestEvent.finderName} found ${latestEvent.amount} coins!`;
                    break;
                case 'rumor':
                    highlightText = `Latest rumor: "${latestEvent.rumor}"`;
                    break;
            }
        }
        
        // When adding events during the game, show newest at bottom
        // Build event history (show last 15 events, newest at bottom)
        const maxEvents = 15;
        const eventsToShow = allEvents.length > maxEvents ? allEvents.slice(-maxEvents) : allEvents;
        const eventList = eventsToShow.map((event, i) => this.formatEvent(event, i));
        
        // Build description
        let description = '';
        
        // Add NPC dialogue at the top if available
        if (npcDialogueHighlight) {
            description += npcDialogueHighlight + '\n';
            if (highlightText) {
                description += highlightText + '\n\n';
            }
            description += '═'.repeat(50) + '\n\n';
        } else if (highlightText) {
            description += `**${highlightText}**\n\n`;
        }
        
        description += '```\n📜 Activity Log\n' + '─'.repeat(40) + '\n';
        description += eventList.join('\n');
        description += '\n```';
        
        embed.setDescription(description);
        
        // Add summary fields
        const totalSales = sales.length;
        const totalProfit = sales.reduce((sum, s) => sum + (s.profit || 0), 0);
        const totalTips = sales.reduce((sum, s) => sum + (s.tip || 0), 0);
        const barFightCosts = events.filter(e => e.type === 'barfight')
            .reduce((sum, e) => sum + (e.cost || 0), 0);
        const coinsFound = events.filter(e => e.type === 'coinFind')
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        
        if (totalSales > 0 || barFightCosts > 0 || coinsFound > 0) {
            let summaryText = '';
            if (totalSales > 0) {
                summaryText += `Sales: ${totalSales} | Profit: ${totalProfit}c | Tips: ${totalTips}c\n`;
            }
            if (barFightCosts > 0) {
                summaryText += `Damage costs: -${barFightCosts}c\n`;
            }
            if (coinsFound > 0) {
                summaryText += `Coins found: +${coinsFound}c\n`;
            }
            
            embed.addFields({
                name: '💰 Financial Summary',
                value: `\`\`\`${summaryText}\`\`\``,
                inline: false
            });
        }
        
        // Footer with event count and distribution timer
        const timeUntilDist = this.getTimeUntilDistribution(dbEntry);
        const footerText = `${allEvents.length} events | Next payout: ${timeUntilDist}`;
        embed.setFooter({ text: footerText });
        
        return { embed, files };
    }

    /**
     * Calculate time until next profit distribution
     * @param {Object} dbEntry - Database entry with gameData
     * @returns {string} - Formatted time string
     */
    static getTimeUntilDistribution(dbEntry) {
        // Check if we're on break
        if (dbEntry.gameData?.workState === 'break') {
            if (dbEntry.gameData.breakEndTime) {
                const breakEnd = new Date(dbEntry.gameData.breakEndTime).getTime();
                const now = Date.now();
                const timeRemaining = breakEnd - now;
                
                if (timeRemaining > 0) {
                    const minutes = Math.floor(timeRemaining / (60 * 1000));
                    const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);
                    return `On break for ${minutes}m ${seconds}s`;
                }
            }
            return 'Break ending soon...';
        }
        
        // Calculate time until end of work day (25 minutes)
        if (!dbEntry.gameData?.workStartTime) {
            return '25 minutes';
        }

        const workStartTime = new Date(dbEntry.gameData.workStartTime).getTime();
        const now = Date.now();
        const twentyFiveMinutes = 25 * 60 * 1000;
        const nextDistribution = workStartTime + twentyFiveMinutes;
        const timeRemaining = nextDistribution - now;

        if (timeRemaining <= 0) {
            return 'Any moment now...';
        }

        const minutes = Math.floor(timeRemaining / (60 * 1000));
        const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);

        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Post or update the event log in the channel
     * @param {Channel} channel - Discord channel
     * @param {Object} dbEntry - Database entry
     * @returns {Promise<Message>} - The posted/updated message
     */
    static async postOrUpdateEventLog(channel, dbEntry) {
        try {
            const guild = channel.guild;
            const { embed, files } = await this.createEventLogEmbed(dbEntry, guild, channel.id);
            
            // First check if there's a log in the last 3 messages we can update
            const existingLog = await this.findExistingEventLog(channel, 3);

            if (existingLog) {
                // Update existing log
                console.log(`[InnEventLog] Updating existing event log message`);
                await existingLog.edit({ embeds: [embed], files });
                return existingLog;
            } else {
                console.log(`[InnEventLog] No existing event log found in last 3 messages, creating new one`);
                // Before creating a new log, delete any old ones beyond the last 3 messages
                await this.deleteOldEventLogs(channel, 15);
                
                // Create new log
                return await channel.send({ embeds: [embed], files });
            }
        } catch (error) {
            console.error('[InnEventLog] Error posting/updating log:', error);
            return null;
        }
    }

    /**
     * Add event to log and update display
     * @param {Channel} channel - Discord channel
     * @param {Object} dbEntry - Database entry
     * @param {Object} event - Event to add
     * @returns {Promise<void>}
     */
    static async addEvent(channel, dbEntry, event) {
        try {
            // Ensure events array exists
            if (!dbEntry.gameData.events) {
                dbEntry.gameData.events = [];
            }
            
            // Add timestamp if not present
            if (!event.timestamp) {
                event.timestamp = new Date();
            }
            
            // Add event
            dbEntry.gameData.events.push(event);
            
            // Keep only last 50 events to prevent memory issues
            if (dbEntry.gameData.events.length > 50) {
                dbEntry.gameData.events = dbEntry.gameData.events.slice(-50);
            }
            
            // Update the display
            await this.postOrUpdateEventLog(channel, dbEntry);
        } catch (error) {
            console.error('[InnEventLog] Error adding event:', error);
        }
    }

    /**
     * Clear the event log (after profit distribution)
     * @param {Channel} channel - Discord channel
     * @returns {Promise<void>}
     */
    static async clearEventLog(channel) {
        try {
            // Look for existing log in last 3 messages first, then search wider if needed
            let existingLog = await this.findExistingEventLog(channel, 3);
            
            // If not found in last 3, check last 5 for cleanup
            if (!existingLog) {
                existingLog = await this.findExistingEventLog(channel, 5);
            }
            if (!existingLog) {
                // If no log found, just delete any old ones that might exist
                await this.deleteOldEventLogs(channel, 10);
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 Event Log - Break Time')
                .setColor(0x8B4513)
                .setDescription('```\nProfits distributed! Starting fresh shift.\n```')
                .setTimestamp()
                .setFooter({
                    text: '0 events | Next payout: 25 minutes'
                });

            await existingLog.edit({ embeds: [embed], files: [] });
        } catch (error) {
            console.error('[InnEventLog] Error clearing event log:', error);
        }
    }

    // Backwards compatibility aliases
    static async updateWithLatestPurchase(channel, dbEntry, itemId, buyer) {
        // Convert to event format
        const sale = dbEntry.gameData.sales[dbEntry.gameData.sales.length - 1];
        if (sale) {
            await this.postOrUpdateEventLog(channel, dbEntry);
        }
    }
    
    static async updateWithNPCPurchase(channel, dbEntry, npcSale) {
        await this.postOrUpdateEventLog(channel, dbEntry);
    }
    
    static async clearSalesLog(channel) {
        return this.clearEventLog(channel);
    }
}

// Initialize generic AI on module load
InnEventLog.initializeAI();

module.exports = InnEventLog;
