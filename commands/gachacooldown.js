const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Cooldown = require('../models/coolDowns');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gachacooldown')
        .setDescription('Check your gacha roll cooldown status'),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        const guild = interaction.guild;
        
        // Fetch user's cooldown data
        const userCooldown = await Cooldown.findOne({ userId });
        
        if (!userCooldown || !userCooldown.gachaRollData || !userCooldown.gachaRollData.expiresAt) {
            return interaction.reply({
                content: '✅ You have no active gacha roll cooldown! You can roll right now.',
                ephemeral: true
            });
        }
        
        const cooldownExpiry = new Date(userCooldown.gachaRollData.expiresAt);
        const now = new Date();
        
        if (cooldownExpiry <= now) {
            // Cooldown has expired, clean it up
            userCooldown.gachaRollData = undefined;
            await userCooldown.save();
            
            return interaction.reply({
                content: '✅ Your gacha roll cooldown has expired! You can roll right now.',
                ephemeral: true
            });
        }
        
        // Cooldown is still active
        const remainingMs = cooldownExpiry - now;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        
        // Get roll data if available
        let vcInfo = '';
        if (userCooldown.gachaRollData.channelId) {
            const existingVC = await guild.channels.fetch(userCooldown.gachaRollData.channelId).catch(() => null);
            if (existingVC) {
                vcInfo = `\n📍 **Current VC:** ${existingVC.name}`;
            }
        }
        
        // Create a nice embed
        const embed = new EmbedBuilder()
            .setTitle('🎰 Gacha Roll Cooldown')
            .setColor('#FF6B6B')
            .setDescription(
                `⏰ You're on cooldown!\n\n` +
                `**Time remaining:** ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} (${remainingSeconds} seconds)\n` +
                `**Next roll available:** <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:R>${vcInfo}`
            )
            .setFooter({ text: 'Gacha rolls reset every hour' })
            .setTimestamp();
        
        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};
