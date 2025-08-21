// commands/debugUnique.js
// Debug command for testing unique items system (OWNER ONLY)

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UniqueItem = require('../models/uniqueItems');
const { UNIQUE_ITEMS, getUniqueItemById } = require('../data/uniqueItemsSheet');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-unique')
        .setDescription('Debug command for unique items (Owner only)')
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
                .setDescription('Quick command to give yourself Blue Breeze')),
                
    async execute(interaction) {
        // IMPORTANT: Add your Discord user ID here for owner check
        const OWNER_IDS = [
            'YOUR_DISCORD_ID_HERE', // Replace with your actual Discord ID
            '123456789012345678'    // Example ID format
        ];
        
        // Check if user is owner (comment this out for testing if needed)
        if (!OWNER_IDS.includes(interaction.user.id)) {
            // For testing, you might want to check for admin role instead
            const member = interaction.guild.members.cache.get(interaction.user.id);
            if (!member.permissions.has('Administrator')) {
                return interaction.reply({ 
                    content: '❌ This command is restricted to bot owners or administrators only!', 
                    ephemeral: true 
                });
            }
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'assign':
                await handleAssign(interaction);
                break;
            case 'remove':
                await handleRemove(interaction);
                break;
            case 'reset':
                await handleReset(interaction);
                break;
            case 'maintenance':
                await handleMaintenance(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'give-blue-breeze':
                await handleQuickBlueBreeze(interaction);
                break;
        }
    }
};

async function handleAssign(interaction) {
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
            .setTitle('✅ Item Assigned Successfully!')
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
}

async function handleRemove(interaction) {
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
}

async function handleReset(interaction) {
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
}

async function handleMaintenance(interaction) {
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
}

async function handleList(interaction) {
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
}

async function handleQuickBlueBreeze(interaction) {
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
}
