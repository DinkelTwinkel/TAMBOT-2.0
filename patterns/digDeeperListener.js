// patterns/digDeeperListener.js
// Event listener for handling "Dig Deeper" button interactions

const { ChannelType, EmbedBuilder, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const gachaServersPath = path.join(__dirname, '../data/gachaServers.json');

// Collection of narration messages for failed dig attempts
// Using {player} as placeholder for player name
const narrationMessages = [
    "{player}'s pickaxe left no mark on the ground.",
    "{player}'s pick helplessly bounced out of their hand.",
    "The cavern floor echoed beneath {player}, yet nothing changed.",
    "{player} strikes with all their might, but the earth refuses to yield.",
    "The ground seems to laugh at {player}'s futile attempts.",
    "{player}'s pickaxe clangs uselessly against the impenetrable floor.",
    "Despite {player}'s efforts, the mine floor remains unchanged.",
    "{player} swings and swings, but it's as if they're hitting solid bedrock.",
    "The earth here is different... ancient... unyielding to {player}'s attempts.",
    "{player}'s pickaxe rebounds with such force they nearly lose their grip.",
    "The floor here is harder than any material {player} has encountered.",
    "{player}'s strike creates sparks, but no progress.",
    "The mine seems to resist {player}'s every attempt to go deeper.",
    "{player} feels the vibrations travel up their arms, but the ground doesn't budge.",
    "It's as if an invisible force prevents {player} from digging any deeper.",
    "{player}'s pickaxe meets an impossibly dense layer of stone.",
    "The sound of {player}'s strike echoes hollowly through the cavern.",
    "{player} chips away for what feels like hours with no visible progress.",
    "The floor beneath {player} might as well be made of diamond.",
    "{player}'s best strike barely scratches the surface.",
    "The mine floor here defies all geological understanding, resisting {player}.",
    "{player} wonders if they've reached the limits of what mortals can excavate.",
    "{player}'s pickaxe feels heavier with each failed attempt.",
    "The ground here has been compressed by eons of pressure, defeating {player}.",
    "Even {player}'s strongest blow fails to make a dent."
];

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
            
            // Handle successful dig deeper buttons
            if (interaction.customId.startsWith('dig_deeper_')) {
                await this.handleDigDeeper(interaction);
            }
            // Handle failed attempt buttons (red buttons)
            else if (interaction.customId.startsWith('dig_mystery_')) {
                await this.handleDigDeeperMystery(interaction);
            }
        });
        
        console.log('[DIG_DEEPER_LISTENER] Dig deeper listener initialized');
    }
    
    async handleDigDeeper(interaction) {
        let processingKey = null; // Track the key for cleanup
        
        try {
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
            processingKey = `${interaction.guild.id}_${deeperMine.id}`;
            
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
                    const deeperLevel = dbEntry.gameData?.isDeeperMine ? 
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
                                    wallsBroken: dbEntry.gameData?.miningStats?.wallsBroken || 0,
                                    oresFound: dbEntry.gameData?.miningStats?.oresFound || 0,
                                    treasuresFound: dbEntry.gameData?.miningStats?.treasuresFound || 0
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
                dbEntry.gameData = dbEntry.gameData || {};
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
                
                // Parse the color with better validation for success embed
                let successEmbedColor = 0x00FF00; // Default green
                if (deeperMine.colour) {
                    // Remove # if present and ensure valid hex
                    const cleanColor = deeperMine.colour.replace('#', '');
                    if (/^[0-9A-Fa-f]{6}$/.test(cleanColor)) {
                        successEmbedColor = parseInt(cleanColor, 16);
                    }
                }
                
                // Build the success embed
                const successEmbed = new EmbedBuilder()
                    .setTitle(`⛏️ Descended to ${deeperMine.name}!`)
                    .setDescription(`**${member.displayName}** has descended to the deeper level!\n\n${deeperMine.description || 'A deeper section of the mine with richer resources.'}`)
                    .setColor(successEmbedColor)
                    .addFields(
                        { 
                            name: '📊 Mine Stats', 
                            value: `Power Level: **${deeperMine.power}**\nRarity: **${deeperMine.rarity || 'Common'}**`, 
                            inline: true 
                        },
                        { 
                            name: '⚠️ Danger Level', 
                            value: `Hazard Chance: **${Math.round((deeperMine.hazardConfig?.spawnChance || 0.1) * 100)}%**`, 
                            inline: true 
                        }
                    );
                
                // Add level indicator
                const deeperLevel = existingDbEntry.gameData?.deeperLevel || 2;
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
                    // New channel - send full welcome message with image (if available)
                    const deeperLevel = existingDbEntry.gameData?.deeperLevel || 2;
                    
                    // Parse the color with better validation
                    let embedColor = 0x00FF00; // Default green
                    if (deeperMine.colour) {
                        // Remove # if present and ensure valid hex
                        const cleanColor = deeperMine.colour.replace('#', '');
                        if (/^[0-9A-Fa-f]{6}$/.test(cleanColor)) {
                            embedColor = parseInt(cleanColor, 16);
                        } else {
                            console.warn(`[DIG_DEEPER] Invalid color format: ${deeperMine.colour}, using default`);
                        }
                    }
                    
                    // Find the best image for this deeper mine
                    const imageBaseName = deeperMine.image || 'placeHolder';
                    let imagePath = path.join(__dirname, '../assets/gachaLocations', imageBaseName + '.png');
                    let imageFileName = imageBaseName + '.png';
                    let imageAttachment = null;
                    let hasImage = false;
                    
                    console.log(`[DIG_DEEPER] Looking for image: ${imagePath}`);
                    
                    // Check if the specified image exists
                    if (fs.existsSync(imagePath)) {
                        hasImage = true;
                    } else {
                        // Try fallback images
                        const imageFallbacks = ['placeHolder'];
                        
                        for (const fallback of imageFallbacks) {
                            imagePath = path.join(__dirname, '../assets/gachaLocations', fallback + '.png');
                            imageFileName = fallback + '.png';
                            console.log(`[DIG_DEEPER] Trying fallback image: ${fallback}.png`);
                            
                            if (fs.existsSync(imagePath)) {
                                hasImage = true;
                                break;
                            }
                        }
                        
                        if (!hasImage) {
                            console.warn(`[DIG_DEEPER] No image found for ${deeperMine.name}, creating embed without image`);
                        }
                    }
                    
                    // Create image attachment only if image exists
                    if (hasImage) {
                        imageAttachment = new AttachmentBuilder(imagePath, { name: imageFileName });
                    }
                    
                    const welcomeEmbed = new EmbedBuilder()
                        .setTitle(`Welcome to ${deeperMine.name}`)
                        .setDescription(`\`\`\`${deeperMine.description || 'A deeper section of the mine awaits exploration.'}\`\`\``)
                        .setColor(embedColor);
                    
                    // Add image only if it exists
                    if (hasImage) {
                        welcomeEmbed.setImage(`attachment://${imageFileName}`);
                    }
                    
                    welcomeEmbed.addFields(
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
                                value: `Hazard spawn rate: **${Math.round((deeperMine.hazardConfig?.spawnChance || 0.1) * 100)}%**`, 
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
                    
                    // Prepare message options
                    const messageOptions = {
                        content: `🎉 **NEW DEEPER MINE DISCOVERED!**\n${member.displayName} is the first to reach this depth!`,
                        embeds: [welcomeEmbed]
                    };
                    
                    // Add image attachment only if it exists
                    if (hasImage && imageAttachment) {
                        messageOptions.files = [imageAttachment];
                    }
                    
                    await newChannel.send(messageOptions);
                    
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
                                value: `Level ${existingDbEntry.gameData?.deeperLevel || 2} Deeper Mine`,
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
            }
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
        } finally {
            // Always clear the processing flag if it was set
            if (processingKey) {
                this.processingRequests.delete(processingKey);
                console.log(`[DIG_DEEPER] Cleared processing flag for ${processingKey}`);
            }
        }
    }
    
    /**
     * Handle the dig deeper button interaction when conditions aren't met (red button)
     * @param {Interaction} interaction - The button interaction
     */
    async handleDigDeeperMystery(interaction) {
        try {
            // Defer the update instead of reply
            await interaction.deferUpdate();
            
            // Get the player's display name
            const playerName = interaction.member?.displayName || interaction.user.username || 'A miner';
            
            // Get a random narration message and replace placeholder
            const narrationTemplate = narrationMessages[Math.floor(Math.random() * narrationMessages.length)];
            const narration = narrationTemplate.replace(/{player}/g, playerName);
            
            // Get the existing message and embed
            const message = interaction.message;
            if (!message || !message.embeds || message.embeds.length === 0) {
                console.error('[DIG_DEEPER_MYSTERY] No embed found on message');
                return;
            }
            
            const existingEmbed = message.embeds[0];
            
            // Get current description (event log)
            let currentDescription = existingEmbed.description || '';
            currentDescription = currentDescription.replace(/^```\n?|```$/g, ''); // Remove code block markers
            
            // Parse existing lines
            const lines = currentDescription.split('\n').filter(line => line.trim());
            
            // Add the new narration as an event
            const newEvent = `⛏️ ${narration}`;
            
            // Keep only last 12 events (same as logEvent function)
            if (lines.length >= 12) {
                lines.shift(); // Remove oldest event
            }
            lines.push(newEvent);
            lines.push('-------------------------------'); // Add separator like other events
            
            // Rebuild description with code block
            const newDescription = '```\n' + lines.join('\n') + '\n```';
            
            // Create updated embed maintaining all other fields
            const updatedEmbed = new EmbedBuilder()
                .setTitle(existingEmbed.title || '🗺️ MINING MAP')
                .setColor(existingEmbed.color || 0x8B4513)
                .setDescription(newDescription)
                .setTimestamp();
            
            // Preserve footer if it exists
            if (existingEmbed.footer) {
                updatedEmbed.setFooter({ 
                    text: existingEmbed.footer.text || 'MINECART: Empty'
                });
            }
            
            // Preserve image if it exists
            if (existingEmbed.image) {
                updatedEmbed.setImage(existingEmbed.image.url);
            }
            
            // Copy any additional fields (like the Deeper Level Progress field)
            if (existingEmbed.fields && existingEmbed.fields.length > 0) {
                for (const field of existingEmbed.fields) {
                    updatedEmbed.addFields({
                        name: field.name,
                        value: field.value,
                        inline: field.inline || false
                    });
                }
            }
            
            // Edit the message with updated embed, keeping the same components
            await interaction.editReply({
                embeds: [updatedEmbed],
                components: message.components || []
            });
            
        } catch (error) {
            console.error('[DIG_DEEPER_MYSTERY] Error handling interaction:', error);
            
            // Try to respond with error if possible
            try {
                // Since we deferred update, we can't reply normally
                // Just log the error and fail silently from user perspective
                console.error('[DIG_DEEPER_MYSTERY] Failed to update embed:', error.message);
            } catch (replyError) {
                console.error('[DIG_DEEPER_MYSTERY] Error sending error message:', replyError);
            }
        }
    }
}

module.exports = DigDeeperListener;
