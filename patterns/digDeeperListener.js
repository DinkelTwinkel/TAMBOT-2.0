// patterns/digDeeperListener.js
// Event listener for handling "Dig Deeper" button interactions

const { ChannelType, EmbedBuilder, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const gachaServersPath = path.join(__dirname, '../data/gachaServers.json');

class DigDeeperListener {
    constructor(client) {
        this.client = client;
        this.setupListener();
        
        // Track processing to prevent duplicates - now using guild+mineType as key
        this.processingRequests = new Map();
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
        
        // Load gacha servers data
        const gachaServers = require(gachaServersPath);
        
        // Find the current mine configuration
        const currentMine = gachaServers.find(s => s.id == currentMineId);
        if (!currentMine || !currentMine.deeperMineId) {
            return interaction.reply({ 
                content: '❌ This mine does not have a deeper level configured.',
                ephemeral: true 
            });
        }
        
        // Find the deeper mine configuration
        const deeperMine = gachaServers.find(s => s.id == currentMine.deeperMineId);
        if (!deeperMine) {
            return interaction.reply({ 
                content: '❌ Deeper mine configuration not found.',
                ephemeral: true 
            });
        }
        
        // Create a unique processing key for this guild and deeper mine type
        const processingKey = `${interaction.guild.id}_${deeperMine.id}`;
        
        // Check if already processing this type of deeper mine in this guild
        if (this.processingRequests.get(processingKey)) {
            return interaction.reply({ 
                content: '⏳ A deeper mine of this type is already being created. Please wait a moment...', 
                ephemeral: true 
            });
        }
        
        // Mark as processing
        this.processingRequests.set(processingKey, true);
        
        // Defer the reply early
        await interaction.deferReply();
        
        try {
            // Get the current channel and its database entry
            const currentChannel = interaction.guild.channels.cache.get(channelId);
            if (!currentChannel) {
                return interaction.editReply({ 
                    content: '❌ Current voice channel not found.' 
                });
            }
            
            // Get the database entry for the current channel
            const dbEntry = await ActiveVCS.findOne({ channelId: channelId });
            if (!dbEntry) {
                return interaction.editReply({ 
                    content: '❌ Channel database entry not found.' 
                });
            }
            
            // Double-check conditions are still met
            const deeperMineChecker = require('./mining/deeperMineChecker');
            const conditionsMet = deeperMineChecker.checkConditions(dbEntry, currentMine);
            
            if (!conditionsMet) {
                return interaction.editReply({ 
                    content: '❌ You no longer meet the conditions to dig deeper.' 
                });
            }
            
            let newChannel;
            let isNewChannel = false;
            let existingDbEntry = null;
            
            // Check if ANY channel in this guild already has a deeper mine of this type
            // This prevents duplicate deeper mines of the same type
            const allActiveChannels = await ActiveVCS.find({ 
                guildId: interaction.guild.id,
                typeId: parseInt(deeperMine.id)
            });
            
            console.log(`[DIG_DEEPER] Found ${allActiveChannels.length} existing channels of type ${deeperMine.id} in guild`);
            
            // Find an existing valid deeper mine channel
            for (const activeChannel of allActiveChannels) {
                const existingChannel = interaction.guild.channels.cache.get(activeChannel.channelId);
                if (existingChannel) {
                    // Found a valid existing deeper mine channel
                    newChannel = existingChannel;
                    existingDbEntry = activeChannel;
                    isNewChannel = false;
                    console.log(`[DIG_DEEPER] Found existing deeper mine channel: ${existingChannel.id}`);
                    break;
                } else {
                    // Channel no longer exists, clean up the database entry
                    console.log(`[DIG_DEEPER] Cleaning up orphaned DB entry for channel ${activeChannel.channelId}`);
                    await ActiveVCS.deleteOne({ channelId: activeChannel.channelId });
                }
            }
            
            // Create new channel if no valid existing channel was found
            if (!newChannel) {
                isNewChannel = true;
                
                // Create the new deeper mine voice channel
                const parentCategory = currentChannel.parent;
                
                // Check if the deeper mine is locked
                const isLocked = deeperMine.isLocked === true;
                
                // Prepare channel creation options
                const channelOptions = {
                    name: deeperMine.name,
                    type: ChannelType.GuildVoice,
                    parent: parentCategory,
                    userLimit: currentChannel.userLimit || 0,
                    bitrate: currentChannel.bitrate
                };
                
                // If the mine is locked, set restrictive permissions
                if (isLocked) {
                    channelOptions.permissionOverwrites = [
                        {
                            id: interaction.guild.id, // @everyone role
                            deny: [
                                PermissionsBitField.Flags.Connect,
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.ReadMessageHistory,
                                PermissionsBitField.Flags.AddReactions,
                                PermissionsBitField.Flags.AttachFiles,
                                PermissionsBitField.Flags.EmbedLinks,
                                PermissionsBitField.Flags.UseApplicationCommands
                            ],
                            allow: [
                                PermissionsBitField.Flags.ViewChannel
                            ]
                        },
                        {
                            id: member.id, // The user who clicked the button
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.Connect,
                                PermissionsBitField.Flags.Speak,
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.ReadMessageHistory,
                                PermissionsBitField.Flags.AddReactions,
                                PermissionsBitField.Flags.AttachFiles,
                                PermissionsBitField.Flags.EmbedLinks,
                                PermissionsBitField.Flags.UseApplicationCommands,
                                PermissionsBitField.Flags.Stream,
                                PermissionsBitField.Flags.UseVAD
                            ]
                        }
                    ];
                    
                    console.log(`[DIG_DEEPER] Creating LOCKED deeper mine channel for ${member.displayName}`);
                }
                
                newChannel = await interaction.guild.channels.create(channelOptions);
                
                // Determine the deeper level
                const deeperLevel = dbEntry.gameData.isDeeperMine ? 
                    (dbEntry.gameData.deeperLevel || 2) + 1 : 2;
                
                // Create new database entry for the deeper mine
                const newEntry = new ActiveVCS({
                    channelId: newChannel.id,
                    guildId: interaction.guild.id,
                    typeId: parseInt(deeperMine.id),
                    nextTrigger: new Date(Date.now() + 1000 * 30),
                    nextShopRefresh: new Date(Date.now() + 1000 * 60 * 25),
                    nextLongBreak: new Date(Date.now() + 60 * 1000 * 100),
                    gameData: {
                        miningMode: true,
                        powerLevel: deeperMine.power,
                        parentChannelId: channelId,
                        isDeeperMine: true,
                        deeperLevel: deeperLevel,
                        isSharedDeeperMine: true, // Mark as shared deeper mine
                        // Initialize fresh mining data
                        map: undefined,
                        minecart: { items: {}, contributors: {} },
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
                                wallsBroken: dbEntry.gameData.miningStats?.wallsBroken || 0,
                                oresFound: dbEntry.gameData.miningStats?.oresFound || 0,
                                treasuresFound: dbEntry.gameData.miningStats?.treasuresFound || 0
                            }
                        },
                        players: {},
                        speedActions: new Map(),
                        speedCooldowns: new Map()
                    }
                });
                
                await newEntry.save();
                existingDbEntry = newEntry;
                
                console.log(`[DIG_DEEPER] Created new deeper mine channel ${newChannel.id} (Level ${deeperLevel}) for guild ${interaction.guild.id}`);
            }
            
            // Store reference to the deeper mine in the parent channel's data
            dbEntry.gameData.deeperMineChannelId = newChannel.id;
            dbEntry.gameData.lastDeeperAccess = Date.now();
            await dbEntry.save();
            
            // Handle locked channel permissions
            const isLocked = deeperMine.isLocked === true;
            if (isLocked && !isNewChannel) {
                // Check if user already has permissions
                const permissions = newChannel.permissionOverwrites.cache.get(member.id);
                const hasAccess = permissions && permissions.allow.has(PermissionsBitField.Flags.Connect);
                
                if (!hasAccess) {
                    // Grant individual permissions to this user
                    await newChannel.permissionOverwrites.create(member.id, {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        AddReactions: true,
                        AttachFiles: true,
                        EmbedLinks: true,
                        UseApplicationCommands: true,
                        Stream: true,
                        UseVAD: true
                    });
                    
                    console.log(`[DIG_DEEPER] Granted access to locked channel ${newChannel.id} for ${member.displayName}`);
                }
            }
            
            // Move the user to the deeper mine
            try {
                await member.voice.setChannel(newChannel);
                console.log(`[DIG_DEEPER] Moved member ${member.id} to deeper mine ${newChannel.id}`);
            } catch (err) {
                console.error(`[DIG_DEEPER] Failed to move member ${member.id}:`, err);
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
                );
            
            // Add level indicator
            const deeperLevel = existingDbEntry.gameData.deeperLevel || 2;
            successEmbed.addFields({
                name: '🏔️ Depth',
                value: `Level **${deeperLevel}** Deeper Mine`,
                inline: true
            });
            
            // Add locked status field if applicable
            if (isLocked) {
                successEmbed.addFields({
                    name: '🔒 Exclusive Access',
                    value: 'This is a **locked** deeper mine! Only qualified miners can enter.',
                    inline: false
                });
            }
            
            successEmbed
                .setFooter({ text: isNewChannel ? 'New deeper mine created!' : 'Joined existing deeper mine!' })
                .setTimestamp();
            
            // Send success message to the interaction
            await interaction.editReply({ 
                content: `✅ Successfully moved to deeper mine!`,
                embeds: [successEmbed]
            });
            
            // Send appropriate message in the new channel
            if (isNewChannel) {
                // New channel - send full welcome message with image
                const deeperLevel = existingDbEntry.gameData.deeperLevel || 2;
                
                // Find the best image for this deeper mine
                let imagePath = path.join(__dirname, '../assets/game/tiles', deeperMine.image + '.png');
                let imageFileName = deeperMine.image + '.png';
                
                console.log(`[DIG_DEEPER] Looking for image: ${imagePath}`);
                
                // Try various image naming patterns
                if (!fs.existsSync(imagePath)) {
                    const imageFallbacks = [
                        // Try with Deep/Ultra suffixes based on level
                        deeperLevel === 3 ? currentMine.image.replace('Deep', '') + 'Ultra' : currentMine.image + 'Deep',
                        // Try base mine name variations
                        deeperMine.image.replace('Deep', '').replace('Ultra', ''),
                        currentMine.image,
                        // Extract base name
                        deeperMine.image.replace('MineDeep', 'Mine').replace('MineUltra', 'Mine'),
                        // Final fallback
                        'placeHolder'
                    ];
                    
                    for (const fallback of imageFallbacks) {
                        imagePath = path.join(__dirname, '../assets/game/tiles', fallback + '.png');
                        imageFileName = fallback + '.png';
                        console.log(`[DIG_DEEPER] Trying fallback image: ${fallback}.png`);
                        
                        if (fs.existsSync(imagePath)) {
                            break;
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
                        },
                        {
                            name: '🏔️ Current Depth',
                            value: `You are now at Level **${deeperLevel}** of the mines`,
                            inline: true
                        }
                    );
                
                if (isLocked) {
                    welcomeEmbed.addFields({
                        name: '🔒 Exclusive Access',
                        value: 'This is an **exclusive locked mine**! Only those who meet the requirements can enter.',
                        inline: false
                    });
                }
                
                welcomeEmbed
                    .setFooter({ text: `First accessed by ${member.displayName}` })
                    .setTimestamp();
                
                await newChannel.send({ 
                    content: `🎉 **NEW DEEPER MINE DISCOVERED!**\n${member.displayName} is the first to reach this depth!`,
                    embeds: [welcomeEmbed], 
                    files: [imageAttachment] 
                });
                
                // Generate initial shop for the new channel
                const generateShop = require('./generateShop');
                await generateShop(newChannel, 1);
                
                console.log(`[DIG_DEEPER] Successfully created and initialized deeper mine ${deeperMine.name}`);
                
            } else {
                // Existing channel - send join notification
                const joinEmbed = new EmbedBuilder()
                    .setTitle('⛏️ Another Miner Descends!')
                    .setDescription(`**${member.displayName}** has joined the deeper mine!`)
                    .setColor(0x00FF00)
                    .setThumbnail(member.user.displayAvatarURL())
                    .addFields(
                        {
                            name: '👥 Current Miners',
                            value: `${newChannel.members.size} miner(s) exploring this level`,
                            inline: true
                        },
                        {
                            name: '🏔️ Mine Level',
                            value: `Level ${existingDbEntry.gameData.deeperLevel || 2} Deeper Mine`,
                            inline: true
                        }
                    );
                
                if (isLocked) {
                    joinEmbed.addFields({
                        name: '🔓 Access Granted',
                        value: `${member.displayName} has earned access to this exclusive mine!`,
                        inline: false
                    });
                }
                
                joinEmbed
                    .setFooter({ text: 'Work together to mine efficiently!' })
                    .setTimestamp();
                
                await newChannel.send({ embeds: [joinEmbed] });
                
                console.log(`[DIG_DEEPER] Member ${member.id} joined existing deeper mine ${newChannel.id}`);
            }
            
        } catch (error) {
            console.error('[DIG_DEEPER] Error creating/joining deeper mine:', error);
            
            // Try to send error message
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: '❌ Failed to access the deeper mine. Please try again.',
                        ephemeral: true 
                    });
                } else {
                    await interaction.editReply({ 
                        content: '❌ Failed to access the deeper mine. Please try again.' 
                    });
                }
            } catch (e) {
                console.error('[DIG_DEEPER] Failed to send error response:', e);
            }
        } finally {
            // Always clear the processing flag
            this.processingRequests.delete(processingKey);
        }
    }
}

module.exports = DigDeeperListener;