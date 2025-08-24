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
                
                // Create new database entry for the deeper mine (fresh entry like gachaMachine.js)
                const newEntry = new ActiveVCS({
                    channelId: newChannel.id,
                    guildId: interaction.guild.id,
                    typeId: parseInt(deeperMine.id),
                    nextTrigger: new Date(Date.now() + 1000 * 30),
                    nextShopRefresh: new Date(Date.now() + 1000 * 60 * 25), // Fresh shop refresh time
                    nextLongBreak: new Date(Date.now() + 60 * 1000 * 100), // Fresh long break time
                    gameData: {
                        miningMode: true,
                        powerLevel: deeperMine.power,
                        parentChannelId: channelId,
                        isDeeperMine: true,
                        deeperLevel: dbEntry.gameData.isDeeperMine ? 3 : 2, // Track if this is level 2 or 3
                        // Initialize fresh mining data for the deeper level
                        map: undefined, // Will be regenerated
                        minecart: { items: {}, contributors: {} }, // Fresh minecart
                        miningStats: {
                            wallsBroken: 0,
                            oresFound: 0,
                            treasuresFound: 0,
                            fossilsFound: 0,
                            rareOresFound: 0,
                            totalValue: 0,
                            deeperLevelReached: true,
                            deeperLevelTime: Date.now(),
                            parentChannelStats: {
                                // Store parent channel stats for reference
                                wallsBroken: dbEntry.gameData.miningStats?.wallsBroken || 0,
                                oresFound: dbEntry.gameData.miningStats?.oresFound || 0,
                                treasuresFound: dbEntry.gameData.miningStats?.treasuresFound || 0
                            }
                        },
                        // Don't copy any player-specific data, start fresh
                        players: {},
                        speedActions: new Map(),
                        speedCooldowns: new Map()
                    }
                });
                
                await newEntry.save();
                
                // Store the deeper mine channel ID in parent's gameData for reuse
                // This allows multiple players to use the same deeper mine channel
                // instead of creating duplicate channels for the same deeper level
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
                // Determine the deeper level for better image selection
                const deeperLevel = dbEntry.gameData.isDeeperMine ? 3 : 2;
                
                // Send welcome message in the new channel with image
                let imagePath = path.join(__dirname, '../assets/game/tiles', deeperMine.image + '.png');
                let imageFileName = deeperMine.image + '.png';
                
                console.log(`[DIG_DEEPER] Looking for image: ${imagePath}`);
                
                // Check if image exists, fallback to parent mine image or placeholder
                if (!fs.existsSync(imagePath)) {
                    console.log(`[DIG_DEEPER] Image not found: ${deeperMine.image}.png`);
                    
                    // For level 3, try "Ultra" suffix first, then "Deep"
                    if (deeperLevel === 3) {
                        const ultraImageName = currentMine.image.replace('Deep', '') + 'Ultra';
                        imagePath = path.join(__dirname, '../assets/game/tiles', ultraImageName + '.png');
                        imageFileName = ultraImageName + '.png';
                        console.log(`[DIG_DEEPER] Trying level 3 ultra image: ${ultraImageName}.png`);
                        
                        if (!fs.existsSync(imagePath)) {
                            // Try base mine name + Ultra
                            const baseMineName = currentMine.image.replace('MineDeep', 'Mine').replace('Deep', '');
                            const ultraBaseName = baseMineName + 'Ultra';
                            imagePath = path.join(__dirname, '../assets/game/tiles', ultraBaseName + '.png');
                            imageFileName = ultraBaseName + '.png';
                            console.log(`[DIG_DEEPER] Trying level 3 base ultra: ${ultraBaseName}.png`);
                        }
                    }
                    
                    // Try parent mine image with "Deep" suffix for level 2
                    if (!fs.existsSync(imagePath) && deeperLevel === 2) {
                        const parentImageName = currentMine.image + 'Deep';
                        imagePath = path.join(__dirname, '../assets/game/tiles', parentImageName + '.png');
                        imageFileName = parentImageName + '.png';
                        console.log(`[DIG_DEEPER] Trying level 2 deep image: ${parentImageName}.png`);
                    }
                    
                    // Try the current mine's image (parent of this deeper mine)
                    if (!fs.existsSync(imagePath)) {
                        imagePath = path.join(__dirname, '../assets/game/tiles', currentMine.image + '.png');
                        imageFileName = currentMine.image + '.png';
                        console.log(`[DIG_DEEPER] Trying parent mine image: ${currentMine.image}.png`);
                    }
                    
                    // Try to extract base mine name and use that
                    if (!fs.existsSync(imagePath)) {
                        // Extract base name (remove Deep/Ultra suffixes)
                        let baseName = deeperMine.image
                            .replace('Deep', '')
                            .replace('Ultra', '')
                            .replace('MineDeep', 'Mine')
                            .replace('MineUltra', 'Mine');
                        
                        imagePath = path.join(__dirname, '../assets/game/tiles', baseName + '.png');
                        imageFileName = baseName + '.png';
                        console.log(`[DIG_DEEPER] Trying base mine name: ${baseName}.png`);
                    }
                    
                    // Final fallback to placeholder
                    if (!fs.existsSync(imagePath)) {
                        console.log(`[DIG_DEEPER] All image attempts failed, using placeholder`);
                        imagePath = path.join(__dirname, '../assets/game/tiles', 'placeHolder.png');
                        imageFileName = 'placeHolder.png';
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