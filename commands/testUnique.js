// commands/testUnique.js
// Simple test command to give yourself Blue Breeze for testing
// REMOVE THIS FILE IN PRODUCTION!

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const UniqueItem = require('../models/uniqueItems');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');
const { initializeUniqueItems } = require('../patterns/uniqueItemFinding');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-blue-breeze')
        .setDescription('Give yourself Blue Breeze for testing (DEV ONLY)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
    async execute(interaction) {
        // Additional admin check as fallback
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '❌ This command is restricted to administrators only!', 
                ephemeral: true 
            });
        }
        
        await interaction.deferReply();
        
        try {
            // Initialize unique items if not done already
            await initializeUniqueItems();
            
            // Blue Breeze has ID 1
            const itemId = 1;
            const itemData = getUniqueItemById(itemId);
            
            if (!itemData) {
                return interaction.editReply('❌ Blue Breeze not found in item sheet!');
            }
            
            // Find or create the item in database
            let dbItem = await UniqueItem.findOne({ itemId });
            
            if (!dbItem) {
                console.log('Creating Blue Breeze in database...');
                dbItem = await UniqueItem.create({
                    itemId: itemId,
                    maintenanceType: itemData.maintenanceType || 'coins',
                    maintenanceCost: itemData.maintenanceCost || 5000,
                    requiresMaintenance: itemData.requiresMaintenance !== false,
                    maintenanceLevel: 10
                });
            }
            
            // If someone else owns it, remove them (for testing only!)
            if (dbItem.ownerId && dbItem.ownerId !== interaction.user.id) {
                console.log(`Removing Blue Breeze from previous owner: ${dbItem.ownerTag}`);
                // Add to history
                dbItem.previousOwners.push({
                    userId: dbItem.ownerId,
                    userTag: dbItem.ownerTag,
                    acquiredDate: dbItem.updatedAt,
                    lostDate: new Date(),
                    lostReason: 'other'
                });
            }
            
            // Assign to the command user
            console.log(`Assigning Blue Breeze to ${interaction.user.tag}`);
            dbItem.ownerId = interaction.user.id;
            dbItem.ownerTag = interaction.user.tag;
            dbItem.maintenanceLevel = 10; // Start with full maintenance
            dbItem.lastMaintenanceDate = new Date();
            dbItem.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
            dbItem.statistics.timesFound = (dbItem.statistics.timesFound || 0) + 1;
            
            await dbItem.save();
            
            const embed = new EmbedBuilder()
                .setTitle('🌟 Blue Breeze Test Assignment Successful!')
                .setDescription(`You now own the legendary **Blue Breeze** pickaxe!`)
                .addFields(
                    { 
                        name: '⚔️ Base Stats', 
                        value: '```\nMining: +30\nLuck:   +50\nSpeed:  +10```', 
                        inline: true 
                    },
                    { 
                        name: '🔧 Maintenance', 
                        value: '```\nType: Coins\nCost: 5000/day\nLevel: 10/10```', 
                        inline: true 
                    },
                    { 
                        name: '✨ Special Effects', 
                        value: '• Chance to find double ore on lucky strikes\n' +
                               '• Generates protective wind barrier (hazard reduction)\n' +
                               '• Creates updrafts (increased movement speed)', 
                        inline: false 
                    },
                    {
                        name: '📊 Testing Instructions',
                        value: '1. Use `/stats` to see it equipped\n' +
                               '2. Use `/unique inventory` to view your unique items\n' +
                               '3. Use `/unique status` to check maintenance\n' +
                               '4. Use `/unique maintain 1` to perform maintenance\n' +
                               '5. Join a mining game to see special effects',
                        inline: false
                    }
                )
                .setColor(0x00BFFF) // Deep Sky Blue
                .setFooter({ text: 'Note: This is a TEST command - remove in production!' })
                .setTimestamp();
            
            // Add a note about the maintenance clock
            embed.addFields({
                name: '⏰ Maintenance Clock',
                value: 'The global maintenance clock reduces all unique items by 1 maintenance level every 24 hours. ' +
                       'If maintenance reaches 0, the item will be lost and return to the available pool!',
                inline: false
            });
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error assigning Blue Breeze:', error);
            return interaction.editReply(`❌ Error: ${error.message}\n\nFull error: \`\`\`${error.stack}\`\`\``);
        }
    }
};
