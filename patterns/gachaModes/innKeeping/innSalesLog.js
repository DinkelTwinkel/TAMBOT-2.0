// Inn Sales Log System - Manages and displays sales information
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const itemSheet = require('../../../data/itemSheet.json');
const npcs = require('../../../data/npcs.json');
const path = require('path');
const fs = require('fs');
const AIDialogueGenerator = require('./aiDialogueGenerator');

// Create item lookup map for performance
const itemMap = new Map(itemSheet.map(item => [item.id, item]));
const npcMap = new Map(npcs.map(npc => [npc.id, npc]));

class InnSalesLog {
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
                        console.log(`[InnSalesLog] AI dialogue generator initialized for channel ${channelId}`);
                    } else {
                        console.log('[InnSalesLog] AI dialogue generator not configured (no API key)');
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
                        console.log('[InnSalesLog] Generic AI dialogue generator initialized');
                    } else {
                        console.log('[InnSalesLog] AI dialogue generator not configured (no API key)');
                        this.aiDialogue = null;
                    }
                }
                return this.aiDialogue;
            }
        } catch (error) {
            console.error('[InnSalesLog] Failed to initialize AI dialogue:', error.message);
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
     * Find existing sales log in recent messages
     * @param {Channel} channel - The Discord channel
     * @param {number} limit - Number of messages to search
     * @returns {Promise<Message|null>} - The sales log message if found
     */
    static async findExistingSalesLog(channel, limit = 2) {
        try {
            // Fetch last N messages
            const messages = await channel.messages.fetch({ limit });
            
            // Look for our sales log embed
            for (const message of messages.values()) {
                if (message.author.bot && 
                    message.embeds.length > 0 && 
                    message.embeds[0].title?.includes('Inn Sales')) {
                    return message;
                }
            }
            
            return null;
        } catch (error) {
            console.error('[InnSalesLog] Error finding existing log:', error);
            return null;
        }
    }

    /**
     * Delete all sales logs in recent messages
     * @param {Channel} channel - The Discord channel
     * @param {number} limit - Number of messages to search
     * @returns {Promise<number>} - Number of messages deleted
     */
    static async deleteOldSalesLogs(channel, limit = 10) {
        try {
            // Fetch last N messages
            const messages = await channel.messages.fetch({ limit });
            let deletedCount = 0;
            
            // Find and delete all sales log messages
            for (const message of messages.values()) {
                if (message.author.bot && 
                    message.embeds.length > 0 && 
                    message.embeds[0].title?.includes('Inn Sales Log')) {
                    try {
                        await message.delete();
                        deletedCount++;
                    } catch (deleteError) {
                        console.error('[InnSalesLog] Error deleting old log:', deleteError);
                    }
                }
            }
            
            if (deletedCount > 0) {
                console.log(`[InnSalesLog] Deleted ${deletedCount} old sales log(s)`);
            }
            
            return deletedCount;
        } catch (error) {
            console.error('[InnSalesLog] Error deleting old logs:', error);
            return 0;
        }
    }

    /**
     * Get the latest sale from sales array
     * @param {Array} sales - Array of sales
     * @returns {Object|null} - Latest sale or null
     */
    static getLatestSale(sales) {
        if (sales.length === 0) return null;
        return sales[sales.length - 1];
    }

    /**
     * Get user bio/status
     * @param {Guild} guild - Discord guild
     * @param {string} userId - User ID
     * @returns {Promise<string>} - User bio or default message
     */
    static async getUserBio(guild, userId) {
        try {
            // First get the member
            const member = await guild.members.fetch(userId);
            
            // Try to get presence/custom status first (more reliable)
            const presence = member.presence;
            if (presence?.activities?.length > 0) {
                // Look for custom status (type 4)
                const customStatus = presence.activities.find(a => a.type === 4);
                if (customStatus?.state) {
                    // Truncate if too long
                    const status = customStatus.state.length > 100 ? 
                        customStatus.state.substring(0, 97) + '...' : 
                        customStatus.state;
                    return status;
                }
                
                // Look for playing status as fallback
                const playingStatus = presence.activities.find(a => a.type === 0);
                if (playingStatus?.name) {
                    return `Playing ${playingStatus.name}`;
                }
            }
            
            // List of random customer quotes as fallback
            const customerQuotes = [
                "Just what I needed!",
                "Perfect timing, I was getting hungry.",
                "This place never disappoints!",
                "I'll be back for more!",
                "Best inn in town!",
                "Worth every coin!",
                "Exactly what I was looking for.",
                "Great service as always!",
                "This hits the spot!",
                "I needed this today."
            ];
            
            // Return random quote
            return customerQuotes[Math.floor(Math.random() * customerQuotes.length)];
            
        } catch (error) {
            console.log('[InnSalesLog] Could not fetch user info:', error.message);
            return "Another satisfied customer!";
        }
    }

    /**
     * Create or update the sales log embed
     * @param {Object} dbEntry - The database entry with gameData
     * @param {Object} latestSale - Optional latest sale info with buyer details
     * @param {Guild} guild - Discord guild for fetching member info
     * @param {string} channelId - Channel ID for AI context
     * @returns {Object} - Object with embed and files array
     */
    static async createSalesLogEmbed(dbEntry, latestSale = null, guild = null, channelId = null) {
        const sales = dbEntry.gameData?.sales || [];
        const files = [];
        
        // Get or initialize AI for this channel
        const aiDialogue = channelId ? this.initializeAI(channelId) : this.getAIForChannel(channelId);
        
        // Default embed for no sales
        if (sales.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('📋 Inn Sales')
                .setColor(0x8B4513) // Brown color for inn theme
                .setDescription('```\nNo sales yet. Waiting for customers...\n```')
                .setTimestamp();
            
            const timeUntilDist = this.getTimeUntilDistribution(dbEntry);
            embed.setFooter({
                text: `0 sales | Next distribution: ${timeUntilDist}`
            });
            return { embed, files };
        }

        // Get the latest sale to display
        const lastSale = this.getLatestSale(sales);
        
        // Build embed based on whether latest sale is NPC or player
        let title = 'Customer';
        let authorText = '';
        let dialogueText = '';
        let purchaseInfo = '';
        
        const item = itemMap.get(lastSale.itemId);
        const itemName = item ? item.name : lastSale.itemId;
        
        if (lastSale.isNPC && lastSale.npcData) {
            // NPC Purchase
            const npc = lastSale.npcData;
            title = `📋 Inn Sales - ${npc.name}`;
            authorText = npc.description;
            
            // Try AI-generated dialogue first
            if (aiDialogue && aiDialogue.isAvailable()) {
                try {
                    dialogueText = await aiDialogue.generateNPCDialogue(
                        npc,
                        item || { name: itemName },
                        lastSale.price || 0,
                        {
                            tip: lastSale.tip || 0,
                            mood: this.getNPCMood(npc, sales),
                            isHungry: Math.random() > 0.5
                        }
                    );
                    console.log(`[InnSalesLog] Generated AI dialogue for ${npc.name}`);
                } catch (err) {
                    console.log('[InnSalesLog] AI dialogue generation failed, using fallback');
                    dialogueText = lastSale.npcDialogue || npc.dialogue?.[Math.floor(Math.random() * npc.dialogue.length)] || "The usual, please.";
                }
            } else {
                // Fallback to existing dialogue
                dialogueText = lastSale.npcDialogue || npc.dialogue?.[Math.floor(Math.random() * npc.dialogue.length)] || "The usual, please.";
            }
            
            // Try to add NPC image as thumbnail if it exists
            const npcImagePath = path.join(__dirname, '..', '..', '..', 'assets', 'npcs', npc.image);
            try {
                if (fs.existsSync(npcImagePath)) {
                    const attachment = new AttachmentBuilder(npcImagePath, { name: npc.image });
                    files.push(attachment);
                }
            } catch (err) {
                console.log(`[InnSalesLog] NPC image not found: ${npc.image}`);
            }
        } else {
            // Player Purchase
            let playerName = lastSale.buyerName || 'Valued Customer';
            
            // Try to get player's nickname and bio if we have guild and buyer info
            if (guild && (lastSale.buyer || latestSale?.buyer?.id)) {
                try {
                    const memberId = lastSale.buyer || latestSale.buyer.id;
                    const member = await guild.members.fetch(memberId);
                    playerName = member.nickname || member.user.username || playerName;
                    
                    // Try AI-generated dialogue first
                    if (aiDialogue && aiDialogue.isAvailable()) {
                        try {
                            // Count previous purchases by this player
                            const previousPurchases = sales.filter(s => 
                                !s.isNPC && s.buyer === memberId
                            ).length;
                            
                            dialogueText = await aiDialogue.generatePlayerDialogue(
                                { username: playerName },
                                item || { name: itemName },
                                lastSale.price || 0,
                                {
                                    tip: lastSale.tip || 0,
                                    previousPurchases: previousPurchases,
                                    playerClass: member.roles.cache.first()?.name || null
                                }
                            );
                            console.log(`[InnSalesLog] Generated AI dialogue for player ${playerName}`);
                        } catch (err) {
                            console.log('[InnSalesLog] AI dialogue generation failed for player, using fallback');
                            // Fall back to getUserBio
                            dialogueText = await this.getUserBio(guild, memberId);
                        }
                    } else {
                        // Use existing getUserBio method
                        dialogueText = await this.getUserBio(guild, memberId);
                    }
                } catch (err) {
                    console.log('[InnSalesLog] Could not fetch member info:', err.message);
                }
            }
            
            title = `📋 Inn Sales - ${playerName}`;
            authorText = "Valued customer of the inn";
            if (!dialogueText) {
                dialogueText = "Another satisfied customer!";
            }
        }
        
        // Build purchase info
        purchaseInfo = `Purchased **${itemName}** for **${lastSale.price || 0}** coins`;
        if (lastSale.tip > 0) {
            purchaseInfo += ` | 💝 Tip: **${lastSale.tip}** coins`;
        }

        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(0x8B4513) // Brown color for inn theme
            .setTimestamp();
        
        if (authorText) {
            embed.setAuthor({ name: authorText });
        }

        // Build chronological sales list
        let salesList = [];
        
        for (let i = 0; i < sales.length; i++) {
            const sale = sales[i];
            const saleItem = itemMap.get(sale.itemId);
            const saleItemName = saleItem ? saleItem.name : sale.itemId;
            
            let buyerDisplay;
            
            if (sale.isNPC) {
                const npc = npcMap.get(sale.buyer);
                buyerDisplay = npc ? npc.name : sale.buyerName || 'Mystery Customer';
            } else if (sale.buyerName) {
                buyerDisplay = sale.buyerName;
            } else if (latestSale && i === sales.length - 1 && latestSale.buyer) {
                buyerDisplay = latestSale.buyer.username || latestSale.buyer.tag || 'Unknown';
            } else {
                buyerDisplay = `Customer #${i + 1}`;
            }
            
            // Show actual sale price if available, otherwise estimate
            const customerPaid = sale.price || Math.ceil(sale.profit / 0.95);
            const tipText = sale.tip > 0 ? ` +${sale.tip}c tip` : '';
            
            salesList.push(`${buyerDisplay} bought ${saleItemName} for ${customerPaid}c${tipText}`);
        }

        // Build description with dialogue in code block, then purchase info, then sales list
        let descriptionText = '';
        
        // Add dialogue in code block
        if (dialogueText) {
            descriptionText += `\`\`\`\n"${dialogueText}"\n\`\`\`\n`;
        }
        
        // Add purchase info
        descriptionText += purchaseInfo + '\n\n';
        
        // Add sales list header and content
        descriptionText += '**📜 Sales History**\n';
        descriptionText += '```\n' + salesList.join('\n') + '\n```';
        
        embed.setDescription(descriptionText);

        // Set thumbnail based on whether it's NPC or player
        if (lastSale.isNPC && lastSale.npcData && files.length > 0) {
            embed.setThumbnail(`attachment://${lastSale.npcData.image}`);
        } else if (!lastSale.isNPC) {
            // For player purchases, try to get their avatar
            if (guild && (lastSale.buyer || latestSale?.buyer?.id)) {
                try {
                    const memberId = lastSale.buyer || latestSale.buyer.id;
                    const member = await guild.members.fetch(memberId);
                    
                    // Fetch full user profile for potential higher quality avatar
                    const userProfile = await member.user.fetch(true);
                    
                    // Get avatar URL - Discord will automatically resize for thumbnail display
                    // We request size 256 for quality, Discord displays at ~80-150px in embeds
                    const avatarURL = userProfile.displayAvatarURL({ 
                        extension: 'png', 
                        size: 256,
                        dynamic: true 
                    });
                    
                    embed.setThumbnail(avatarURL);
                } catch (err) {
                    // Fallback: try to use latestSale buyer avatar if available
                    if (latestSale?.buyer?.displayAvatarURL) {
                        try {
                            const avatarURL = latestSale.buyer.displayAvatarURL({ 
                                extension: 'png', 
                                size: 256,
                                dynamic: true 
                            });
                            embed.setThumbnail(avatarURL);
                        } catch (fallbackErr) {
                            console.log('[InnSalesLog] Could not set player avatar:', fallbackErr.message);
                        }
                    }
                }
            } else if (latestSale?.buyer?.displayAvatarURL) {
                const avatarURL = latestSale.buyer.displayAvatarURL({ 
                    extension: 'png', 
                    size: 256,
                    dynamic: true 
                });
                embed.setThumbnail(avatarURL);
            }
        }

        // Footer with sales count and distribution timer
        const timeUntilDist = this.getTimeUntilDistribution(dbEntry);
        const footerText = `${sales.length} sale${sales.length !== 1 ? 's' : ''} | Next distribution: ${timeUntilDist}`;
        embed.setFooter({ text: footerText });

        return { embed, files };
    }

    /**
     * Calculate time until next profit distribution
     * @param {Object} dbEntry - Database entry with gameData
     * @returns {string} - Formatted time string
     */
    static getTimeUntilDistribution(dbEntry) {
        if (!dbEntry.gameData?.lastProfitDistribution) {
            return '20 minutes';
        }

        const lastDistribution = new Date(dbEntry.gameData.lastProfitDistribution).getTime();
        const now = Date.now();
        const twentyMinutes = 20 * 60 * 1000;
        const nextDistribution = lastDistribution + twentyMinutes;
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
     * Post or update the sales log in the channel
     * @param {Channel} channel - Discord channel
     * @param {Object} dbEntry - Database entry
     * @param {Object} latestSale - Optional latest sale info
     * @returns {Promise<Message>} - The posted/updated message
     */
    static async postOrUpdateSalesLog(channel, dbEntry, latestSale = null) {
        try {
            const guild = channel.guild;
            const { embed, files } = await this.createSalesLogEmbed(dbEntry, latestSale, guild, channel.id);
            
            // First check if there's a log in the last 2 messages we can update
            const existingLog = await this.findExistingSalesLog(channel, 2);

            if (existingLog) {
                // Update existing log
                await existingLog.edit({ embeds: [embed], files });
                return existingLog;
            } else {
                // Before creating a new log, delete any old ones in the last 10 messages
                await this.deleteOldSalesLogs(channel, 10);
                
                // Create new log
                return await channel.send({ embeds: [embed], files });
            }
        } catch (error) {
            console.error('[InnSalesLog] Error posting/updating log:', error);
            return null;
        }
    }

    /**
     * Update sales log with latest purchaser info
     * @param {Channel} channel - Discord channel
     * @param {Object} dbEntry - Database entry
     * @param {string} itemId - Item that was purchased
     * @param {Object} buyer - Buyer user object
     * @returns {Promise<void>}
     */
    static async updateWithLatestPurchase(channel, dbEntry, itemId, buyer) {
        try {
            // Create or update the sales log with the latest sale info
            const latestSale = {
                itemId: itemId,
                buyer: buyer
            };
            
            await this.postOrUpdateSalesLog(channel, dbEntry, latestSale);
        } catch (error) {
            console.error('[InnSalesLog] Error updating with latest purchase:', error);
        }
    }

    /**
     * Update sales log with NPC purchase
     * @param {Channel} channel - Discord channel
     * @param {Object} dbEntry - Database entry
     * @param {Object} npcSale - NPC sale record
     * @returns {Promise<void>}
     */
    static async updateWithNPCPurchase(channel, dbEntry, npcSale) {
        try {
            // NPC sales already have all the info we need
            await this.postOrUpdateSalesLog(channel, dbEntry);
        } catch (error) {
            console.error('[InnSalesLog] Error updating with NPC purchase:', error);
        }
    }

    /**
     * Clear the sales log (after profit distribution)
     * @param {Channel} channel - Discord channel
     * @returns {Promise<void>}
     */
    static async clearSalesLog(channel) {
        try {
            // Look for existing log in last 5 messages
            const existingLog = await this.findExistingSalesLog(channel, 5);
            if (!existingLog) {
                // If no log found, just delete any old ones that might exist
                await this.deleteOldSalesLogs(channel, 10);
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 Inn Sales')
                .setColor(0x8B4513)
                .setDescription('```\nSales cleared after profit distribution.\nStarting fresh!\n```')
                .setTimestamp()
                .setFooter({
                    text: '0 sales | Next distribution: 20 minutes'
                });

            await existingLog.edit({ embeds: [embed], files: [] });
        } catch (error) {
            console.error('[InnSalesLog] Error clearing sales log:', error);
        }
    }

    /**
     * Helper method to determine NPC mood based on context
     * @param {Object} npc - NPC object
     * @param {Array} sales - Recent sales array
     * @returns {string} - Mood string
     */
    static getNPCMood(npc, sales) {
        // Determine mood based on various factors
        const recentSales = sales.slice(-5);
        const npcPurchaseCount = recentSales.filter(s => s.buyer === npc.id).length;
        
        if (npcPurchaseCount > 1) return "impatient";
        if (npc.budget === "low") return "cautious";
        if (npc.budget === "high") return "cheerful";
        if (npc.tipModifier < 0.5) return "grumpy";
        if (npc.tipModifier > 1.5) return "generous";
        
        return "neutral";
    }

    /**
     * Generate special event dialogue
     * @param {string} eventType - Type of event
     * @param {Object} context - Event context
     * @param {string} channelId - Channel ID for context
     * @returns {Promise<string|null>} - Generated dialogue or null
     */
    static async generateEventDialogue(eventType, context, channelId = null) {
        const aiDialogue = channelId ? this.getAIForChannel(channelId) : this.aiDialogue;
        if (aiDialogue && aiDialogue.isAvailable()) {
            try {
                return await aiDialogue.generateEventDialogue(eventType, context);
            } catch (err) {
                console.log('[InnSalesLog] Event dialogue generation failed');
                return null;
            }
        }
        return null;
    }
}

// Initialize generic AI on module load
InnSalesLog.initializeAI();

module.exports = InnSalesLog;