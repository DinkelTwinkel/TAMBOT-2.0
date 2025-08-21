// Debug command to force minecart selling and see what goes wrong
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const gachaVC = require('../models/activevcs');
const Currency = require('../models/currency');
const { miningItemPool, treasureItems } = require('../patterns/gachaModes/mining/miningConstants_unified');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug_minecart_sell')
        .setDescription('DEBUG: Force sell the minecart and show debug info'),
    
    async execute(interaction) {
        // Check if user is admin/developer
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'This is a debug command for administrators only.', ephemeral: true });
        }
        
        await interaction.deferReply();
        
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
            
            // Create debug embed
            const debugEmbed = new EmbedBuilder()
                .setTitle('🔧 Minecart Debug Information')
                .setColor(0xFF0000)
                .setTimestamp();
            
            // Show minecart contents
            if (!minecart || !minecart.items || Object.keys(minecart.items).length === 0) {
                debugEmbed.addFields({
                    name: '❌ Minecart Status',
                    value: 'Minecart is EMPTY - no items to sell!',
                    inline: false
                });
            } else {
                const itemList = [];
                for (const [itemId, itemData] of Object.entries(minecart.items)) {
                    if (itemData.quantity > 0) {
                        itemList.push(`• Item ID: **${itemId}** | Quantity: **${itemData.quantity}**`);
                    }
                }
                
                debugEmbed.addFields({
                    name: '📦 Minecart Contents',
                    value: itemList.length > 0 ? itemList.join('\n') : 'No items with quantity > 0',
                    inline: false
                });
            }
            
            // Show pool status
            debugEmbed.addFields(
                {
                    name: '🎯 Item Pool Status',
                    value: `Mining Pool: **${miningItemPool.length}** items loaded\nTreasure Pool: **${treasureItems.length}** items loaded`,
                    inline: true
                },
                {
                    name: '📊 Session Statistics',
                    value: `Ore Found: ${sessionStats.totalOreFound}\nWalls Broken: ${sessionStats.wallsBroken}\nTreasures Found: ${sessionStats.treasuresFound}`,
                    inline: true
                }
            );
            
            // Try to calculate value
            if (minecart && minecart.items && Object.keys(minecart.items).length > 0) {
                let totalValue = 0;
                let totalItems = 0;
                const matchResults = [];
                const notFoundItems = [];
                
                for (const [itemId, itemData] of Object.entries(minecart.items)) {
                    if (itemData.quantity <= 0) continue;
                    
                    // Try to find in mining pool
                    let poolItem = miningItemPool.find(item => item.itemId === itemId);
                    
                    // If not found, try treasure pool
                    if (!poolItem) {
                        poolItem = treasureItems.find(item => item.itemId === itemId);
                    }
                    
                    if (poolItem) {
                        const itemValue = poolItem.value * itemData.quantity;
                        totalValue += itemValue;
                        totalItems += itemData.quantity;
                        matchResults.push(`✅ **${poolItem.name}** (ID: ${itemId}) x${itemData.quantity} = ${itemValue} coins`);
                    } else {
                        notFoundItems.push(`❌ **Unknown Item** (ID: ${itemId}) x${itemData.quantity} - NOT IN POOLS!`);
                    }
                }
                
                // Add match results
                if (matchResults.length > 0) {
                    debugEmbed.addFields({
                        name: '✅ Items Found in Pools',
                        value: matchResults.slice(0, 10).join('\n') + (matchResults.length > 10 ? `\n...and ${matchResults.length - 10} more` : ''),
                        inline: false
                    });
                }
                
                // Add not found items
                if (notFoundItems.length > 0) {
                    debugEmbed.addFields({
                        name: '❌ Items NOT Found in Pools',
                        value: notFoundItems.slice(0, 10).join('\n') + (notFoundItems.length > 10 ? `\n...and ${notFoundItems.length - 10} more` : ''),
                        inline: false
                    });
                }
                
                // Add total value
                debugEmbed.addFields({
                    name: '💰 Total Value',
                    value: `**${totalValue}** coins from **${totalItems}** items`,
                    inline: false
                });
                
                // Show contributor rewards
                const contributorRewards = {};
                for (const [itemId, itemData] of Object.entries(minecart.items)) {
                    const poolItem = miningItemPool.find(item => item.itemId === itemId) || 
                                    treasureItems.find(item => item.itemId === itemId);
                    
                    if (!poolItem || itemData.quantity <= 0) continue;
                    
                    const itemTotalValue = poolItem.value * itemData.quantity;
                    
                    // Calculate contributor rewards
                    if (itemData.contributors) {
                        for (const [playerId, contributed] of Object.entries(itemData.contributors)) {
                            if (!contributorRewards[playerId]) {
                                contributorRewards[playerId] = { coins: 0, items: 0 };
                            }
                            
                            const contributorShare = Math.floor((contributed / itemData.quantity) * itemTotalValue);
                            contributorRewards[playerId].coins += contributorShare;
                            contributorRewards[playerId].items += contributed;
                        }
                    }
                }
                
                if (Object.keys(contributorRewards).length > 0) {
                    const rewardLines = [];
                    for (const [playerId, reward] of Object.entries(contributorRewards)) {
                        try {
                            const member = await interaction.guild.members.fetch(playerId);
                            rewardLines.push(`• ${member.displayName}: ${reward.items} items → **${reward.coins}** coins`);
                        } catch {
                            rewardLines.push(`• Unknown Player (${playerId}): ${reward.items} items → **${reward.coins}** coins`);
                        }
                    }
                    
                    debugEmbed.addFields({
                        name: '👥 Contributor Rewards (if sold)',
                        value: rewardLines.slice(0, 10).join('\n'),
                        inline: false
                    });
                }
            }
            
            await interaction.editReply({ embeds: [debugEmbed] });
            
            // Ask if they want to actually execute the sale
            const confirmEmbed = new EmbedBuilder()
                .setTitle('🛒 Execute Minecart Sale?')
                .setDescription('Do you want to actually sell the minecart and distribute coins?\n\n**Reply with "yes" to confirm or "no" to cancel.**')
                .setColor(0xFFFF00);
            
            await interaction.followUp({ embeds: [confirmEmbed] });
            
            // Wait for confirmation
            const filter = m => m.author.id === interaction.user.id && ['yes', 'no'].includes(m.content.toLowerCase());
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] })
                .catch(() => null);
            
            if (collected && collected.first()?.content.toLowerCase() === 'yes') {
                // Import and run the actual summary function
                const { createMiningSummary } = require('../patterns/gachaModes/mining/miningDatabase');
                
                try {
                    await createMiningSummary(voiceChannel, dbEntry);
                    await interaction.followUp('✅ Minecart has been sold and coins distributed!');
                } catch (error) {
                    await interaction.followUp(`❌ Error during sale: ${error.message}\n\`\`\`${error.stack}\`\`\``);
                }
            } else {
                await interaction.followUp('❌ Sale cancelled. Minecart was not sold.');
            }
            
        } catch (error) {
            console.error('[DEBUG MINECART] Error:', error);
            await interaction.editReply(`Error: ${error.message}`);
        }
    },
};
