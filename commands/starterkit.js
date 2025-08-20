const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const PlayerInventory = require('../models/inventory');
const Cooldown = require('../models/coolDowns');
const itemSheet = require('../data/itemSheet.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('starterkit')
        .setDescription('Claim your starter kit! (5-day cooldown)'),

    async execute(interaction) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        
        // Define cooldown duration (5 days in milliseconds)
        const COOLDOWN_DURATION = 5 * 24 * 60 * 60 * 1000; // 5 days
        const COOLDOWN_KEY = 'starterkit';

        try {
            // Check cooldown
            const userCooldown = await Cooldown.findOne({ userId });
            
            if (userCooldown) {
                const lastUsed = userCooldown.cooldowns?.get(COOLDOWN_KEY);
                
                if (lastUsed) {
                    const timePassed = Date.now() - new Date(lastUsed).getTime();
                    const timeRemaining = COOLDOWN_DURATION - timePassed;
                    
                    if (timeRemaining > 0) {
                        // Calculate time remaining in a readable format
                        const days = Math.floor(timeRemaining / (24 * 60 * 60 * 1000));
                        const hours = Math.floor((timeRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                        const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
                        
                        let timeString = '';
                        if (days > 0) timeString += `${days} day${days !== 1 ? 's' : ''}, `;
                        if (hours > 0) timeString += `${hours} hour${hours !== 1 ? 's' : ''}, `;
                        if (minutes > 0) timeString += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                        
                        // Remove trailing comma and space
                        timeString = timeString.replace(/, $/, '');
                        
                        const embed = new EmbedBuilder()
                            .setTitle('⏰ Cooldown Active')
                            .setDescription(`You've already claimed your starter kit!\nYou can claim another one in: **${timeString}**`)
                            .setColor(0xFF0000)
                            .setTimestamp();
                        
                        return interaction.editReply({ embeds: [embed] });
                    }
                }
            }

            // Get the rusty pickaxe from itemSheet
            const rustyPickaxe = itemSheet.find(item => item.id === "3");
            
            if (!rustyPickaxe) {
                return interaction.editReply({ 
                    content: '⚘ Error: Rusty Pick Axe not found in item database.', 
                    ephemeral: true 
                });
            }

            // Find or create player inventory
            let playerInventory = await PlayerInventory.findOne({ playerId: userId });
            
            if (!playerInventory) {
                playerInventory = new PlayerInventory({
                    playerId: userId,
                    playerTag: userTag,
                    items: []
                });
            }

            // Check if user already has a rusty pickaxe
            const existingPickaxe = playerInventory.items.find(item => item.itemId === "3");
            
            if (existingPickaxe) {
                // Increase quantity by 1
                existingPickaxe.quantity += 1;
            } else {
                // Add new rusty pickaxe with durability
                playerInventory.items.push({
                    itemId: "3",
                    quantity: 1,
                    currentDurability: rustyPickaxe.durability // Set to 80 from itemSheet
                });
            }

            // Save the inventory
            await playerInventory.save();

            // Update cooldown
            if (!userCooldown) {
                // Create new cooldown document
                await Cooldown.create({
                    userId: userId,
                    cooldowns: new Map([[COOLDOWN_KEY, new Date()]])
                });
            } else {
                // Update existing cooldown
                userCooldown.cooldowns.set(COOLDOWN_KEY, new Date());
                await userCooldown.save();
            }

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('🎁 Starter Kit Claimed!')
                .setDescription(`${interaction.user} has received:\n\n⛏️ **${rustyPickaxe.name}** x1`)
                .addFields(
                    { 
                        name: '📝 Description', 
                        value: rustyPickaxe.description || 'A basic mining tool', 
                        inline: false 
                    },
                    { 
                        name: '⚡ Stats', 
                        value: `Mining Power: ${rustyPickaxe.abilities[0].powerlevel}\nDurability: ${rustyPickaxe.durability}`, 
                        inline: true 
                    },
                    { 
                        name: '💰 Value', 
                        value: `${rustyPickaxe.value} coins`, 
                        inline: true 
                    },
                    {
                        name: '⏰ Next Claim',
                        value: 'Available in 5 days',
                        inline: true
                    }
                )
                .setColor(0x00FF00)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: 'Happy mining! Use /inventory to view your items.' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[STARTERKIT] Error:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('⚘ Error')
                .setDescription('An error occurred while claiming your starter kit. Please try again later.')
                .setColor(0xFF0000)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
