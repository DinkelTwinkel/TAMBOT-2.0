// ═══════════════════════════════════════════════════════════════
// QUICK START GUIDE - Add to your existing index.js
// ═══════════════════════════════════════════════════════════════

// Step 1: Add these imports at the top of your index.js
const { 
    initializeStatTracking, 
    setupVoiceTracking, 
    setupMessageTracking, 
    getQuickStats,
    getUserStats,
    getAllUserVoiceHours,
    cleanupTracking 
} = require('./trackingIntegration');

// Step 2: In your 'ready' event, AFTER MongoDB is connected:
/*
client.once('ready', async () => {
    console.log('Bot is ready!');
    
    // Your existing MongoDB connection is already done...
    // Now initialize stat tracking:
    await initializeStatTracking(client);
    setupVoiceTracking(client);
    setupMessageTracking(client);
});
*/

// Step 3: That's it! Tracking is now active. Access data anytime:

// ═══════════════════════════════════════════════════════════════
// GETTING YOUR REQUESTED DATA
// ═══════════════════════════════════════════════════════════════

const { tracker } = require('./trackingIntegration');

async function getYourRequestedData(guildId) {
    // 1. Total VC joins
    const totalVCJoins = await tracker.getTotalVCJoins(guildId);
    console.log(`Total VC Joins: ${totalVCJoins}`);
    
    // 2. Hours spent average of all users
    const avgData = await tracker.getAverageHoursSpent(guildId);
    console.log(`Average Hours per User: ${avgData.averageHours}h`);
    console.log(`Total Hours (all users): ${avgData.totalHours}h`);
    console.log(`Users with voice time: ${avgData.userCount}`);
    
    // 3. Unique users
    const uniqueUsers = await tracker.getUniqueUsers(guildId);
    console.log(`Unique Users: ${uniqueUsers}`);
    
    // 4. Total hours of all users
    const totalHours = await tracker.getTotalHours(guildId);
    console.log(`Total Hours: ${totalHours}h`);
    
    // 5. Messages sent
    const totalMessages = await tracker.getTotalMessages(guildId);
    console.log(`Total Messages: ${totalMessages}`);
    
    // 6. Each user's hours spent in VC
    const userHours = await tracker.getUserVoiceHours(guildId);
    console.log('\nTop Voice Users:');
    userHours.slice(0, 10).forEach((user, i) => {
        console.log(`${i+1}. ${user.username}: ${user.hours}h (${user.formatted})`);
    });
    
    return {
        totalVCJoins,
        averageHoursPerUser: avgData.averageHours,
        uniqueUsers,
        totalHours,
        totalMessages,
        userVoiceHours: userHours
    };
}

// ═══════════════════════════════════════════════════════════════
// EXAMPLE COMMANDS (Add to your message handler)
// ═══════════════════════════════════════════════════════════════

async function handleStatsCommands(message) {
    const guildId = message.guild.id;
    
    // Command: !data - Shows all the data you requested
    if (message.content === '!data') {
        const data = await getYourRequestedData(guildId);
        
        const embed = {
            color: 0x0099ff,
            title: '📊 Complete Server Data',
            fields: [
                { name: 'Total VC Joins', value: data.totalVCJoins.toString(), inline: true },
                { name: 'Unique Users', value: data.uniqueUsers.toString(), inline: true },
                { name: 'Total Messages', value: data.totalMessages.toLocaleString(), inline: true },
                { name: 'Total Voice Hours', value: `${data.totalHours}h`, inline: true },
                { name: 'Avg Hours/User', value: `${data.averageHoursPerUser}h`, inline: true },
                { name: 'Top Voice User', value: data.userVoiceHours[0] ? `${data.userVoiceHours[0].username}: ${data.userVoiceHours[0].hours}h` : 'None', inline: true }
            ],
            timestamp: new Date()
        };
        
        message.reply({ embeds: [embed] });
    }
    
    // Command: !vcleaderboard - Shows each user's hours in VC
    if (message.content === '!vcleaderboard') {
        const userHours = await tracker.getUserVoiceHours(guildId);
        
        if (userHours.length === 0) {
            return message.reply('No voice data recorded yet!');
        }
        
        let leaderboard = '🎤 **Voice Time Leaderboard**\n\n';
        userHours.slice(0, 15).forEach((user, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i+1}.**`;
            leaderboard += `${medal} ${user.username}: ${user.hours}h (${user.formatted})\n`;
        });
        
        message.reply(leaderboard);
    }
    
    // Command: !mystats - Shows individual user stats
    if (message.content === '!mystats') {
        const stats = await tracker.getUserStats(message.author.id, guildId);
        
        if (!stats) {
            return message.reply('No stats recorded for you yet!');
        }
        
        const embed = {
            color: 0x00ff00,
            title: `📊 Stats for ${stats.username}`,
            fields: [
                { name: 'Messages Sent', value: stats.totalMessages.toString(), inline: true },
                { name: 'Voice Time', value: stats.formattedVoiceTime, inline: true },
                { name: 'Voice Hours', value: `${stats.totalVoiceHours}h`, inline: true },
                { name: 'VC Joins', value: stats.totalVoiceJoins.toString(), inline: true },
                { name: 'Commands Used', value: stats.totalCommands.toString(), inline: true },
                { name: 'Member Since', value: new Date(stats.firstSeen).toLocaleDateString(), inline: true }
            ],
            timestamp: new Date()
        };
        
        message.reply({ embeds: [embed] });
    }
}

// ═══════════════════════════════════════════════════════════════
// PROGRAMMATIC ACCESS EXAMPLES
// ═══════════════════════════════════════════════════════════════

// Use anywhere in your code after initialization:

// Example 1: Get top 5 users by voice time
async function getTop5VoiceUsers(guildId) {
    const users = await tracker.getUserVoiceHours(guildId, 5);
    return users;
}

// Example 2: Check if user is active today
async function getUserActivityToday(userId, guildId) {
    const today = new Date().toISOString().split('T')[0];
    const stats = await tracker.getDateRangeStats(guildId, today, today);
    return stats;
}

// Example 3: Get server health metrics
async function getServerHealth(guildId) {
    const stats = await tracker.getGuildStats(guildId);
    return {
        isActive: stats.uniqueUsers > 10,
        engagement: stats.totalMessages / stats.uniqueUsers,
        voiceActivity: stats.totalHours,
        topUsers: stats.topUsersByVoiceTime
    };
}

// Example 4: Export for analysis
async function exportForAnalysis(guildId) {
    const allData = await tracker.exportStats(guildId);
    // You can save this to a file or send to another service
    return allData;
}

module.exports = {
    getYourRequestedData,
    handleStatsCommands,
    getTop5VoiceUsers,
    getUserActivityToday,
    getServerHealth,
    exportForAnalysis
};

// ═══════════════════════════════════════════════════════════════
// MINIMAL INTEGRATION (Copy this to your index.js)
// ═══════════════════════════════════════════════════════════════
/*

// 1. Import at the top
const { 
    initializeStatTracking, 
    setupVoiceTracking, 
    setupMessageTracking,
    tracker 
} = require('./trackingIntegration');

// 2. In ready event (after MongoDB connected)
await initializeStatTracking(client);
setupVoiceTracking(client);
setupMessageTracking(client);

// 3. Access data anywhere
const totalJoins = await tracker.getTotalVCJoins(guildId);
const userHours = await tracker.getUserVoiceHours(guildId);
// etc...

*/
