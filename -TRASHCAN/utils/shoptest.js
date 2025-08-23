// shopTestCommand.js - Test command to verify shop optimizations
// Place this in your commands folder to test the shop performance

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shoptest')
        .setDescription('Test shop handler performance')
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View shop handler performance statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear_cache')
                .setDescription('Clear shop price and config caches')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('monitor')
                .setDescription('Start performance monitoring (logs every 5 minutes)')
        ),
    
    async execute(interaction) {
        const shopHandler = interaction.client.shopHandlers?.get(interaction.guild.id);
        
        if (!shopHandler) {
            return interaction.reply({ 
                content: '❌ No shop handler found for this guild. Open a shop first!', 
                ephemeral: true 
            });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'stats': {
                const stats = shopHandler.getPerformanceStats();
                
                const embed = {
                    title: '📊 Shop Handler Performance',
                    fields: [
                        {
                            name: '📈 Interactions',
                            value: [
                                `Total: **${stats.totalInteractions}**`,
                                `Failed: **${stats.failedInteractions}**`,
                                `Failure Rate: **${stats.failureRate}**`
                            ].join('\n'),
                            inline: true
                        },
                        {
                            name: '⚡ Performance',
                            value: [
                                `Avg Response: **${stats.avgResponseTimeMs}ms**`,
                                `Cache Hit Rate: **${stats.cacheHitRate}**`,
                                `Cache Hits: **${stats.cacheHits}**`,
                                `Cache Misses: **${stats.cacheMisses}**`
                            ].join('\n'),
                            inline: true
                        },
                        {
                            name: '🏥 Health Status',
                            value: stats.failedInteractions > 0 && (stats.failedInteractions / stats.totalInteractions) > 0.1
                                ? '⚠️ **High failure rate detected!**'
                                : parseFloat(stats.avgResponseTimeMs) > 1000
                                ? '⚠️ **Slow response times detected!**'
                                : '✅ **Healthy**',
                            inline: true
                        }
                    ],
                    color: stats.failedInteractions > 0 && (stats.failedInteractions / stats.totalInteractions) > 0.1 
                        ? 0xFF0000 
                        : parseFloat(stats.avgResponseTimeMs) > 1000 
                        ? 0xFFA500 
                        : 0x00FF00,
                    timestamp: new Date(),
                    footer: {
                        text: 'Shop Performance Monitor'
                    }
                };
                
                // Add recommendations if issues detected
                if (parseFloat(stats.avgResponseTimeMs) > 1000) {
                    embed.fields.push({
                        name: '💡 Recommendations',
                        value: [
                            '• Check database connection latency',
                            '• Ensure MongoDB indexes are created',
                            '• Consider enabling connection pooling',
                            '• Check if bot and database are in same region'
                        ].join('\n'),
                        inline: false
                    });
                }
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                break;
            }
            
            case 'clear_cache': {
                shopHandler.clearCaches();
                await interaction.reply({ 
                    content: '✅ Shop caches cleared successfully! Next operations will fetch fresh data.', 
                    ephemeral: true 
                });
                break;
            }
            
            case 'monitor': {
                shopHandler.startPerformanceMonitoring();
                await interaction.reply({ 
                    content: '✅ Performance monitoring started! Check console logs every 5 minutes for stats.', 
                    ephemeral: true 
                });
                break;
            }
        }
    }
};