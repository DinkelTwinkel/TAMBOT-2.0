// itemUseHandler.js - Centralized item usage handler with script execution
const { 
    EmbedBuilder 
} = require('discord.js');
const PlayerInventory = require('../models/inventory');
const itemSheet = require('../data/itemSheet.json');
const path = require('path');
const fs = require('fs').promises;

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

class ItemUseHandler {
    constructor(client, guildId) {
        this.client = client;
        this.guildId = guildId;
        
        // Create a unique listener name for this guild
        this.listenerName = `itemUseHandler_${guildId}`;
        
        // Remove any existing listeners for this guild before setting up new ones
        this.removeExistingListeners();
        
        // Setup new listeners
        this.setupListeners();
        
        // Store the handler reference on the client to track it
        if (!this.client.itemUseHandlers) {
            this.client.itemUseHandlers = new Map();
        }
        this.client.itemUseHandlers.set(guildId, this);
        
        // Cache for loaded scripts
        this.scriptCache = new Map();
        
        // Performance monitoring
        this.performanceStats = {
            totalUses: 0,
            failedUses: 0,
            successfulUses: 0,
            scriptErrors: 0
        };
    }

    removeExistingListeners() {
        // Get all existing listeners for interactionCreate
        const listeners = this.client.listeners('interactionCreate');
        
        // Remove listeners that match our naming pattern for this guild
        listeners.forEach(listener => {
            if (listener.itemUseHandlerGuildId === this.guildId) {
                this.client.removeListener('interactionCreate', listener);
            }
        });
    }

    setupListeners() {
        // Create a named function so we can track it
        const interactionHandler = async (interaction) => {
            if (interaction.guild?.id !== this.guildId) return;
            if (!interaction.isStringSelectMenu()) return;

            try {
                // Handle item use select menus
                if (interaction.customId === 'use_item_select') {
                    await this.handleItemUse(interaction);
                }
                    
            } catch (error) {
                console.error('[ITEM_USE] Interaction error:', error);
                this.performanceStats.failedUses++;
                
                // Try to respond with error if not already responded
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ 
                            content: '❌ An error occurred processing your item use request.', 
                            ephemeral: true 
                        });
                    } else if (interaction.deferred) {
                        await interaction.editReply({ 
                            content: '❌ An error occurred processing your item use request.' 
                        });
                    }
                } catch (e) {
                    console.error('[ITEM_USE] Failed to send error message:', e);
                }
            }
        };
        
        // Tag the handler with the guild ID so we can identify it later
        interactionHandler.itemUseHandlerGuildId = this.guildId;
        
        // Add the listener
        this.client.on('interactionCreate', interactionHandler);
    }

    // Cleanup method to remove listeners when needed
    cleanup() {
        this.removeExistingListeners();
        if (this.client.itemUseHandlers) {
            this.client.itemUseHandlers.delete(this.guildId);
        }
        console.log(`[ITEM_USE] Cleaned up handler for guild ${this.guildId}`);
    }

    async handleItemUse(interaction) {
        // Parse the value: userId_channelId_itemId_page
        const [userId, channelId, itemId, page] = interaction.values[0].split('_');

        // Verify the user is the one using the item
        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: '❌ This use menu is not for you.',
                ephemeral: true
            });
        }

        // Defer the reply
        await interaction.deferReply({ ephemeral: false });

        // Get item data
        const item = itemMap.get(itemId);
        if (!item) {
            return interaction.editReply({
                content: '❌ Item not found.',
                ephemeral: true
            });
        }

        // Check if item has a script
        if (!item.script) {
            return interaction.editReply({
                content: '❌ This item cannot be used.',
                ephemeral: true
            });
        }

        // Get user's inventory
        const playerInv = await PlayerInventory.findOne({ playerId: userId });
        if (!playerInv) {
            return interaction.editReply({
                content: '❌ Your inventory could not be found.',
                ephemeral: true
            });
        }

        // Check if user has the item
        const ownedItem = playerInv.items.find(i => i.itemId === itemId);
        if (!ownedItem || ownedItem.quantity <= 0) {
            return interaction.editReply({
                content: '❌ You no longer own this item.',
                ephemeral: true
            });
        }

        // Load and execute the script
        try {
            const scriptPath = path.join(__dirname, '..', 'data', 'itemUseScripts', `${item.script}.js`);
            
            // Check if script exists
            try {
                await fs.access(scriptPath);
            } catch {
                console.error(`[ITEM_USE] Script not found: ${scriptPath}`);
                this.performanceStats.scriptErrors++;
                return interaction.editReply({
                    content: `❌ The script for this item (${item.script}) could not be found.`,
                    ephemeral: true
                });
            }

            // Load the script (with cache)
            let script;
            if (this.scriptCache.has(item.script)) {
                script = this.scriptCache.get(item.script);
            } else {
                // Delete from require cache to ensure fresh load in development
                delete require.cache[require.resolve(scriptPath)];
                script = require(scriptPath);
                this.scriptCache.set(item.script, script);
            }

            // Prepare context for the script
            const context = {
                // Core objects
                interaction: interaction,
                member: interaction.member,
                channel: interaction.channel,
                guild: interaction.guild,
                client: this.client,
                
                // Item data
                itemId: itemId,
                item: item,
                ownedItem: ownedItem,
                
                // User data
                userId: userId,
                user: interaction.user,
                
                // Utility functions
                PlayerInventory: PlayerInventory,
                itemMap: itemMap,
                
                // Helper function to consume the item
                consumeItem: async (amount = 1) => {
                    const inv = await PlayerInventory.findOne({ playerId: userId });
                    const item = inv.items.find(i => i.itemId === itemId);
                    
                    if (!item || item.quantity < amount) {
                        throw new Error('Insufficient items');
                    }
                    
                    item.quantity -= amount;
                    if (item.quantity <= 0) {
                        inv.items = inv.items.filter(i => i.itemId !== itemId);
                    }
                    
                    inv.markModified('items');
                    await inv.save();
                    
                    return item.quantity;
                },
                
                // Helper function to send embeds
                sendEmbed: async (embedData) => {
                    const embed = new EmbedBuilder()
                        .setColor(embedData.color || 0x3498db)
                        .setTitle(embedData.title || 'Item Used')
                        .setDescription(embedData.description || '')
                        .setTimestamp();
                    
                    if (embedData.fields) {
                        embed.addFields(embedData.fields);
                    }
                    
                    if (embedData.footer) {
                        embed.setFooter(embedData.footer);
                    }
                    
                    if (embedData.thumbnail) {
                        embed.setThumbnail(embedData.thumbnail);
                    }
                    
                    if (embedData.image) {
                        embed.setImage(embedData.image);
                    }
                    
                    return interaction.editReply({ embeds: [embed] });
                }
            };

            // Execute the script
            if (typeof script === 'function') {
                await script(context);
            } else if (typeof script.execute === 'function') {
                await script.execute(context);
            } else {
                throw new Error('Script does not export a valid function or execute method');
            }

            this.performanceStats.successfulUses++;
            console.log(`[ITEM_USE] ${userId} used item ${itemId} with script ${item.script}`);
            
        } catch (error) {
            console.error(`[ITEM_USE] Script execution error for ${item.script}:`, error);
            this.performanceStats.scriptErrors++;
            
            // Send error message
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Item Use Failed')
                .setDescription(`Failed to use **${item.name}**`)
                .setColor(0xFF0000)
                .addFields(
                    { name: 'Error', value: error.message || 'Unknown error occurred', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }

        this.performanceStats.totalUses++;
    }

    // Clear script cache (useful for development)
    clearScriptCache() {
        this.scriptCache.clear();
        console.log(`[ITEM_USE] Script cache cleared for guild ${this.guildId}`);
    }

    // Get performance statistics
    getStats() {
        return {
            ...this.performanceStats,
            successRate: this.performanceStats.totalUses > 0 
                ? `${(this.performanceStats.successfulUses / this.performanceStats.totalUses * 100).toFixed(2)}%`
                : '0%',
            scriptErrorRate: this.performanceStats.totalUses > 0
                ? `${(this.performanceStats.scriptErrors / this.performanceStats.totalUses * 100).toFixed(2)}%`
                : '0%'
        };
    }
}

module.exports = ItemUseHandler;
