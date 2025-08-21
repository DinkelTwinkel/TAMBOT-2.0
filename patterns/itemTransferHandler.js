// itemTransferHandler.js - Centralized item transfer handler with atomic operations
const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder 
} = require('discord.js');
const PlayerInventory = require('../models/inventory');
const itemSheet = require('../data/itemSheet.json');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

class ItemTransferHandler {
    constructor(client, guildId) {
        this.client = client;
        this.guildId = guildId;
        
        // Create a unique listener name for this guild
        this.listenerName = `itemTransferHandler_${guildId}`;
        
        // Remove any existing listeners for this guild before setting up new ones
        this.removeExistingListeners();
        
        // Setup new listeners
        this.setupListeners();
        
        // Store the handler reference on the client to track it
        if (!this.client.itemTransferHandlers) {
            this.client.itemTransferHandlers = new Map();
        }
        this.client.itemTransferHandlers.set(guildId, this);
        
        // Performance monitoring
        this.performanceStats = {
            totalTransfers: 0,
            failedTransfers: 0,
            successfulTransfers: 0
        };
    }

    removeExistingListeners() {
        // Get all existing listeners for interactionCreate
        const listeners = this.client.listeners('interactionCreate');
        
        // Remove listeners that match our naming pattern for this guild
        listeners.forEach(listener => {
            if (listener.itemTransferHandlerGuildId === this.guildId) {
                this.client.removeListener('interactionCreate', listener);
            }
        });
    }

    setupListeners() {
        // Create a named function so we can track it
        const interactionHandler = async (interaction) => {
            if (interaction.guild?.id !== this.guildId) return;
            if (!interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

            try {
                // Handle item transfer select menus
                if (interaction.isStringSelectMenu() && interaction.customId.startsWith('transfer_item_select_')) {
                    await this.handleItemSelect(interaction);
                }

                // Handle modal submissions for transfer amount
                if (interaction.isModalSubmit() && interaction.customId.startsWith('transfer_amount_modal_')) {
                    await this.handleAmountModal(interaction);
                }
                    
            } catch (error) {
                console.error('[ITEM_TRANSFER] Interaction error:', error);
                this.performanceStats.failedTransfers++;
                
                // Try to respond with error if not already responded
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ 
                            content: '❌ An error occurred processing your transfer request.', 
                            ephemeral: true 
                        });
                    } else if (interaction.deferred) {
                        await interaction.editReply({ 
                            content: '❌ An error occurred processing your transfer request.' 
                        });
                    }
                } catch (e) {
                    console.error('[ITEM_TRANSFER] Failed to send error message:', e);
                }
            }
        };
        
        // Tag the handler with the guild ID so we can identify it later
        interactionHandler.itemTransferHandlerGuildId = this.guildId;
        
        // Add the listener
        this.client.on('interactionCreate', interactionHandler);
    }

    // Cleanup method to remove listeners when needed
    cleanup() {
        this.removeExistingListeners();
        if (this.client.itemTransferHandlers) {
            this.client.itemTransferHandlers.delete(this.guildId);
        }
        console.log(`[ITEM_TRANSFER] Cleaned up handler for guild ${this.guildId}`);
    }

    async handleItemSelect(interaction) {
        // Parse custom ID: transfer_item_select_[giverId]_[receiverId]_[page]
        const parts = interaction.customId.split('_');
        const giverId = parts[3];
        const receiverId = parts[4];
        const currentPage = parseInt(parts[5]) || 0;

        // Verify the user is the giver
        if (interaction.user.id !== giverId) {
            return interaction.reply({
                content: '❌ This transfer menu is not for you.',
                ephemeral: true
            });
        }

        const selectedItemId = interaction.values[0];
        const item = itemMap.get(selectedItemId);
        
        if (!item) {
            return interaction.reply({
                content: '❌ Item not found.',
                ephemeral: true
            });
        }

        // Get current inventory to check ownership
        const giverInv = await PlayerInventory.findOne({ playerId: giverId }).lean();
        if (!giverInv) {
            return interaction.reply({
                content: '❌ Your inventory could not be found.',
                ephemeral: true
            });
        }

        const ownedItem = giverInv.items.find(i => i.itemId === selectedItemId);
        if (!ownedItem || ownedItem.quantity <= 0) {
            return interaction.reply({
                content: '❌ You no longer own this item.',
                ephemeral: true
            });
        }

        // Get receiver info for display
        const receiver = await this.client.users.fetch(receiverId).catch(() => null);
        const receiverName = receiver ? receiver.username : 'Unknown User';

        // Create modal for amount input
        const modal = new ModalBuilder()
            .setCustomId(`transfer_amount_modal_${giverId}_${receiverId}_${selectedItemId}_${currentPage}`)
            .setTitle(`Give ${item.name}`);

        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel(`Amount to give to ${receiverName}`)
            .setPlaceholder(`You have ${ownedItem.quantity}. Enter amount to give (1-${ownedItem.quantity})`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(10)
            .setValue('1'); // Default value

        modal.addComponents(
            new ActionRowBuilder().addComponents(amountInput)
        );

        await interaction.showModal(modal);
    }

    async handleAmountModal(interaction) {
        // Defer reply immediately for modal submissions
        await interaction.deferReply({ ephemeral: true });

        // Parse custom ID: transfer_amount_modal_[giverId]_[receiverId]_[itemId]_[page]
        const parts = interaction.customId.split('_');
        const giverId = parts[3];
        const receiverId = parts[4];
        const itemId = parts[5];
        const originalPage = parseInt(parts[6]) || 0;

        // Verify the user is the giver
        if (interaction.user.id !== giverId) {
            return interaction.editReply({
                content: '❌ This transfer is not for you.'
            });
        }

        const amountStr = interaction.fields.getTextInputValue('amount');
        const amount = parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) {
            return interaction.editReply({
                content: '❌ Invalid amount. Please enter a positive number.'
            });
        }

        const item = itemMap.get(itemId);
        if (!item) {
            return interaction.editReply({
                content: '❌ Item not found.'
            });
        }

        // Execute the transfer atomically
        const result = await this.executeTransfer(giverId, receiverId, itemId, amount);

        if (result.success) {
            this.performanceStats.successfulTransfers++;
            
            // Get user objects for display
            const giver = await this.client.users.fetch(giverId).catch(() => null);
            const receiver = await this.client.users.fetch(receiverId).catch(() => null);

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Transfer Successful')
                .setDescription(`Successfully transferred **${amount}x ${item.name}** to ${receiver || 'the recipient'}`)
                .setColor(0x00FF00)
                .addFields(
                    { name: '📦 Item', value: item.name, inline: true },
                    { name: '📊 Amount', value: amount.toString(), inline: true },
                    { name: '💎 Type', value: item.type, inline: true }
                )
                .setTimestamp();

            // Add remaining quantity
            if (result.remainingQuantity !== undefined) {
                successEmbed.setFooter({ 
                    text: `You have ${result.remainingQuantity} ${item.name} remaining` 
                });
            }

            await interaction.channel.send({
                embeds: [successEmbed],
            });

            await interaction.editReply({
                content: "transferSuccess!"
            });

            // Log the transfer
            console.log(`[ITEM_TRANSFER] ${giverId} gave ${amount}x ${itemId} to ${receiverId}`);
            
        } else {
            this.performanceStats.failedTransfers++;
            await interaction.editReply({
                content: `❌ Transfer failed: ${result.error}`
            });
        }

        this.performanceStats.totalTransfers++;
    }

    async executeTransfer(giverId, receiverId, itemId, amount) {
        // Start a MongoDB session for atomic transaction
        const session = await PlayerInventory.startSession();
        session.startTransaction();

        try {
            // Get giver's inventory
            const giverInv = await PlayerInventory.findOne({ 
                playerId: giverId 
            }).session(session);

            if (!giverInv) {
                throw new Error('Your inventory not found');
            }

            // Check if giver has the item and enough quantity
            const giverItem = giverInv.items.find(i => i.itemId === itemId);
            if (!giverItem || giverItem.quantity < amount) {
                const owned = giverItem ? giverItem.quantity : 0;
                throw new Error(`Insufficient items. You have ${owned}, but tried to give ${amount}`);
            }

            // Store original durability if applicable
            const itemDurability = giverItem.currentDurability;

            // Remove items from giver
            giverItem.quantity -= amount;
            const remainingQuantity = giverItem.quantity;
            
            if (giverItem.quantity <= 0) {
                giverInv.items = giverInv.items.filter(i => i.itemId !== itemId);
            }
            giverInv.markModified('items');
            await giverInv.save({ session });

            // Get or create receiver's inventory
            let receiverInv = await PlayerInventory.findOne({ 
                playerId: receiverId 
            }).session(session);

            if (!receiverInv) {
                // Get receiver info for tag
                const receiver = await this.client.users.fetch(receiverId).catch(() => null);
                receiverInv = new PlayerInventory({
                    playerId: receiverId,
                    playerTag: receiver ? receiver.tag : 'Unknown User',
                    items: []
                });
            }

            // Add items to receiver
            const receiverItem = receiverInv.items.find(i => i.itemId === itemId);
            if (receiverItem) {
                receiverItem.quantity += amount;
            } else {
                const newItem = {
                    itemId: itemId,
                    quantity: amount
                };
                
                // Copy durability if the item has it
                if (itemDurability !== undefined) {
                    newItem.currentDurability = itemDurability;
                }
                
                receiverInv.items.push(newItem);
            }
            
            receiverInv.markModified('items');
            await receiverInv.save({ session });

            // Commit the transaction
            await session.commitTransaction();
            await session.endSession();

            return { 
                success: true, 
                remainingQuantity: remainingQuantity 
            };

        } catch (error) {
            // Rollback on any error
            await session.abortTransaction();
            await session.endSession();
            
            console.error('[ITEM_TRANSFER] Transaction failed:', error);
            return { 
                success: false, 
                error: error.message || 'Transaction failed' 
            };
        }
    }

    // Get performance statistics
    getStats() {
        return {
            ...this.performanceStats,
            successRate: this.performanceStats.totalTransfers > 0 
                ? `${(this.performanceStats.successfulTransfers / this.performanceStats.totalTransfers * 100).toFixed(2)}%`
                : '0%'
        };
    }
}

module.exports = ItemTransferHandler;