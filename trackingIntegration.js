// Simple integration code to add to your existing index.js
// This version uses your existing MongoDB connection

const StatTracker = require('./patterns/statTracking');

// Initialize tracker (no connection needed since you already have one)
const tracker = new StatTracker();

// Call this AFTER your MongoDB is connected in index.js
async function initializeStatTracking(client) {
    // Initialize with existing connection
    await tracker.initialize();
    
    // Recover any users already in voice channels after restart
    client.guilds.cache.forEach(guild => {
        guild.channels.cache.forEach(channel => {
            if (channel.type === 2) { // Voice channel
                channel.members.forEach(member => {
                    if (!member.user.bot && !tracker.voiceSessions.has(member.user.id)) {
                        tracker.startVoiceSession(
                            member.user.id,
                            channel.id,
                            guild.id,
                            member.user.username,
                            channel.name,
                            guild.name
                        );
                    }
                });
            }
        });
    });
    
    console.log('✅ Stat tracking system initialized');
}

// Voice tracking event handler
function setupVoiceTracking(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (newState.member.user.bot) return;
        
        const userId = newState.member.user.id;
        const username = newState.member.user.username;
        
        // User joined VC
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
        // User left VC
        else if (oldState.channel && !newState.channel) {
            await tracker.endVoiceSession(userId);
        }
        // User switched channels
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
}

// Message tracking event handler
function setupMessageTracking(client) {
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;
        
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
        
        // Track commands (adjust prefixes as needed for your bot)
        if (message.content.startsWith('!') || message.content.startsWith('/')) {
            await tracker.trackCommand(
                message.author.id,
                message.guild.id,
                message.author.username
            );
        }
    });
}

// Quick access functions for getting stats
async function getQuickStats(guildId) {
    const [totalJoins, avgHours, unique, totalHours, messages, userHours] = await Promise.all([
        tracker.getTotalVCJoins(guildId),
        tracker.getAverageHoursSpent(guildId),
        tracker.getUniqueUsers(guildId),
        tracker.getTotalHours(guildId),
        tracker.getTotalMessages(guildId),
        tracker.getUserVoiceHours(guildId, 10)
    ]);
    
    return {
        totalVCJoins: totalJoins,
        averageHours: avgHours.averageHours,
        uniqueUsers: unique,
        totalHours: totalHours,
        totalMessages: messages,
        topUsers: userHours
    };
}

// Get individual user stats
async function getUserStats(userId, guildId) {
    return await tracker.getUserStats(userId, guildId);
}

// Get voice hours for all users
async function getAllUserVoiceHours(guildId) {
    return await tracker.getUserVoiceHours(guildId);
}

// Cleanup function for bot shutdown
async function cleanupTracking() {
    // End all active sessions
    for (const [userId] of tracker.voiceSessions) {
        await tracker.endVoiceSession(userId);
    }
    console.log('📊 Stat tracking cleanup complete');
}

// Export everything
module.exports = {
    tracker,
    initializeStatTracking,
    setupVoiceTracking,
    setupMessageTracking,
    getQuickStats,
    getUserStats,
    getAllUserVoiceHours,
    cleanupTracking
};

/* 
═══════════════════════════════════════════════════════════════
ADD TO YOUR INDEX.JS:
═══════════════════════════════════════════════════════════════

// At the top, after your other imports
const { 
    initializeStatTracking, 
    setupVoiceTracking, 
    setupMessageTracking, 
    getQuickStats,
    getUserStats,
    getAllUserVoiceHours,
    cleanupTracking 
} = require('./trackingIntegration');

// In your ready event, AFTER MongoDB is connected
client.once('ready', async () => {
    console.log('Bot is ready!');
    
    // Your existing MongoDB connection code...
    // await mongoose.connect(...)
    
    // Then initialize stat tracking
    await initializeStatTracking(client);
    setupVoiceTracking(client);
    setupMessageTracking(client);
});

// Example: Add a command to get stats
client.on('messageCreate', async (message) => {
    if (message.content === '!stats') {
        const stats = await getQuickStats(message.guild.id);
        
        let response = '📊 **Server Stats**\n\n';
        response += `Total VC Joins: ${stats.totalVCJoins}\n`;
        response += `Total Hours in VC: ${stats.totalHours}h\n`;
        response += `Average Hours/User: ${stats.averageHours}h\n`;
        response += `Unique Users: ${stats.uniqueUsers}\n`;
        response += `Total Messages: ${stats.totalMessages}\n\n`;
        response += '**Top Voice Users:**\n';
        stats.topUsers.slice(0, 5).forEach((user, i) => {
            response += `${i+1}. ${user.username}: ${user.hours}h\n`;
        });
        
        message.reply(response);
    }
    
    if (message.content === '!mystats') {
        const stats = await getUserStats(message.author.id, message.guild.id);
        if (stats) {
            message.reply(`Your stats:\n• Messages: ${stats.totalMessages}\n• Voice Time: ${stats.formattedVoiceTime}\n• Voice Joins: ${stats.totalVoiceJoins}`);
        }
    }
    
    if (message.content === '!voiceleaderboard') {
        const users = await getAllUserVoiceHours(message.guild.id);
        let response = '🎤 **Voice Leaderboard**\n\n';
        users.slice(0, 10).forEach((user, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            response += `${medal} ${user.username}: ${user.hours}h\n`;
        });
        message.reply(response);
    }
});

// On shutdown
process.on('SIGINT', async () => {
    await cleanupTracking();
    // Your existing cleanup...
    client.destroy();
    process.exit(0);
});

═══════════════════════════════════════════════════════════════
ACCESSING YOUR REQUESTED DATA PROGRAMMATICALLY:
═══════════════════════════════════════════════════════════════

// Anywhere in your code after initialization:
const { tracker } = require('./trackingIntegration');

// Get the specific data you requested:
async function getRequestedData(guildId) {
    // 1. Total VC joins
    const totalJoins = await tracker.getTotalVCJoins(guildId);
    
    // 2. Hours spent average of all users
    const avgData = await tracker.getAverageHoursSpent(guildId);
    // avgData.averageHours = average hours per user
    // avgData.totalHours = total hours combined
    // avgData.userCount = number of users with voice time
    
    // 3. Unique users
    const uniqueUsers = await tracker.getUniqueUsers(guildId);
    
    // 4. Total hours of all users
    const totalHours = await tracker.getTotalHours(guildId);
    
    // 5. Messages sent
    const totalMessages = await tracker.getTotalMessages(guildId);
    
    // 6. Each user's hours spent in VC
    const userHours = await tracker.getUserVoiceHours(guildId);
    // Returns array: [{ userId, username, hours, days, formatted }, ...]
    
    return {
        totalJoins,
        avgData,
        uniqueUsers,
        totalHours,
        totalMessages,
        userHours
    };
}

*/
