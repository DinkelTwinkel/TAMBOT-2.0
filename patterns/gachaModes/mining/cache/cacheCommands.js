// cacheCommands.js - Discord slash commands for cache management
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mapCacheSystem = require('./mapCacheSystem');
const monitor = require('./cacheMonitor');

// Slash command definition
const cacheCommand = new SlashCommandBuilder()
    .setName('cache')
    .setDescription('Manage the mining cache system')
    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('View cache statistics'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('flush')
            .setDescription('Force save all cached data to database'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('clear')
            .setDescription('Clear cache for a channel')
            .addStringOption(option =>
                option
                    .setName('channel')
                    .setDescription('Channel ID to clear (leave empty for all)')
                    .setRequired(false)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('health')
            .setDescription('Check cache system health'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('performance')
            .setDescription('Run performance test'));

// Command handler
async function handleCacheCommand(interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        await interaction.reply({
            content: '❌ You need administrator permissions to use cache commands.',
            ephemeral: true
        });
        return;
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
        switch (subcommand) {
            case 'stats': {
                await interaction.deferReply({ ephemeral: true });
                
                const report = monitor.getPerformanceReport();
                const stats = mapCacheSystem.getStats();
                
                const embed = new EmbedBuilder()
                    .setTitle('📊 Cache System Statistics')
                    .setColor(0x00AE86)
                    .addFields(
                        { name: 'Uptime', value: report.uptime, inline: true },
                        { name: 'Cached Channels', value: String(report.cacheSize), inline: true },
                        { name: 'Hit Rate', value: report.hitRate, inline: true },
                        { name: 'Total Hits', value: String(report.totalHits), inline: true },
                        { name: 'Total Misses', value: String(report.totalMisses), inline: true },
                        { name: 'Ops/Second', value: report.avgOpsPerSecond, inline: true },
                        { name: 'Pending Writes', value: String(report.pendingWrites), inline: true },
                        { name: 'Completed Writes', value: String(report.completedWrites), inline: true },
                        { name: 'Errors', value: String(report.errors), inline: true },
                        { name: 'Memory (Total)', value: report.memoryUsage.total, inline: true },
                        { name: 'Memory (Cache)', value: report.memoryUsage.cacheEstimate, inline: true },
                        { name: 'Per Channel', value: report.memoryUsage.perChannel, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Mining Cache System v1.0' });
                
                await interaction.editReply({ embeds: [embed] });
                break;
            }
            
            case 'flush': {
                await interaction.deferReply({ ephemeral: true });
                
                const pendingBefore = mapCacheSystem.getStats().pendingWrites;
                await mapCacheSystem.forceFlush();
                
                const embed = new EmbedBuilder()
                    .setTitle('✅ Cache Flushed to Database')
                    .setColor(0x00FF00)
                    .setDescription(`Successfully saved ${pendingBefore} pending updates to the database.`)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
                break;
            }
            
            case 'clear': {
                await interaction.deferReply({ ephemeral: true });
                
                const channelId = interaction.options.getString('channel');
                
                if (channelId) {
                    mapCacheSystem.clearChannel(channelId);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Cache Cleared')
                        .setColor(0xFFAA00)
                        .setDescription(`Cleared cache for channel: ${channelId}`)
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    const sizeBefore = mapCacheSystem.getStats().cacheSize;
                    mapCacheSystem.clearAll();
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ All Cache Cleared')
                        .setColor(0xFFAA00)
                        .setDescription(`Cleared cache for ${sizeBefore} channels.`)
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [embed] });
                }
                break;
            }
            
            case 'health': {
                await interaction.deferReply({ ephemeral: true });
                
                const health = monitor.healthCheck();
                
                const embed = new EmbedBuilder()
                    .setTitle(health.healthy ? '✅ Cache System Healthy' : '⚠️ Cache System Issues Detected')
                    .setColor(health.healthy ? 0x00FF00 : 0xFF0000)
                    .setTimestamp();
                
                if (health.healthy) {
                    embed.setDescription('All systems operating normally.');
                } else {
                    embed.setDescription('The following issues were detected:');
                    health.issues.forEach(issue => {
                        embed.addFields({ name: '⚠️ Issue', value: issue, inline: false });
                    });
                }
                
                await interaction.editReply({ embeds: [embed] });
                break;
            }
            
            case 'performance': {
                await interaction.deferReply({ ephemeral: true });
                
                const channelId = interaction.channelId;
                const comparison = await monitor.comparePerformance(channelId);
                
                const embed = new EmbedBuilder()
                    .setTitle('⚡ Performance Test Results')
                    .setColor(0x0099FF)
                    .setDescription('Comparison between database and cache performance:')
                    .addFields(
                        { name: 'Database Read Time', value: comparison.dbReadTime, inline: true },
                        { name: 'Cache Read Time', value: comparison.cacheReadTime, inline: true },
                        { name: 'Speed Improvement', value: comparison.speedup, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Test performed on channel: ${channelId}` });
                
                await interaction.editReply({ embeds: [embed] });
                break;
            }
            
            default:
                await interaction.reply({
                    content: '❌ Unknown subcommand.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('[CACHE COMMAND] Error:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Command Failed')
            .setColor(0xFF0000)
            .setDescription(`An error occurred: ${error.message}`)
            .setTimestamp();
        
        if (interaction.deferred) {
            await interaction.editReply({ embeds: [errorEmbed] });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

// Export for use in your bot's command handler
module.exports = {
    data: cacheCommand,
    execute: handleCacheCommand,
    
    // Alternative export for different command structures
    command: cacheCommand,
    handler: handleCacheCommand,
    
    // For manual integration
    name: 'cache',
    description: 'Manage the mining cache system',
    run: handleCacheCommand
};