const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transferstats')
        .setDescription('Check item transfer statistics for this server (Admin only)'),
    
    async execute(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }

        if (!interaction.client.itemTransferHandlers) {
            return interaction.reply({
                content: '❌ Transfer handler not initialized.',
                ephemeral: true
            });
        }
        
        const handler = interaction.client.itemTransferHandlers.get(interaction.guild.id);
        if (!handler) {
            return interaction.reply({
                content: '❌ No transfer handler found for this server.',
                ephemeral: true
            });
        }
        
        const stats = handler.getStats();
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Item Transfer Statistics')
            .setDescription(`Statistics for ${interaction.guild.name}`)
            .setColor(0x3498db)
            .addFields(
                { name: '📦 Total Transfers', value: stats.totalTransfers.toString(), inline: true },
                { name: '✅ Successful', value: stats.successfulTransfers.toString(), inline: true },
                { name: '❌ Failed', value: stats.failedTransfers.toString(), inline: true },
                { name: '📈 Success Rate', value: stats.successRate, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Item Transfer System' });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};