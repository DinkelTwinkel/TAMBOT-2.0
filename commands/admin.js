const { 
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const mongoose = require('mongoose');
const Money = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const Cooldown = require('../models/coolDowns');
const UniqueItem = require('../models/uniqueItems');
const itemSheet = require('../data/itemSheet.json');
const { UNIQUE_ITEMS, getUniqueItemById } = require('../data/uniqueItemsSheet');
const { sendLegendaryAnnouncement, sendLegendaryAnnouncementWithEmbed } = require('../patterns/uniqueItemFinding');
const { startRailBuildingEvent, startMineCollapseEvent } = require('../patterns/gachaModes/mining/miningEvents');
const gachaVC = require('../models/activevcs');
const GameStatTracker = require('../patterns/gameStatTracker');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

// Admin user IDs - add more as needed
const ADMIN_IDS = ['865147754358767627']; // Add your admin IDs here

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin commands for debugging')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('pay')
                .setDescription('Give coins to a user (admin only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give coins to')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('The amount of coins to give')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('drop')
                .setDescription('Give an item to a user (admin only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give the item to')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('item_id')
                        .setDescription('The item ID from itemSheet.json')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('quantity')
                        .setDescription('The quantity to give')
                        .setRequired(true)
                        .setMinValue(1))
                .addIntegerOption(option =>
                    option.setName('durability')
                        .setDescription('Override durability (optional, defaults to max)')
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetgachacooldown')
                .setDescription('Reset gacha roll cooldown for a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to reset cooldown for')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('force-rail-event')
                .setDescription('Force trigger the rail building event for debugging')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('force-collapse-event')
                .setDescription('Force trigger the mine collapse event for debugging')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('rate-limit-stats')
                .setDescription('Check Discord API rate limiting statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('fix-inventory-durability')
                .setDescription('Fix durability display issues in player inventories')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View comprehensive game statistics for users')
                .addStringOption(option =>
                    option.setName('game_mode')
                        .setDescription('Game mode to show stats for')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Mining', value: 'mining' },
                            { name: 'All Modes', value: 'all' }
                        ))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Specific user to show stats for (optional)')
                        .setRequired(false))
        )
        .addSubcommandGroup(group =>
            group
                .setName('unique')
                .setDescription('Manage unique items')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('announce')
                        .setDescription('Manually announce a unique item discovery')
                        .addIntegerOption(option =>
                            option.setName('item_id')
                                .setDescription('The unique item ID to announce')
                                .setRequired(true))
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('The user who "found" the item')
                                .setRequired(false))
                        .addBooleanOption(option =>
                            option.setName('with_embed')
                                .setDescription('Use the fancy embed version')
                                .setRequired(false)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('test-announcement')
                        .setDescription('Test announcement system with a fake item')
                        .addStringOption(option =>
                            option.setName('channels')
                                .setDescription('How many channels to test')
                                .setRequired(false)
                                .addChoices(
                                    { name: 'All Channels', value: 'all' },
                                    { name: 'First Channel Only', value: 'first' },
                                    { name: 'First 3 Channels', value: '3' },
                                    { name: 'First 5 Channels', value: '5' }
                                )))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('assign')
                        .setDescription('Assign a unique item to a player')
                        .addIntegerOption(option =>
                            option.setName('item_id')
                                .setDescription('The unique item ID to assign')
                                .setRequired(true))
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('The user to assign the item to')
                                .setRequired(false)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a unique item from a player')
                        .addIntegerOption(option =>
                            option.setName('item_id')
                                .setDescription('The unique item ID to remove')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('reset')
                        .setDescription('Reset a unique item to unowned state')
                        .addIntegerOption(option =>
                            option.setName('item_id')
                                .setDescription('The unique item ID to reset')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('maintenance')
                        .setDescription('Set maintenance level for an item')
                        .addIntegerOption(option =>
                            option.setName('item_id')
                                .setDescription('The unique item ID')
                                .setRequired(true))
                        .addIntegerOption(option =>
                            option.setName('level')
                                .setDescription('Maintenance level (0-10)')
                                .setMinValue(0)
                                .setMaxValue(10)
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all unique items and their owners'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('give-blue-breeze')
                        .setDescription('Quick command to give yourself Blue Breeze'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('grant-the-one')
                        .setDescription('Grant The One Pick to a worthy soul')
                        .addUserOption(option =>
                            option.setName('chosen')
                                .setDescription('The chosen heir of the Miner King')
                                .setRequired(true)))
        ),

    async execute(interaction) {
        // Check if user is admin
        if (!ADMIN_IDS.includes(interaction.user.id)) {
            return interaction.reply({ 
                content: '❌ You do not have permission to use admin commands.', 
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup();

        // Handle unique item subcommands
        if (group === 'unique') {
            switch (subcommand) {
                case 'announce':
                    await this.handleUniqueAnnounce(interaction);
                    break;
                case 'test-announcement':
                    await this.handleUniqueTestAnnouncement(interaction);
                    break;
                case 'assign':
                    await this.handleUniqueAssign(interaction);
                    break;
                case 'remove':
                    await this.handleUniqueRemove(interaction);
                    break;
                case 'reset':
                    await this.handleUniqueReset(interaction);
                    break;
                case 'maintenance':
                    await this.handleUniqueMaintenance(interaction);
                    break;
                case 'list':
                    await this.handleUniqueList(interaction);
                    break;
                case 'give-blue-breeze':
                    await this.handleQuickBlueBreeze(interaction);
                    break;
                case 'grant-the-one':
                    await this.handleGrantTheOne(interaction);
                    break;
            }
            return;
        }

        // Handle regular subcommands
        if (subcommand === 'pay') {
            await this.executePay(interaction);
        } else if (subcommand === 'drop') {
            await this.executeDrop(interaction);
        } else if (subcommand === 'resetgachacooldown') {
            await this.executeResetGachaCooldown(interaction);
        } else if (subcommand === 'force-rail-event') {
            await this.executeForceRailEvent(interaction);
        } else if (subcommand === 'force-collapse-event') {
            await this.executeForceCollapseEvent(interaction);
        } else if (subcommand === 'rate-limit-stats') {
            await this.executeRateLimitStats(interaction);
        } else if (subcommand === 'fix-inventory-durability') {
            await this.executeFixInventoryDurability(interaction);
        } else if (subcommand === 'stats') {
            await this.executeStats(interaction);
        }
    },

    // ========== PAY COMMAND ==========
    async executePay(interaction) {
        const recipient = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount === 0) {
            return interaction.reply({ 
                content: '❌ Amount cannot be zero.', 
                ephemeral: true 
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find or create recipient doc inside the transaction
            let recipientProfile = await Money.findOne({ userId: recipient.id }).session(session);
            if (!recipientProfile) {
                recipientProfile = new Money({ userId: recipient.id, money: 0 });
            }
            
            // Handle negative amounts (reduction) - ensure we don't go below 0
            if (amount < 0) {
                const reduction = Math.abs(amount);
                if (recipientProfile.money < reduction) {
                    await session.abortTransaction();
                    session.endSession();
                    return interaction.reply({ 
                        content: `❌ Cannot reduce ${recipient.username}'s coins by ${reduction}. They only have ${recipientProfile.money} coins.`, 
                        ephemeral: true 
                    });
                }
                recipientProfile.money = Math.floor(recipientProfile.money - reduction); // Ensure integer result
            } else {
                recipientProfile.money = Math.floor(recipientProfile.money + amount); // Ensure integer result
            }
            
            await recipientProfile.save({ session });

            // Commit the transaction
            await session.commitTransaction();
            session.endSession();

            // Create success embed
            const isReduction = amount < 0;
            const absAmount = Math.abs(amount);
            const actionText = isReduction ? 'removed' : 'gave';
            const amountText = isReduction ? `-${absAmount}` : `+${amount}`;
            
            const embed = new EmbedBuilder()
                .setTitle(isReduction ? '💸 Admin Pay (Reduction)' : '💸 Admin Pay')
                .setDescription(`Successfully ${actionText} **${absAmount}** coins ${isReduction ? 'from' : 'to'} <@${recipient.id}>`)
                .setColor(isReduction ? 0xff4444 : 0x00ff00)
                .addFields(
                    { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Target', value: `<@${recipient.id}>`, inline: true },
                    { name: 'Change', value: `${amountText} coins`, inline: true },
                    { name: 'New Balance', value: `${recipientProfile.money} coins`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Admin Command' });

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error('Transaction failed:', error);
            return interaction.reply({ 
                content: '❌ Something went wrong while transferring coins.', 
                ephemeral: true 
            });
        }
    },

    // ========== DROP COMMAND ==========
    async executeDrop(interaction) {
        const recipient = interaction.options.getUser('user');
        const itemId = interaction.options.getString('item_id');
        const quantity = interaction.options.getInteger('quantity');
        const overrideDurability = interaction.options.getInteger('durability');

        // Check if item exists in itemSheet
        const itemData = itemMap.get(itemId);
        if (!itemData) {
            // Try to find item by name (case-insensitive partial match)
            const foundItem = Array.from(itemMap.values()).find(item => 
                item.name.toLowerCase().includes(itemId.toLowerCase()) ||
                item.id.toLowerCase() === itemId.toLowerCase()
            );

            if (!foundItem) {
                return interaction.reply({ 
                    content: `❌ Item with ID "${itemId}" not found in itemSheet. Please use exact item ID.`, 
                    ephemeral: true 
                });
            }
            // Use the found item if partial match succeeded
            itemData = foundItem;
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find or create recipient's inventory
            let recipientInv = await PlayerInventory.findOne({ playerId: recipient.id }).session(session);
            if (!recipientInv) {
                recipientInv = new PlayerInventory({ 
                    playerId: recipient.id, 
                    items: [] 
                });
            }

            // Check if item already exists in inventory
            const existingItemIndex = recipientInv.items.findIndex(item => item.itemId === itemData.id);
            
            if (existingItemIndex !== -1) {
                // Item exists, add to quantity
                recipientInv.items[existingItemIndex].quantity += quantity;
                
                // Update durability if specified
                if (overrideDurability !== null && overrideDurability !== undefined) {
                    recipientInv.items[existingItemIndex].currentDurability = overrideDurability;
                }
            } else {
                // Item doesn't exist, create new entry
                const newItem = {
                    itemId: itemData.id,
                    quantity: quantity,
                    obtainedAt: new Date()
                };

                // Set durability
                if (itemData.durability) {
                    newItem.currentDurability = overrideDurability !== null && overrideDurability !== undefined 
                        ? overrideDurability 
                        : itemData.durability;
                }

                recipientInv.items.push(newItem);
            }

            await recipientInv.save({ session });

            // Commit the transaction
            await session.commitTransaction();
            session.endSession();

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('📦 Admin Drop')
                .setDescription(`Successfully gave **${quantity}x ${itemData.name}** to <@${recipient.id}>`)
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Recipient', value: `<@${recipient.id}>`, inline: true },
                    { name: 'Item', value: itemData.name, inline: true },
                    { name: 'Item ID', value: itemData.id, inline: true },
                    { name: 'Quantity', value: `${quantity}`, inline: true },
                    { name: 'Type', value: itemData.type || 'Unknown', inline: true }
                );

            if (itemData.durability) {
                const durability = overrideDurability !== null && overrideDurability !== undefined 
                    ? overrideDurability 
                    : itemData.durability;
                embed.addFields({ 
                    name: 'Durability', 
                    value: `${durability}/${itemData.durability}`, 
                    inline: true 
                });
            }

            if (itemData.value) {
                embed.addFields({ 
                    name: 'Value', 
                    value: `${itemData.value} coins`, 
                    inline: true 
                });
            }

            if (itemData.description) {
                embed.addFields({ 
                    name: 'Description', 
                    value: itemData.description, 
                    inline: false 
                });
            }

            embed.setTimestamp()
                .setFooter({ text: 'Admin Command' });

            // Log admin action
            console.log(`[ADMIN DROP] ${interaction.user.tag} (${interaction.user.id}) gave ${quantity}x ${itemData.name} (${itemData.id}) to ${recipient.tag} (${recipient.id})`);

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error('Drop command failed:', error);
            return interaction.reply({ 
                content: '❌ Something went wrong while giving the item.', 
                ephemeral: true 
            });
        }
    },

    // ========== RESET GACHA COOLDOWN COMMAND ==========
    async executeResetGachaCooldown(interaction) {
        try {
            // Acknowledge the interaction immediately to prevent timeout
            await interaction.deferReply({ ephemeral: true });
            
            const targetUser = interaction.options.getUser('user');
            
            // Fetch user's cooldown data
            const userCooldown = await Cooldown.findOne({ userId: targetUser.id });
            
            if (!userCooldown || !userCooldown.gachaRollData || !userCooldown.gachaRollData.expiresAt) {
                return interaction.editReply({
                    content: `❌ **${targetUser.tag}** doesn't have an active gacha roll cooldown.`
                });
            }
            
            // Get info about the cooldown before removing it
            const cooldownExpiry = new Date(userCooldown.gachaRollData.expiresAt);
            const now = new Date();
            const remainingMs = cooldownExpiry - now;
            const remainingMinutes = Math.ceil(remainingMs / 60000);
            
            // Remove the cooldown
            userCooldown.gachaRollData = undefined;
            await userCooldown.save();
            
            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('⏰ Gacha Cooldown Reset')
                .setDescription(`Successfully reset gacha roll cooldown for **${targetUser.tag}**`)
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Target User', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Time Remaining', value: `${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Admin Command' });

            // Log admin action
            console.log(`[ADMIN RESET GACHA] ${interaction.user.tag} (${interaction.user.id}) reset gacha cooldown for ${targetUser.tag} (${targetUser.id}) - Had ${remainingMinutes} minutes remaining`);

            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('[ADMIN RESET GACHA] Error:', error);
            
            // Try to respond with error message
            try {
                const errorMessage = `❌ Error resetting cooldown: ${error.message}`;
                if (interaction.deferred) {
                    return interaction.editReply({ content: errorMessage });
                } else {
                    return interaction.reply({ content: errorMessage, ephemeral: true });
                }
            } catch (replyError) {
                console.error('[ADMIN RESET GACHA] Failed to send error response:', replyError);
            }
        }
    },

    // ========== UNIQUE ITEM COMMANDS ==========
    
    // Handle manual announcement of unique item discovery
    async handleUniqueAnnounce(interaction) {
        const itemId = interaction.options.getInteger('item_id');
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const withEmbed = interaction.options.getBoolean('with_embed') || false;
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get item data
            const itemData = getUniqueItemById(itemId);
            if (!itemData) {
                return interaction.editReply(`❌ Invalid item ID: ${itemId}`);
            }
            
            // Create a fake item result object that matches what the system expects
            const itemResult = {
                type: 'unique',
                item: itemData,
                message: `🌟 LEGENDARY FIND! ${targetUser.tag} discovered **${itemData.name}**!`,
                systemAnnouncement: {
                    enabled: true,
                    bigText: true,
                    message: `# 🌟 LEGENDARY DISCOVERY! 🌟\n## ${targetUser.tag} has found the legendary **${itemData.name}**!\n### ${itemData.description || 'A unique and powerful item!'}\n\n*This item is one-of-a-kind and now belongs to ${targetUser.tag}!*`
                }
            };
            
            // Send the announcement
            let success;
            if (withEmbed) {
                success = await sendLegendaryAnnouncementWithEmbed(
                    interaction.client,
                    interaction.guild.id,
                    itemResult,
                    targetUser.tag
                );
            } else {
                success = await sendLegendaryAnnouncement(
                    interaction.client,
                    interaction.guild.id,
                    itemResult,
                    targetUser.tag
                );
            }
            
            if (success) {
                return interaction.editReply(`✅ Successfully announced **${itemData.name}** discovery by ${targetUser.tag} across all channels!`);
            } else {
                return interaction.editReply(`❌ Failed to send announcement. Check bot permissions.`);
            }
            
        } catch (error) {
            console.error('Error sending announcement:', error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Test announcement system with a fake item
    async handleUniqueTestAnnouncement(interaction) {
        const channelOption = interaction.options.getString('channels') || 'first';
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Create a test item for announcement
            const testItem = {
                id: 999,
                name: '🌈 Test Crystal of Debugging',
                description: 'A magical crystal that tests if announcements are working properly!',
                powerLevel: 99,
                rarity: 'LEGENDARY'
            };
            
            const itemResult = {
                type: 'unique',
                item: testItem,
                message: `🧪 TEST: ${interaction.user.tag} found a test item!`,
                systemAnnouncement: {
                    enabled: true,
                    bigText: true,
                    message: `# 🧪 ANNOUNCEMENT TEST 🧪\n## This is a test announcement!\n### Testing if the legendary item announcement system works.\n\n*Triggered by ${interaction.user.tag} - This is not a real item!*`
                }
            };
            
            // Get @everyone role to check public channels
            const everyoneRole = interaction.guild.roles.everyone;
            
            // Get public channels only (text channels and voice channel text areas)
            const publicChannels = interaction.guild.channels.cache.filter(channel => {
                // Check if it's a text channel (0) or voice channel (2)
                const isTextChannel = channel.type === 0; // GUILD_TEXT
                const isVoiceChannel = channel.type === 2; // GUILD_VOICE
                
                // Skip if not text or voice
                if (!isTextChannel && !isVoiceChannel) return false;
                
                // Check if bot can send messages
                const botPerms = channel.permissionsFor(interaction.guild.members.me);
                if (!botPerms || !botPerms.has(['SendMessages', 'ViewChannel'])) return false;
                
                // Check if @everyone can view the channel (making it "public")
                const everyonePerms = channel.permissionsFor(everyoneRole);
                if (!everyonePerms || !everyonePerms.has('ViewChannel')) return false;
                
                // For voice channels, only include if text-in-voice is enabled
                if (isVoiceChannel) {
                    return botPerms.has('SendMessages');
                }
                
                return true;
            });
            
            let targetChannels = [];
            
            switch(channelOption) {
                case 'all':
                    targetChannels = Array.from(publicChannels.values());
                    break;
                case 'first':
                    targetChannels = [publicChannels.first()];
                    break;
                case '3':
                    targetChannels = Array.from(publicChannels.values()).slice(0, 3);
                    break;
                case '5':
                    targetChannels = Array.from(publicChannels.values()).slice(0, 5);
                    break;
            }
            
            if (targetChannels.length === 0) {
                return interaction.editReply('❌ No accessible public channels found! (Private channels are excluded)');
            }
            
            let successCount = 0;
            let failCount = 0;
            
            for (const channel of targetChannels) {
                try {
                    const channelType = channel.type === 2 ? '🔊' : '#';
                    await channel.send(itemResult.systemAnnouncement.message);
                    successCount++;
                    console.log(`[TEST] Sent to ${channelType}${channel.name}`);
                    await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit protection
                } catch (error) {
                    failCount++;
                    console.error(`Failed to send to ${channel.name}:`, error.message);
                }
            }
            
            const channelBreakdown = {
                text: targetChannels.filter(c => c.type === 0).length,
                voice: targetChannels.filter(c => c.type === 2).length
            };
            
            return interaction.editReply(
                `✅ Test announcement sent to PUBLIC channels only!\n` +
                `📊 Results: ${successCount}/${targetChannels.length} successful\n` +
                `📝 Channel Types: ${channelBreakdown.text} text, ${channelBreakdown.voice} voice\n` +
                `${failCount > 0 ? `⚠️ ${failCount} channels failed (check permissions)` : '✨ All public channels received the test!'}\n` +
                `ℹ️ Private/restricted channels were excluded from the announcement.`
            );
            
        } catch (error) {
            console.error('Error in test announcement:', error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Assign a unique item to a player
    async handleUniqueAssign(interaction) {
        const itemId = interaction.options.getInteger('item_id');
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        await interaction.deferReply();
        
        try {
            // Get item data
            const itemData = getUniqueItemById(itemId);
            if (!itemData) {
                return interaction.editReply(`❌ Invalid item ID: ${itemId}`);
            }
            
            // Check if item exists in database
            let dbItem = await UniqueItem.findOne({ itemId });
            
            if (!dbItem) {
                // Create the item in database
                dbItem = await UniqueItem.create({
                    itemId: itemId,
                    maintenanceType: itemData.maintenanceType,
                    maintenanceCost: itemData.maintenanceCost,
                    requiresMaintenance: itemData.requiresMaintenance,
                    maintenanceLevel: 10
                });
            }
            
            // Check if item is already owned
            if (dbItem.ownerId && dbItem.ownerId !== targetUser.id) {
                return interaction.editReply(`⚠️ **${itemData.name}** is already owned by ${dbItem.ownerTag}!`);
            }
            
            // Assign the item
            await dbItem.assignToPlayer(targetUser.id, targetUser.tag);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Unique Item Assigned!')
                .setDescription(`**${itemData.name}** has been assigned to ${targetUser}`)
                .addFields(
                    { name: 'Item Type', value: `${itemData.type} (${itemData.slot})`, inline: true },
                    { name: 'Rarity', value: itemData.rarity, inline: true },
                    { name: 'Maintenance', value: `${itemData.maintenanceType} (${itemData.maintenanceCost})`, inline: true }
                )
                .setColor(0x00FF00)
                .setTimestamp();
                
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error assigning item:', error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Remove a unique item from a player
    async handleUniqueRemove(interaction) {
        const itemId = interaction.options.getInteger('item_id');
        
        await interaction.deferReply();
        
        try {
            const dbItem = await UniqueItem.findOne({ itemId });
            
            if (!dbItem) {
                return interaction.editReply(`❌ Item ${itemId} not found in database`);
            }
            
            if (!dbItem.ownerId) {
                return interaction.editReply(`⚠️ This item is already unowned`);
            }
            
            const previousOwner = dbItem.ownerTag;
            
            // Remove owner
            dbItem.ownerId = null;
            dbItem.ownerTag = null;
            dbItem.maintenanceLevel = 10; // Reset maintenance
            await dbItem.save();
            
            const itemData = getUniqueItemById(itemId);
            
            return interaction.editReply(`✅ Removed **${itemData?.name || `Item ${itemId}`}** from ${previousOwner}`);
            
        } catch (error) {
            console.error('Error removing item:', error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Reset a unique item to unowned state
    async handleUniqueReset(interaction) {
        const itemId = interaction.options.getInteger('item_id');
        
        await interaction.deferReply();
        
        try {
            const dbItem = await UniqueItem.findOne({ itemId });
            
            if (!dbItem) {
                return interaction.editReply(`❌ Item ${itemId} not found in database`);
            }
            
            // Reset everything
            dbItem.ownerId = null;
            dbItem.ownerTag = null;
            dbItem.maintenanceLevel = 10;
            dbItem.previousOwners = [];
            dbItem.statistics = {
                timesFound: 0,
                timesLostToMaintenance: 0,
                totalMaintenancePerformed: 0,
                totalCoinsSpentOnMaintenance: 0
            };
            dbItem.activityTracking = {
                miningBlocksThisCycle: 0,
                voiceMinutesThisCycle: 0,
                combatWinsThisCycle: 0,
                socialInteractionsThisCycle: 0
            };
            
            await dbItem.save();
            
            const itemData = getUniqueItemById(itemId);
            
            return interaction.editReply(`✅ Reset **${itemData?.name || `Item ${itemId}`}** to factory defaults`);
            
        } catch (error) {
            console.error('Error resetting item:', error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Set maintenance level for an item
    async handleUniqueMaintenance(interaction) {
        const itemId = interaction.options.getInteger('item_id');
        const level = interaction.options.getInteger('level');
        
        await interaction.deferReply();
        
        try {
            const dbItem = await UniqueItem.findOne({ itemId });
            
            if (!dbItem) {
                return interaction.editReply(`❌ Item ${itemId} not found in database`);
            }
            
            dbItem.maintenanceLevel = level;
            await dbItem.save();
            
            const itemData = getUniqueItemById(itemId);
            
            return interaction.editReply(`✅ Set **${itemData?.name || `Item ${itemId}`}** maintenance to ${level}/10`);
            
        } catch (error) {
            console.error('Error setting maintenance:', error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // List all unique items and their owners
    async handleUniqueList(interaction) {
        await interaction.deferReply();
        
        try {
            const allItems = await UniqueItem.find({});
            
            const embed = new EmbedBuilder()
                .setTitle('🗃️ All Unique Items Status')
                .setColor(0x9B59B6)
                .setTimestamp();
            
            for (const dbItem of allItems) {
                const itemData = getUniqueItemById(dbItem.itemId);
                if (!itemData) continue;
                
                const status = dbItem.ownerId 
                    ? `👤 **Owner:** ${dbItem.ownerTag}\n📊 **Maintenance:** ${dbItem.maintenanceLevel}/10`
                    : `❌ **Unowned** (Available to find)`;
                    
                embed.addFields({
                    name: `${itemData.name} (ID: ${itemData.id})`,
                    value: status,
                    inline: true
                });
            }
            
            if (allItems.length === 0) {
                embed.setDescription('No unique items in database. Run initialization first!');
            }
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error listing items:', error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Quick command to give yourself Blue Breeze
    async handleQuickBlueBreeze(interaction) {
        await interaction.deferReply();
        
        try {
            // Blue Breeze has ID 1
            const itemId = 1;
            const itemData = getUniqueItemById(itemId);
            
            if (!itemData) {
                return interaction.editReply('❌ Blue Breeze not found in item sheet!');
            }
            
            // Check if item exists in database
            let dbItem = await UniqueItem.findOne({ itemId });
            
            if (!dbItem) {
                // Create the item
                dbItem = await UniqueItem.create({
                    itemId: itemId,
                    maintenanceType: itemData.maintenanceType,
                    maintenanceCost: itemData.maintenanceCost,
                    requiresMaintenance: itemData.requiresMaintenance,
                    maintenanceLevel: 10
                });
            }
            
            // Check if already owned by someone else
            if (dbItem.ownerId && dbItem.ownerId !== interaction.user.id) {
                return interaction.editReply(`⚠️ Blue Breeze is already owned by ${dbItem.ownerTag}!`);
            }
            
            // Assign to the command user
            await dbItem.assignToPlayer(interaction.user.id, interaction.user.tag);
            
            const embed = new EmbedBuilder()
                .setTitle('🌟 Blue Breeze Acquired!')
                .setDescription(`You now own the legendary **Blue Breeze** pickaxe!`)
                .addFields(
                    { name: '⚔️ Stats', value: 'Mining +30\nLuck +50\nSpeed +10', inline: true },
                    { name: '🔧 Maintenance', value: '5000 coins/day\nCurrent: 10/10', inline: true },
                    { name: '✨ Special Effects', value: '• Double ore chance\n• Wind barrier protection\n• Increased movement speed', inline: false }
                )
                .setColor(0x00BFFF)
                .setFooter({ text: 'Use /stats to see it equipped!' })
                .setTimestamp();
                
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error assigning Blue Breeze:', error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Grant The One Pick to a worthy soul
    async handleGrantTheOne(interaction) {
        const chosenUser = interaction.options.getUser('chosen');
        await interaction.deferReply();
        
        try {
            // The One Pick has ID 9
            const itemId = 9;
            const itemData = getUniqueItemById(itemId);
            
            if (!itemData) {
                return interaction.editReply('🌙 The One Pick exists beyond this reality...');
            }
            
            // Check if item exists in database
            let dbItem = await UniqueItem.findOne({ itemId });
            
            if (!dbItem) {
                // Create The One Pick
                dbItem = await UniqueItem.create({
                    itemId: itemId,
                    maintenanceType: itemData.maintenanceType,
                    maintenanceCost: itemData.maintenanceCost,
                    requiresMaintenance: false, // The One Pick maintains itself
                    maintenanceLevel: 10
                });
            }
            
            // Remove from current owner if any
            if (dbItem.ownerId && dbItem.ownerId !== chosenUser.id) {
                dbItem.previousOwners.push({
                    userId: dbItem.ownerId,
                    userTag: dbItem.ownerTag,
                    acquiredDate: dbItem.updatedAt,
                    lostDate: new Date(),
                    lostReason: 'other'
                });
            }
            
            // Grant to the chosen one
            await dbItem.assignToPlayer(chosenUser.id, chosenUser.tag);
            
            const embed = new EmbedBuilder()
                .setTitle('✨ The Cosmos Has Spoken ✨')
                .setDescription(
                    `The threads of fate converge...\n\n` +
                    `${chosenUser} has been chosen as the heir to the Miner King's legacy.\n\n` +
                    `**The One Pick** reveals itself from the space between spaces, ` +
                    `its impossible weight both nothing and everything at once. ` +
                    `As they grasp its handle, visions of infinite tunnels and ` +
                    `ore veins that exist in dimensions beyond counting flash before their eyes.\n\n` +
                    `*The pick has chosen. The search of a thousand generations ends.*`
                )
                .addFields(
                    { 
                        name: '🎭 The Inheritance', 
                        value: 'With The One Pick comes the burden of its legend. Use it wisely.', 
                        inline: false 
                    },
                    {
                        name: '⛏️ Whispered Truths',
                        value: 'Some say the pick remembers every stone it has ever broken...\n' +
                               'Others claim it can hear the songs of ore yet unborn...\n' +
                               'All agree: it changes those who wield it.',
                        inline: false
                    }
                )
                .setColor(0xFFFFFF) // Pure white
                .setFooter({ text: 'The Miner King\'s Legacy Lives On' })
                .setTimestamp();
                
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error granting The One Pick:', error);
            return interaction.editReply('🌑 The Pick resists... perhaps the time is not right.');
        }
    },

    // ========== HELPER FUNCTIONS ==========
    
    /**
     * Quick reference function to list available items (for debugging)
     */
    async listItems(interaction) {
        const items = Array.from(itemMap.values());
        const itemList = items.slice(0, 20).map(item => 
            `**${item.id}** - ${item.name} (${item.type})`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('📋 Available Items (First 20)')
            .setDescription(itemList)
            .setColor(0x3498db)
            .setFooter({ text: `Total items: ${items.length}` });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },

    // ========== FORCE RAIL EVENT ==========
    async executeForceRailEvent(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if user is in a voice channel
            const voiceChannel = interaction.member?.voice?.channel;
            if (!voiceChannel) {
                return interaction.editReply({
                    content: '❌ You must be in a voice channel to trigger mining events!'
                });
            }

            // Get the database entry for this voice channel
            const dbEntry = await gachaVC.findOne({ channelId: voiceChannel.id });
            if (!dbEntry) {
                return interaction.editReply({
                    content: '❌ No mining session found for this voice channel. Start mining first!'
                });
            }

            // Check if there's map data
            if (!dbEntry.gameData?.map) {
                return interaction.editReply({
                    content: '❌ No map data found. The mining session needs to be initialized first!'
                });
            }

            console.log(`[ADMIN] ${interaction.user.tag} forcing rail building event in ${voiceChannel.name}`);

            // Force trigger the rail building event
            const result = await startRailBuildingEvent(voiceChannel, dbEntry);

            const embed = new EmbedBuilder()
                .setTitle('🚂 Force Rail Event - SUCCESS')
                .setDescription(`Rail building event has been triggered in <#${voiceChannel.id}>!\n\n**Result:** ${result}`)
                .setColor(0x4169E1)
                .addFields(
                    { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Channel', value: `<#${voiceChannel.id}>`, inline: true },
                    { name: 'Event Type', value: 'Rail Building', inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Force Event Command' });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error forcing rail building event:', error);
            return interaction.editReply({
                content: `❌ Failed to trigger rail building event: ${error.message}`
            });
        }
    },

    // ========== FORCE COLLAPSE EVENT ==========
    async executeForceCollapseEvent(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if user is in a voice channel
            const voiceChannel = interaction.member?.voice?.channel;
            if (!voiceChannel) {
                return interaction.editReply({
                    content: '❌ You must be in a voice channel to trigger mining events!'
                });
            }

            // Get the database entry for this voice channel
            const dbEntry = await gachaVC.findOne({ channelId: voiceChannel.id });
            if (!dbEntry) {
                return interaction.editReply({
                    content: '❌ No mining session found for this voice channel. Start mining first!'
                });
            }

            // Check if there's map data
            if (!dbEntry.gameData?.map) {
                return interaction.editReply({
                    content: '❌ No map data found. The mining session needs to be initialized first!'
                });
            }

            console.log(`[ADMIN] ${interaction.user.tag} forcing mine collapse event in ${voiceChannel.name}`);

            // Force trigger the mine collapse event
            const result = await startMineCollapseEvent(voiceChannel, dbEntry);

            const embed = new EmbedBuilder()
                .setTitle('⛰️ Force Collapse Event - SUCCESS')
                .setDescription(`Mine collapse event has been triggered in <#${voiceChannel.id}>!\n\n**Result:** ${result}`)
                .setColor(0x8B4513)
                .addFields(
                    { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Channel', value: `<#${voiceChannel.id}>`, inline: true },
                    { name: 'Event Type', value: 'Mine Collapse', inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Force Event Command' });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error forcing mine collapse event:', error);
            return interaction.editReply({
                content: `❌ Failed to trigger mine collapse event: ${error.message}`
            });
        }
    },

    // ========== RATE LIMIT STATS COMMAND ==========
    async executeRateLimitStats(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Get rate limit stats from global scope (set in index.js)
            const stats = global.getRateLimitStats ? global.getRateLimitStats() : null;
            
            if (!stats) {
                return interaction.editReply({
                    content: '❌ Rate limit tracking not available. Make sure the bot was started with rate limit monitoring enabled.'
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🚨 Discord API Rate Limit Statistics')
                .setColor(stats.totalHits > 0 ? 0xFF6B6B : 0x00FF00)
                .setTimestamp();

            // Overall stats
            embed.addFields(
                { name: '📊 Total Rate Limits Hit', value: `${stats.totalHits}`, inline: true },
                { name: '🔄 Consecutive Hits', value: `${stats.consecutiveHits}`, inline: true },
                { name: '⏰ Last Hit', value: stats.lastHit ? `<t:${Math.floor(stats.lastHit.getTime() / 1000)}:R>` : 'Never', inline: true }
            );

            if (stats.timeSinceLastHit !== null) {
                const minutes = Math.floor(stats.timeSinceLastHit / (1000 * 60));
                const seconds = Math.floor((stats.timeSinceLastHit % (1000 * 60)) / 1000);
                embed.addFields(
                    { name: '⌛ Time Since Last Hit', value: `${minutes}m ${seconds}s ago`, inline: true }
                );
            }

            // Route breakdown
            const routeEntries = Object.entries(stats.routeBreakdown);
            if (routeEntries.length > 0) {
                let routeBreakdown = '';
                const sortedRoutes = routeEntries
                    .sort(([,a], [,b]) => b.count - a.count)
                    .slice(0, 10); // Top 10 routes

                for (const [route, data] of sortedRoutes) {
                    const timeSince = data.timeSinceLastHit ? 
                        `${Math.floor(data.timeSinceLastHit / (1000 * 60))}m ago` : 
                        'Never';
                    routeBreakdown += `**${route}**: ${data.count} hits (${timeSince})\n`;
                }

                if (routeBreakdown) {
                    embed.addFields(
                        { name: '🛣️ Most Rate Limited Routes', value: routeBreakdown || 'None', inline: false }
                    );
                }
            }

            // Status indicator
            let statusColor = 0x00FF00; // Green
            let statusText = '✅ All systems normal';
            
            if (stats.consecutiveHits >= 3) {
                statusColor = 0xFF6B6B; // Red
                statusText = '🚨 High rate limiting detected!';
            } else if (stats.totalHits > 10) {
                statusColor = 0xFFB347; // Orange
                statusText = '⚠️ Some rate limiting occurred';
            }

            embed.setColor(statusColor);
            embed.setDescription(statusText);

            // Add recommendations if needed
            if (stats.consecutiveHits >= 3) {
                embed.addFields(
                    { 
                        name: '💡 Recommendations', 
                        value: '• Consider reducing API calls\n• Check for loops or rapid commands\n• Monitor bot activity patterns', 
                        inline: false 
                    }
                );
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error getting rate limit stats:', error);
            return interaction.editReply({
                content: `❌ Failed to retrieve rate limit statistics: ${error.message}`
            });
        }
    },

    // ========== FIX INVENTORY DURABILITY COMMAND ==========
    async executeFixInventoryDurability(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const { fixInventoryDurability } = require('../scripts/fixInventoryDurability');
            
            const embed = new EmbedBuilder()
                .setTitle('🔧 Fixing Inventory Durability...')
                .setDescription('This may take a few moments for large databases.')
                .setColor(0xFFB347)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Run the fix
            const result = await fixInventoryDurability();

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Inventory Durability Fix Complete!')
                .addFields(
                    { name: '👥 Players Fixed', value: `${result.playersFixed}`, inline: true },
                    { name: '🔧 Items Fixed', value: `${result.itemsFixed}`, inline: true },
                    { name: '⚡ Status', value: 'All durability issues resolved', inline: false }
                )
                .setColor(0x00FF00)
                .setTimestamp()
                .setFooter({ text: `Fixed by ${interaction.user.tag}` });

            return interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('Error fixing inventory durability:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Durability Fix Failed')
                .setDescription(`Error: ${error.message}`)
                .setColor(0xFF0000)
                .setTimestamp();
                
            return interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    // ========== STATS COMMAND ==========
    async executeStats(interaction) {
        try {
            await interaction.deferReply();
            
            const gameMode = interaction.options.getString('game_mode') || 'mining';
            const targetUser = interaction.options.getUser('user');
            const gameStatTracker = new GameStatTracker();
            
            let embeds = [];
            
            if (targetUser) {
                // Show stats for specific user
                const userStats = await gameStatTracker.getUserGameStats(targetUser.id, interaction.guild.id, gameMode);
                
                if (gameMode === 'all') {
                    // Show all game modes for the user
                    const miningStats = await gameStatTracker.getUserGameStats(targetUser.id, interaction.guild.id, 'mining');
                    
                    const embed = new EmbedBuilder()
                        .setTitle(`📊 Game Statistics - ${targetUser.displayName}`)
                        .setColor(0x00ff00)
                        .setTimestamp();
                    
                    // Add mining stats
                    if (miningStats && Object.keys(miningStats).length > 0) {
                        const miningFields = this.formatGameStatsForEmbed(miningStats, 'Mining');
                        embed.addFields(miningFields);
                    } else {
                        embed.addFields({ name: '⛏️ Mining', value: 'No mining statistics available', inline: false });
                    }
                    
                    embeds.push(embed);
                } else {
                    // Show specific game mode
                    const embed = new EmbedBuilder()
                        .setTitle(`📊 ${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)} Statistics - ${targetUser.displayName}`)
                        .setColor(0x00ff00)
                        .setTimestamp();
                    
                    if (userStats && Object.keys(userStats).length > 0) {
                        const fields = this.formatGameStatsForEmbed(userStats, gameMode);
                        embed.addFields(fields);
                    } else {
                        embed.setDescription(`No ${gameMode} statistics available for this user.`);
                    }
                    
                    embeds.push(embed);
                }
            } else {
                // Show stats for all users
                const allUsersStats = await gameStatTracker.getAllUsersGameStats(interaction.guild.id, gameMode);
                
                if (allUsersStats.length === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle('📊 Game Statistics')
                        .setDescription(`No ${gameMode} statistics available for any users.`)
                        .setColor(0xffaa00)
                        .setTimestamp();
                    embeds.push(embed);
                } else {
                    // Group users by game mode and create embeds
                    if (gameMode === 'all') {
                        // Create separate embeds for each game mode
                        const miningUsers = await gameStatTracker.getAllUsersGameStats(interaction.guild.id, 'mining');
                        
                        if (miningUsers.length > 0) {
                            const miningEmbed = new EmbedBuilder()
                                .setTitle('⛏️ Mining Statistics - All Users')
                                .setColor(0x8B4513)
                                .setTimestamp();
                            
                            const miningFields = this.formatAllUsersStatsForEmbed(miningUsers, 'mining');
                            miningEmbed.addFields(miningFields);
                            embeds.push(miningEmbed);
                        }
                    } else {
                        // Single game mode
                        const embed = new EmbedBuilder()
                            .setTitle(`📊 ${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)} Statistics - All Users`)
                            .setColor(0x00ff00)
                            .setTimestamp();
                        
                        const fields = this.formatAllUsersStatsForEmbed(allUsersStats, gameMode);
                        embed.addFields(fields);
                        embeds.push(embed);
                    }
                }
            }
            
            // Send embeds (Discord has a limit of 10 embeds per message)
            const maxEmbeds = Math.min(embeds.length, 10);
            await interaction.editReply({ embeds: embeds.slice(0, maxEmbeds) });
            
        } catch (error) {
            console.error('Error executing stats command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Stats Command Failed')
                .setDescription(`Error: ${error.message}`)
                .setColor(0xFF0000)
                .setTimestamp();
                
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    // Helper method to format game stats for embed
    formatGameStatsForEmbed(stats, gameMode) {
        const fields = [];
        
        if (gameMode === 'mining') {
            // Tiles moved
            if (stats.tilesMoved > 0) {
                fields.push({ name: '🚶 Tiles Moved', value: stats.tilesMoved.toString(), inline: true });
            }
            
            // Items found
            if (stats.itemsFound && Object.keys(stats.itemsFound).length > 0) {
                const itemCount = Object.values(stats.itemsFound).reduce((sum, count) => sum + count, 0);
                console.log(`[ADMIN STATS] Items found data:`, stats.itemsFound);
                fields.push({ name: '💎 Items Found', value: itemCount.toString(), inline: true });
            } else {
                console.log(`[ADMIN STATS] No items found data for user. Stats object:`, stats);
            }
            
            // Tiles broken
            if (stats.tilesBroken && Object.keys(stats.tilesBroken).length > 0) {
                const tileCount = Object.values(stats.tilesBroken).reduce((sum, count) => sum + count, 0);
                fields.push({ name: '⛏️ Tiles Broken', value: tileCount.toString(), inline: true });
            }
            
            // Hazards
            const hazardsEvaded = stats.hazardsEvaded || 0;
            const hazardsTriggered = stats.hazardsTriggered || 0;
            const hazardsSeen = stats.hazardsSeen || 0;
            
            if (hazardsEvaded > 0 || hazardsTriggered > 0 || hazardsSeen > 0) {
                fields.push({ 
                    name: '⚠️ Hazards', 
                    value: `Evaded: ${hazardsEvaded}\nTriggered: ${hazardsTriggered}\nSeen: ${hazardsSeen}`, 
                    inline: true 
                });
            }
            
            // Power level
            if (stats.highestPowerLevel > 0) {
                fields.push({ name: '⚡ Highest Power Level', value: stats.highestPowerLevel.toString(), inline: true });
            }
            
            // Time in mining
            if (stats.timeInMiningChannel > 0) {
                const hours = Math.floor(stats.timeInMiningChannel / 3600);
                const minutes = Math.floor((stats.timeInMiningChannel % 3600) / 60);
                fields.push({ 
                    name: '⏰ Time in Mining', 
                    value: `${hours}h ${minutes}m`, 
                    inline: true 
                });
            }
            
            // Movement by direction
            if (stats.movementByDirection && Object.keys(stats.movementByDirection).length > 0) {
                const directionStats = Object.entries(stats.movementByDirection)
                    .map(([dir, count]) => `${dir}: ${count}`)
                    .join('\n');
                fields.push({ name: '🧭 Movement by Direction', value: directionStats, inline: true });
            }
        }
        
        return fields;
    },

    // Helper method to format all users stats for embed
    formatAllUsersStatsForEmbed(usersStats, gameMode) {
        const fields = [];
        
        // Sort users by activity level
        const sortedUsers = usersStats.sort((a, b) => {
            const aActivity = this.getUserActivityLevel(a.gameStats, gameMode);
            const bActivity = this.getUserActivityLevel(b.gameStats, gameMode);
            return bActivity - aActivity;
        });
        
        // Show top 10 most active users
        const topUsers = sortedUsers.slice(0, 10);
        
        for (const user of topUsers) {
            const activityLevel = this.getUserActivityLevel(user.gameStats, gameMode);
            if (activityLevel > 0) {
                const username = user.username || 'Unknown';
                const stats = user.gameStats;
                
                let value = '';
                if (gameMode === 'mining') {
                    const tilesMoved = stats.tilesMoved || 0;
                    const itemsFound = stats.itemsFound ? Object.values(stats.itemsFound).reduce((sum, count) => sum + count, 0) : 0;
                    const tilesBroken = stats.tilesBroken ? Object.values(stats.tilesBroken).reduce((sum, count) => sum + count, 0) : 0;
                    
                    value = `Moved: ${tilesMoved} | Items: ${itemsFound} | Broken: ${tilesBroken}`;
                }
                
                fields.push({ 
                    name: username, 
                    value: value || 'No activity', 
                    inline: false 
                });
            }
        }
        
        if (fields.length === 0) {
            fields.push({ name: 'No Activity', value: 'No users have any recorded activity.', inline: false });
        }
        
        return fields;
    },

    // Helper method to calculate user activity level
    getUserActivityLevel(gameStats, gameMode) {
        if (!gameStats) return 0;
        
        if (gameMode === 'mining') {
            const tilesMoved = gameStats.tilesMoved || 0;
            const itemsFound = gameStats.itemsFound ? Object.values(gameStats.itemsFound).reduce((sum, count) => sum + count, 0) : 0;
            const tilesBroken = gameStats.tilesBroken ? Object.values(gameStats.tilesBroken).reduce((sum, count) => sum + count, 0) : 0;
            
            return tilesMoved + itemsFound + tilesBroken;
        }
        
        return 0;
    }
};
