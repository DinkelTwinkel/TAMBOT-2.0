// Example integration for your Discord bot (index.js)
// Add this to your main bot file to use the stat tracking system

const { Client, GatewayIntentBits } = require('discord.js');
const StatTracker = require('./patterns/statTracking');

// Initialize the stat tracker
const tracker = new StatTracker(process.env.MONGODB_URI);

// Your Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

// =============== BOT READY EVENT ===============
client.once('ready', async () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    
    // Connect to MongoDB and recover any active sessions
    await tracker.connect();
    
    // Check for users still in voice channels after restart
    client.guilds.cache.forEach(guild => {
        guild.channels.cache.forEach(channel => {
            if (channel.type === 2) { // Voice channel
                channel.members.forEach(member => {
                    if (!member.user.bot) {
                        // Check if we have an active session for this user
                        if (!tracker.voiceSessions.has(member.user.id)) {
                            // Start tracking if they're in VC but not tracked
                            tracker.startVoiceSession(
                                member.user.id,
                                channel.id,
                                guild.id,
                                member.user.username,
                                channel.name,
                                guild.name
                            );
                        }
                    }
                });
            }
        });
    });
});

// =============== VOICE STATE TRACKING ===============
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = newState.member.user.id;
    const username = newState.member.user.username;
    
    // Ignore bots
    if (newState.member.user.bot) return;
    
    // User joined a voice channel
    if (!oldState.channel && newState.channel) {
        await tracker.startVoiceSession(
            userId,
            newState.channel.id,
            newState.guild.id,
            username,
            newState.channel.name,
            newState.guild.name
        );
    }
    // User left a voice channel
    else if (oldState.channel && !newState.channel) {
        await tracker.endVoiceSession(userId);
    }
    // User switched voice channels
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        await tracker.endVoiceSession(userId);
        await tracker.startVoiceSession(
            userId,
            newState.channel.id,
            newState.guild.id,
            username,
            newState.channel.name,
            newState.guild.name
        );
    }
});

// =============== MESSAGE TRACKING ===============
client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Track the message
    await tracker.trackMessage(
        message.author.id,
        message.guild.id,
        message.channel.id,
        message.id,
        message.content.length,
        message.attachments.size > 0,
        message.author.username,
        message.channel.name,
        message.guild.name
    );
    
    // Track command usage if it's a command
    if (message.content.startsWith('!') || message.content.startsWith('/')) {
        await tracker.trackCommand(
            message.author.id,
            message.guild.id,
            message.author.username
        );
    }
});

// =============== EXAMPLE COMMANDS ===============
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // Stats command
    if (message.content === '!stats') {
        const userStats = await tracker.getUserStats(message.author.id, message.guild.id);
        
        if (userStats) {
            const embed = {
                color: 0x0099ff,
                title: `📊 Stats for ${userStats.username}`,
                fields: [
                    { name: 'Messages Sent', value: userStats.totalMessages.toString(), inline: true },
                    { name: 'Voice Hours', value: userStats.totalVoiceHours, inline: true },
                    { name: 'Voice Joins', value: userStats.totalVoiceJoins.toString(), inline: true },
                    { name: 'Commands Used', value: userStats.totalCommands.toString(), inline: true },
                    { name: 'Time in VC', value: userStats.formattedVoiceTime, inline: true },
                    { name: 'Member Since', value: new Date(userStats.firstSeen).toLocaleDateString(), inline: true }
                ],
                timestamp: new Date()
            };
            
            message.reply({ embeds: [embed] });
        } else {
            message.reply('No stats found for you yet!');
        }
    }
    
    // Server stats command
    if (message.content === '!serverstats') {
        const guildStats = await tracker.getGuildStats(message.guild.id);
        
        if (guildStats) {
            const topUsers = guildStats.topUsersByVoiceTime
                .slice(0, 5)
                .map((u, i) => `${i + 1}. ${u.username}: ${u.hours}h`)
                .join('\n');
            
            const embed = {
                color: 0x00ff00,
                title: `📊 Server Statistics for ${message.guild.name}`,
                fields: [
                    { name: 'Total Messages', value: guildStats.totalMessages.toString(), inline: true },
                    { name: 'Total VC Joins', value: guildStats.totalVCJoins.toString(), inline: true },
                    { name: 'Unique Users', value: guildStats.uniqueUsers.toString(), inline: true },
                    { name: 'Total Voice Hours', value: guildStats.totalHours, inline: true },
                    { name: 'Average Voice Hours', value: guildStats.averageHours, inline: true },
                    { name: 'Top 5 Voice Users', value: topUsers || 'No data', inline: false }
                ],
                timestamp: new Date()
            };
            
            message.reply({ embeds: [embed] });
        }
    }
    
    // Leaderboard command
    if (message.content === '!leaderboard' || message.content === '!lb') {
        const topUsers = await tracker.getUserVoiceHours(message.guild.id, 10);
        
        if (topUsers.length > 0) {
            const leaderboard = topUsers
                .map((u, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    return `${medal} **${u.username}**: ${u.hours}h (${u.formatted})`;
                })
                .join('\n');
            
            const embed = {
                color: 0xffd700,
                title: '🏆 Voice Time Leaderboard',
                description: leaderboard,
                footer: {
                    text: `Total unique users: ${await tracker.getUniqueUsers(message.guild.id)}`
                },
                timestamp: new Date()
            };
            
            message.reply({ embeds: [embed] });
        } else {
            message.reply('No voice time data available yet!');
        }
    }
    
    // Analytics command (admin only)
    if (message.content === '!analytics' && message.member.permissions.has('Administrator')) {
        const [totalHours, avgData, totalMessages, totalJoins, uniqueUsers] = await Promise.all([
            tracker.getTotalHours(message.guild.id),
            tracker.getAverageHoursSpent(message.guild.id),
            tracker.getTotalMessages(message.guild.id),
            tracker.getTotalVCJoins(message.guild.id),
            tracker.getUniqueUsers(message.guild.id)
        ]);
        
        const embed = {
            color: 0x9b59b6,
            title: '📈 Server Analytics',
            fields: [
                { name: 'Unique Users', value: uniqueUsers.toString(), inline: true },
                { name: 'Total Messages', value: totalMessages.toString(), inline: true },
                { name: 'Total VC Joins', value: totalJoins.toString(), inline: true },
                { name: 'Total Voice Hours', value: totalHours, inline: true },
                { name: 'Average Hours/User', value: avgData.averageHours, inline: true },
                { name: 'Active Voice Users', value: avgData.userCount.toString(), inline: true }
            ],
            timestamp: new Date()
        };
        
        message.reply({ embeds: [embed] });
    }
});

// =============== CLEANUP ON SHUTDOWN ===============
process.on('SIGINT', async () => {
    console.log('Bot is shutting down...');
    
    // End all active voice sessions
    for (const [userId, session] of tracker.voiceSessions) {
        await tracker.endVoiceSession(userId);
    }
    
    // Disconnect from database
    await tracker.disconnect();
    
    // Destroy Discord client
    client.destroy();
    process.exit(0);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Export for use in other modules if needed
module.exports = { client, tracker };
