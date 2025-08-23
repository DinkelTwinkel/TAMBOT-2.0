// sampleBotIntegration.js
// This shows how to integrate the Dig Deeper feature into your main bot file
// Add these snippets to your existing bot initialization code

// ============================================================================
// IMPORTS - Add this with your other requires at the top
// ============================================================================
const DigDeeperListener = require('./patterns/digDeeperListener');

// ============================================================================
// BOT INITIALIZATION - Add this in your client ready event
// ============================================================================

client.on('ready', () => {
    console.log(`${client.user.tag} is online!`);
    
    // ... your other initialization code ...
    
    // Initialize the Dig Deeper listener
    const digDeeperListener = new DigDeeperListener(client);
    console.log('[DIG_DEEPER] Listener initialized and ready');
    
    // Store reference for potential cleanup or debugging
    client.digDeeperListener = digDeeperListener;
    
    // ... rest of your ready event code ...
});

// ============================================================================
// OPTIONAL: Command to check mining stats (for debugging/admin)
// ============================================================================

// If you have a slash command handler, you can add this command:
const { SlashCommandBuilder } = require('discord.js');
const ActiveVCS = require('./models/activevcs');
const deeperMineChecker = require('./patterns/mining/deeperMineChecker');

// Slash command definition
const miningStatsCommand = new SlashCommandBuilder()
    .setName('miningstats')
    .setDescription('Check mining statistics for the current voice channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// Command execution
async function executeMiningStats(interaction) {
    // Check if user is in a voice channel
    if (!interaction.member.voice.channel) {
        return interaction.reply({ 
            content: '❌ You must be in a voice channel to check mining stats!', 
            ephemeral: true 
        });
    }
    
    const channelId = interaction.member.voice.channel.id;
    
    // Get database entry
    const dbEntry = await ActiveVCS.findOne({ channelId: channelId });
    if (!dbEntry) {
        return interaction.reply({ 
            content: '❌ This is not an active mining channel!', 
            ephemeral: true 
        });
    }
    
    // Get mine configuration
    const mineConfig = deeperMineChecker.getMineConfig(dbEntry.typeId);
    if (!mineConfig) {
        return interaction.reply({ 
            content: '❌ This mine does not have deeper level conditions!', 
            ephemeral: true 
        });
    }
    
    // Get progress
    const progress = deeperMineChecker.getProgress(dbEntry, mineConfig);
    const progressBar = deeperMineChecker.createProgressBar(progress.percentage);
    const conditionDesc = deeperMineChecker.getConditionDescription(mineConfig);
    
    // Get all stats
    const stats = dbEntry.gameData?.miningStats || {};
    
    // Create embed
    const statsEmbed = new EmbedBuilder()
        .setTitle('⛏️ Mining Statistics')
        .setDescription(`**Current Mine:** ${mineConfig.name}`)
        .setColor(0x8B4513)
        .addFields(
            { 
                name: '📊 Overall Stats', 
                value: [
                    `Walls Broken: **${stats.totalWallsBroken || 0}**`,
                    `Ores Found: **${stats.totalOresFound || 0}**`,
                    `Treasures Found: **${stats.totalTreasuresFound || 0}**`,
                    `Total Value Mined: **${stats.totalValueMined || 0}** coins`
                ].join('\n'),
                inline: true 
            },
            { 
                name: '💎 Rare Finds', 
                value: [
                    `Rare Ores: **${stats.rareOresFound || 0}**`,
                    `Epic Ores: **${stats.epicOresFound || 0}**`,
                    `Legendary Ores: **${stats.legendaryOresFound || 0}**`,
                    `Fossils: **${stats.fossilsFound || 0}**`
                ].join('\n'),
                inline: true 
            },
            { 
                name: '🔓 Deeper Level Progress', 
                value: [
                    `**Requirement:** ${conditionDesc}`,
                    progressBar,
                    `**Progress:** ${progress.current}/${progress.required} (${progress.percentage}%)`,
                    progress.percentage >= 100 ? '✅ **Deeper level unlocked!**' : ''
                ].filter(Boolean).join('\n'),
                inline: false 
            }
        )
        .setTimestamp();
    
    if (stats.deeperLevelReached) {
        statsEmbed.addFields({
            name: '🏆 Achievement',
            value: `Deeper level reached <t:${Math.floor(stats.deeperLevelTime / 1000)}:R>`,
            inline: false
        });
    }
    
    await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
}

// ============================================================================
// OPTIONAL: Command to manually reset mining stats (admin only)
// ============================================================================

const resetStatsCommand = new SlashCommandBuilder()
    .setName('resetminingstats')
    .setDescription('Reset mining statistics for the current channel (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function executeResetStats(interaction) {
    if (!interaction.member.voice.channel) {
        return interaction.reply({ 
            content: '❌ You must be in a voice channel!', 
            ephemeral: true 
        });
    }
    
    const channelId = interaction.member.voice.channel.id;
    const dbEntry = await ActiveVCS.findOne({ channelId: channelId });
    
    if (!dbEntry) {
        return interaction.reply({ 
            content: '❌ This is not an active mining channel!', 
            ephemeral: true 
        });
    }
    
    // Reset stats
    dbEntry.gameData.miningStats = {
        totalWallsBroken: 0,
        totalOresFound: 0,
        totalTreasuresFound: 0,
        totalValueMined: 0,
        rareOresFound: 0,
        epicOresFound: 0,
        legendaryOresFound: 0,
        fossilsFound: 0,
        startTime: Date.now()
    };
    
    dbEntry.markModified('gameData.miningStats');
    await dbEntry.save();
    
    await interaction.reply({ 
        content: '✅ Mining statistics have been reset!', 
        ephemeral: true 
    });
}

// ============================================================================
// CLEANUP ON SHUTDOWN (Optional but recommended)
// ============================================================================

process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    
    // If you need to do any cleanup
    if (client.digDeeperListener) {
        console.log('[DIG_DEEPER] Cleaning up listener...');
        // The listener will be cleaned up automatically when the client disconnects
    }
    
    // Destroy the client connection
    client.destroy();
    process.exit(0);
});

// ============================================================================
// ERROR HANDLING (Add to your existing error handlers)
// ============================================================================

client.on('error', (error) => {
    console.error('[BOT] Client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('[BOT] Unhandled promise rejection:', error);
});

// ============================================================================
// MONITORING (Optional - for debugging deeper mine feature)
// ============================================================================

// Log when deeper mines are created
client.on('channelCreate', (channel) => {
    if (channel.name?.includes('[ DEEPER ]')) {
        console.log(`[DEEPER_MINE] New deeper mine created: ${channel.name} (${channel.id})`);
    }
});

// Log when channels are deleted (to track old mine cleanup)
client.on('channelDelete', (channel) => {
    if (channel.name?.includes('⛏️')) {
        console.log(`[MINING] Mine channel deleted: ${channel.name} (${channel.id})`);
    }
});

// ============================================================================
// NOTES:
// ============================================================================
// 1. Make sure the DigDeeperListener is initialized AFTER the client is ready
// 2. The listener automatically handles all button interactions for dig_deeper
// 3. The optional commands can help with debugging and admin management
// 4. Monitor the console logs for any [DIG_DEEPER] or [DEEPER_MINE] messages
// 5. Test with different mine types to ensure all conditions work properly