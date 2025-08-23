// patterns/digDeeperListener.js
// Event listener for handling "Dig Deeper" button interactions

const { ChannelType, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const gachaServersPath = path.join(__dirname, '../data/gachaServers.json');

class DigDeeperListener {
    constructor(client) {
        this.client = client;
        this.setupListener();
        
        // Track processing to prevent duplicates
        this.processingChannels = new Set();
    }
    
    setupListener() {
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            if (!interaction.customId.startsWith('dig_deeper_')) return;
            
            try {
                await this.handleDigDeeper(interaction);
            } catch (error) {
                console.error('[DIG_DEEPER] Error handling interaction:', error);
                
                try {
                    const errorMessage = '❌ An error occurred while trying to dig deeper. Please try again later.';
                    
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: errorMessage, ephemeral: true });
                    } else if (interaction.deferred) {
                        await interaction.editReply({ content: errorMessage });
                    }
                } catch (e) {
                    console.error('[DIG_DEEPER] Failed to send error message:', e);
                }
            }
        });
    }
    
    async handleDigDeeper(interaction) {
        // Parse the custom ID: dig_deeper_channelId_gachaServerId
        const parts = interaction.customId.split('_');
        if (parts.length < 4) {
            return interaction.reply({ 
                content: '❌ Invalid button data.', 
                ephemeral: true 
            });
        }
        
        const channelId = parts[2];
        const currentMineId = parts[3];
        
        // Check if user is in the voice channel
        const member = interaction.member;
        if (!member.voice.channel || member.voice.channel.id !== channelId) {
            return interaction.reply({ 
                content: '❌ You must be in the voice channel to dig deeper!', 
                ephemeral: true 
            });
        }
        
        // Prevent duplicate processing
        if (this.processingChannels.has(channelId)) {
            return interaction.reply({ 
                content: '⏳ Already processing deeper mine creation. Please wait...', 
                ephemeral: true 
            });
        }
        
        this.processingChannels.add(channelId);
        
        // Defer the reply
        await interaction.deferReply();
        
        try {
            // Load gacha servers data
            const gachaServers = require(gachaServersPath);
            
            // Find the current mine configuration
            const currentMine = gachaServers.find(s => s.id == currentMineId);
            if (!currentMine || !currentMine.deeperMineId) {
                this.processingChannels.delete(channelId);
                return interaction.editReply({ 
                    content: '❌ This mine does not have a deeper level configured.' 
                });
            }
            
            // Find the deeper mine configuration
            const deeperMine = gachaServers.find(s => s.id == currentMine.deeperMineId);
            if (!deeperMine) {
                this.processingChannels.delete(channelId);
                return interaction.editReply({ 
                    content: '❌ Deeper mine configuration not found.' 
                });
            }
            
            // Get the current channel and its database entry
            const currentChannel = interaction.guild.channels.cache.get(channelId);
            if (!currentChannel) {
                this.processingChannels.delete(channelId);
                return interaction.editReply({ 
                    content: '❌ Current voice channel not found.' 
                });
            }
            
            // Get the database entry
            const dbEntry = await ActiveVCS.findOne({ channelId: channelId });
            if (!dbEntry) {
                this.processingChannels.delete(channelId);
                return interaction.editReply({ 
                    content: '❌ Channel database entry not found.' 
                });
            }
            
            // Double-check conditions are still met
            const deeperMineChecker = require('./mining/deeperMineChecker');
            const conditionsMet = deeperMineChecker.checkConditions(dbEntry, currentMine);
            
            if (!conditionsMet) {
                this.processingChannels.delete(channelId);
                return interaction.editReply({ 
                    content: '❌ You no longer meet the conditions to dig deeper.' 
                });
            }
            
            let newChannel;
            let isNewChannel = false;
            
            // Check if a deeper mine channel already exists for this channel
            if (dbEntry.gameData.deeperMineChannelId) {
                // Try to get the existing deeper mine channel
                newChannel = interaction.guild.channels.cache.get(dbEntry.gameData.deeperMineChannelId);
                
                // If the channel doesn't exist (was deleted), create a new one
                if (!newChannel) {
                    console.log(`[DIG_DEEPER] Deeper mine channel ${dbEntry.gameData.deeperMineChannelId} not found, creating new one`);
                    dbEntry.gameData.deeperMineChannelId = null;
                    isNewChannel = true;
                }
            } else {
                isNewChannel = true;
            }
            
            // Create new channel if needed
            if (isNewChannel) {
                // Create the new deeper mine voice channel
                const parentCategory = currentChannel.parent;
                newChannel = await interaction.guild.channels.create({
                    name: deeperMine.name,
                    type: ChannelType.GuildVoice,
                    parent: parentCategory,
                    userLimit: currentChannel.userLimit,
                    bitrate: currentChannel.bitrate
                });
                
                // Create new database entry for the deeper mine
                const newEntry = new ActiveVCS({
                    channelId: newChannel.id,
                    guildId: interaction.guild.id,
                    typeId: parseInt(deeperMine.id),
                    nextTrigger: new Date(Date.now() + 1000 * 30),
                    nextShopRefresh: dbEntry.nextShopRefresh, // Keep the same shop refresh time
                    nextLongBreak: dbEntry.nextLongBreak, // Keep the same long break time
                    gameData: {
                        ...dbEntry.gameData,
                        miningMode: true,
                        powerLevel: deeperMine.power,
                        parentChannelId: channelId,
                        isDeeperMine: true,
                        // Reset some stats for the new level
                        map: undefined, // Will be regenerated
                        minecart: dbEntry.gameData.minecart || { items: {}, contributors: {} }, // Keep minecart
                        miningStats: {
                            ...dbEntry.gameData.miningStats,
                            deeperLevelReached: true,
                            deeperLevelTime: Date.now()
                        }
                    }
                });
                
                await newEntry.save();
                
                // Update the current channel's gameData to store the deeper mine channel ID
                dbEntry.gameData.deeperMineChannelId = newChannel.id;
                await dbEntry.save();
                
                console.log(`[DIG_DEEPER] Created new deeper mine channel ${newChannel.id} for channel ${channelId}`);
            }
            
            // Move only the button clicker to the new channel
            try {
                await member.voice.setChannel(newChannel);
                console.log(`[DIG_DEEPER] Moved member ${member.id} to deeper mine ${newChannel.id}`);
            } catch (err) {
                console.error(`[DIG_DEEPER] Failed to move member ${member.id}:`, err);
                this.processingChannels.delete(channelId);
                return interaction.editReply({ 
                    content: '❌ Failed to move you to the deeper mine. Please try again.' 
                });
            }
            
            // Build the success embed
            const successEmbed = new EmbedBuilder()
                .setTitle(`⛏️ Descended to ${deeperMine.name}!`)
                .setDescription(`**${member.displayName}** has descended to the deeper level!\n\n${deeperMine.description}`)
                .setColor(parseInt(deeperMine.colour, 16) || 0x00FF00)
                .addFields(
                    { 
                        name: '📊 Mine Stats', 
                        value: `Power Level: **${deeperMine.power}**\nRarity: **${deeperMine.rarity}**`, 
                        inline: true 
                    },
                    { 
                        name: '⚠️ Danger Level', 
                        value: `Hazard Chance: **${Math.round(deeperMine.hazardConfig.spawnChance * 100)}%**`, 
                        inline: true 
                    }
                )
                .setFooter({ text: isNewChannel ? 'New deeper mine created!' : 'Moved to existing deeper mine!' })
                .setTimestamp();
            
            // Send success message to the interaction
            await interaction.editReply({ 
                content: `✅ Successfully moved to deeper mine!`,
                embeds: [successEmbed]
            });
            
            // Only send welcome message and generate shop if this is a new channel
            if (isNewChannel) {
                // Send welcome message in the new channel with image
                let imagePath = path.join(__dirname, '../assets/gachaLocations', deeperMine.image + '.png');
                let imageFileName = deeperMine.image + '.png';
                
                // Check if image exists, fallback to parent mine image or placeholder
                if (!fs.existsSync(imagePath)) {
                    // Try parent mine image with "Deep" suffix
                    const parentImageName = currentMine.image + 'Deep';
                    imagePath = path.join(__dirname, '../assets/gachaLocations', parentImageName + '.png');
                    imageFileName = parentImageName + '.png';
                    
                    if (!fs.existsSync(imagePath)) {
                        // Fallback to original mine image
                        imagePath = path.join(__dirname, '../assets/gachaLocations', currentMine.image + '.png');
                        imageFileName = currentMine.image + '.png';
                        
                        if (!fs.existsSync(imagePath)) {
                            // Final fallback to placeholder
                            imagePath = path.join(__dirname, '../assets/gachaLocations', 'placeHolder.png');
                            imageFileName = 'placeHolder.png';
                        }
                    }
                }
                
                const imageAttachment = new AttachmentBuilder(imagePath, { name: imageFileName });
                
                const welcomeEmbed = new EmbedBuilder()
                    .setTitle(`Welcome to ${deeperMine.name}`)
                    .setDescription(`\`\`\`${deeperMine.description}\`\`\``)
                    .setColor(parseInt(deeperMine.colour, 16) || 0x00FF00)
                    .setImage(`attachment://${imageFileName}`)
                    .addFields(
                        { 
                            name: '⚡ Enhanced Resources', 
                            value: 'This deeper level contains rarer ores and higher yield per block!', 
                            inline: false 
                        },
                        { 
                            name: '💎 Power Level', 
                            value: `This mine operates at Power Level **${deeperMine.power}**`, 
                            inline: true 
                        },
                        { 
                            name: '⚠️ Danger', 
                            value: `Hazard spawn rate: **${Math.round(deeperMine.hazardConfig.spawnChance * 100)}%**`, 
                            inline: true 
                        }
                    )
                    .setFooter({ text: `Deeper mine accessed by ${member.displayName}` })
                    .setTimestamp();
                
                await newChannel.send({ 
                    content: `🎉 **Congratulations!** You've reached the deeper level of the ${currentMine.name.replace('⛏️ ', '')}!`,
                    embeds: [welcomeEmbed], 
                    files: [imageAttachment] 
                });
                
                // Generate initial shop for the new channel
                const generateShop = require('./generateShop');
                await generateShop(newChannel, 1); // Full shop generation
                
                console.log(`[DIG_DEEPER] Successfully created deeper mine ${deeperMine.name} for channel ${newChannel.id}`);
            } else {
                // Send a simple notification that user has moved to the existing deeper mine
                await newChannel.send({ 
                    content: `⛏️ **${member.displayName}** has descended to the deeper mine!` 
                });
                
                console.log(`[DIG_DEEPER] Moved member ${member.id} to existing deeper mine ${newChannel.id}`);
            }
            
        } catch (error) {
            console.error('[DIG_DEEPER] Error creating deeper mine:', error);
            await interaction.editReply({ 
                content: '❌ Failed to create deeper mine. Please try again or contact an administrator.' 
            });
        } finally {
            this.processingChannels.delete(channelId);
        }
    }
}

module.exports = DigDeeperListener;