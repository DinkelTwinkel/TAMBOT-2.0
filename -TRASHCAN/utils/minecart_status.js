// Debug command to check minecart status
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const gachaVC = require('../models/activevcs');
const { miningItemPool, treasureItems } = require('../patterns/gachaModes/mining/miningConstants_unified');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('minecart_status')
        .setDescription('Check the current minecart contents and value'),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get the voice channel the user is in
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.editReply('You must be in a voice channel to use this command.');
            }
            
            // Get the database entry
            const dbEntry = await gachaVC.findOne({ channelId: voiceChannel.id });
            if (!dbEntry) {
                return interaction.editReply('No mining session found in this voice channel.');
            }
            
            const gameData = dbEntry.gameData;
            if (!gameData || gameData.gamemode !== 'mining') {
                return interaction.editReply('This channel is not in mining mode.');
            }
            
            const minecart = gameData.minecart;
            const sessionStats = gameData.stats || { totalOreFound: 0, wallsBroken: 0, treasuresFound: 0 };
            
            // Create status embed
            const statusEmbed = new EmbedBuilder()
                .setTitle('🛒 Minecart Status')
                .setColor(0x8B4513)
                .setTimestamp();
            
            // Check if minecart is empty
            if (!minecart || !minecart.items || Object.keys(minecart.items).length === 0) {
                statusEmbed.setDescription('The minecart is currently empty!');
                statusEmbed.addFields({
                    name: '📊 Session Statistics',
                    value: `Walls Broken: ${sessionStats.wallsBroken}\nTreasures Found: ${sessionStats.treasuresFound}`,
                    inline: false
                });
                return interaction.editReply({ embeds: [statusEmbed] });
            }
            
            // Calculate contents and value
            let totalValue = 0;
            let totalItems = 0;
            const itemBreakdown = [];
            const unknownItems = [];
            
            for (const [itemId, itemData] of Object.entries(minecart.items)) {
                if (itemData.quantity <= 0) continue;
                
                const poolItem = miningItemPool.find(item => item.itemId === itemId) || 
                                treasureItems.find(item => item.itemId === itemId);
                
                if (poolItem) {
                    const itemValue = poolItem.value * itemData.quantity;
                    totalValue += itemValue;
                    totalItems += itemData.quantity;
                    itemBreakdown.push(`${poolItem.name} x${itemData.quantity} = ${itemValue} coins`);
                } else {
                    unknownItems.push(`Unknown (ID: ${itemId}) x${itemData.quantity}`);
                }
            }
            
            // Build description
            let description = `**Total Value:** ${totalValue} coins\n**Total Items:** ${totalItems}\n\n`;
            
            if (itemBreakdown.length > 0) {
                description += '**Contents:**\n';
                description += itemBreakdown.slice(0, 15).map(item => `• ${item}`).join('\n');
                if (itemBreakdown.length > 15) {
                    description += `\n...and ${itemBreakdown.length - 15} more items`;
                }
            }
            
            if (unknownItems.length > 0) {
                description += '\n\n**⚠️ Unknown Items (won\'t sell):**\n';
                description += unknownItems.map(item => `• ${item}`).join('\n');
            }
            
            statusEmbed.setDescription(description);
            
            // Add contributor info
            if (minecart.contributors && Object.keys(minecart.contributors).length > 0) {
                const contributorLines = [];
                for (const [playerId, itemCount] of Object.entries(minecart.contributors)) {
                    try {
                        const member = await interaction.guild.members.fetch(playerId);
                        contributorLines.push(`${member.displayName}: ${itemCount} items`);
                    } catch {
                        contributorLines.push(`Unknown: ${itemCount} items`);
                    }
                }
                
                statusEmbed.addFields({
                    name: '👥 Contributors',
                    value: contributorLines.slice(0, 10).join('\n'),
                    inline: true
                });
            }
            
            // Add session stats
            statusEmbed.addFields({
                name: '📊 Session Statistics',
                value: `Walls Broken: ${sessionStats.wallsBroken}\nTreasures Found: ${sessionStats.treasuresFound}\nOre Found: ${sessionStats.totalOreFound || totalItems}`,
                inline: true
            });
            
            await interaction.editReply({ embeds: [statusEmbed] });
            
        } catch (error) {
            console.error('[MINECART STATUS] Error:', error);
            await interaction.editReply(`Error checking minecart: ${error.message}`);
        }
    },
};
