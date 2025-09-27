const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { ChannelType, NewsChannel } = require('discord.js');
const messageDeletus = require('../models/tidyMessages'); // Adjust path accordingly
const ActiveVCS =  require ('../models/activevcs');
const createCurrencyProfile = require('../patterns/currency/createCurrencyProfile');
const registerBotMessage = require('./registerBotMessage');
const Cooldown = require('../models/coolDowns');
const TileMap = require('../models/TileMap');
const PlayerInventory = require('../models/inventory');

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const generateShop = require('./generateShop');
const GuildConfig = require('../models/GuildConfig');
const Sacrifice = require('../models/SacrificeSchema'); // Import Sacrifice model
const getPlayerStats = require('./calculatePlayerStat'); // Import player stats calculator

const channelsFile = path.join(__dirname, '../data/gachaServers.json');
const channelData = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));


module.exports = async (roller, guild, parentCategory, gachaRollChannel) => {

    let guildConfig = await GuildConfig.findOne({ guildId: guild.id });

    console.log (guildConfig);

    // Check for active sacrifice in the guild
    const sacrificeData = await Sacrifice.findOne({ 
        guildId: guild.id,
        isSacrificing: true 
    });

    if (sacrificeData) {
        console.log(`🔥 Guild ${guild.id} is sacrificing! Forcing roll to ???'s gullet (id: 16)`);
    }

    if (guildConfig.gachaCost == null) {
    // If config exists but gachaCost field is missing or null
    guildConfig.gachaCost = 0;
    await guildConfig.save();
    }

    const rollPrice = guildConfig.gachaCost;

    gachaRollChannel.setName(`🎰 𝙂𝘼𝘾𝙃𝘼 『 INSERT ${rollPrice} C 』`);

    const rollerMember = await guild.members.fetch(roller.id);

    // Check if user has an active roll cooldown (skip for users without special role)
    let userCooldown = await Cooldown.findOne({ userId: roller.id });
    const specialRoleId = '1421477924187541504';
    const hasSpecialRole = rollerMember.roles.cache.has(specialRoleId);
    
    if (userCooldown && userCooldown.gachaRollData && userCooldown.gachaRollData.expiresAt && hasSpecialRole) {
        const cooldownExpiry = new Date(userCooldown.gachaRollData.expiresAt);
        const now = new Date();
        
        if (cooldownExpiry > now) {
            // User is still on cooldown
            const existingVC = await guild.channels.fetch(userCooldown.gachaRollData.channelId).catch(() => null);
            
            // Calculate remaining time
            const remainingMs = cooldownExpiry - now;
            const remainingMinutes = Math.ceil(remainingMs / 60000);
            
            if (existingVC) {
                // Move user to their existing VC
                try {
                    await roller.setChannel(existingVC);
                } catch (error) {
                    if (error.code === 40032) {
                        console.log(`⚠️ Cannot move ${rollerMember.user.tag} to existing VC - user not in voice`);
                    } else {
                        console.error(`Error moving ${rollerMember.user.tag} to existing VC:`, error);
                    }
                }
                
                // Send cooldown message
                await gachaRollChannel.send(
                    `⏰ **${rollerMember.user.tag}** You already have an active roll! Moving you to your existing VC: **${existingVC.name}**\n` +
                    `You can roll again in **${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}**.`
                );
                
                // Also send a reminder in the VC they were moved to
                await existingVC.send(
                    `⏰ ${rollerMember} You're still on cooldown! You can roll for a new VC in **${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}**.`
                );
                
                return;
            } else {
                // VC was deleted, recreate the same type without charging coins
                console.log(`Recreating deleted VC for user on cooldown: ${rollerMember.user.tag}`);
                
                // Find the gacha type from stored data
                const storedTypeId = userCooldown.gachaRollData.typeId;
                let chosenChannelType = channelData.find(ch => ch.id == storedTypeId); // Use == for type coercion
                    
                    // Check player's sanity for gluttony override during cooldown recreation
                    const playerStatsCooldown = await getPlayerStats(roller.id);
                    const playerSanityCooldown = playerStatsCooldown.stats.sanity || 0;
                    let sanityCooldownOverride = false;
                    
                    if (playerSanityCooldown < 0 && storedTypeId != 16) {
                        const gluttonyChance = Math.min(99, Math.abs(playerSanityCooldown));
                        const rollPercentage = Math.random() * 100;
                        if (rollPercentage < gluttonyChance) {
                            sanityCooldownOverride = true;
                            console.log(`🧠 Sanity override on cooldown recreation: Player sanity: ${playerSanityCooldown}, Chance: ${gluttonyChance}%`);
                        }
                    }
                    
                    // Check for debug override during cooldown recreation
                    const DEBUG_USER_ID = "1";
                    const DEBUG_CHANNEL_ID = 13;
                    let debugOverride = false;
                    
                    if (roller.id === DEBUG_USER_ID) {
                        debugOverride = true;
                        console.log(`🔧 DEBUG MODE: User ${roller.id} detected during cooldown recreation - forcing channel type ${DEBUG_CHANNEL_ID}`);
                    }
                    
                    // Check if sacrifice is active and override to ???'s gullet if needed
                    const sacrificeDataCooldown = await Sacrifice.findOne({ 
                        guildId: guild.id,
                        isSacrificing: true 
                    });
                    
                    if ((sacrificeDataCooldown && sacrificeDataCooldown.isSacrificing) || sanityCooldownOverride) {
                        const gulletChannel = channelData.find(ch => ch.id == 16);
                        if (gulletChannel && storedTypeId != 16) {
                            if (sanityCooldownOverride) {
                                console.log(`🧠💀 Sanity override on cooldown recreation: Switching from ${chosenChannelType?.name} to ???'s gullet`);
                            } else {
                                console.log(`🔥 Sacrifice override on cooldown recreation: Switching from ${chosenChannelType?.name} to ???'s gullet`);
                            }
                            chosenChannelType = gulletChannel;
                            
                            // Check if a gullet channel already exists
                            const existingGulletVC = await ActiveVCS.findOne({ 
                                guildId: guild.id, 
                                typeId: 16 
                            });
                            
                            if (existingGulletVC) {
                                try {
                                    const existingGullet = await guild.channels.fetch(existingGulletVC.channelId);
                                    
                                    // Grant permissions to the user for the existing gullet channel
                                    await existingGullet.permissionOverwrites.edit(rollerMember, {
                                        ViewChannel: true,        // Can see the channel
                                        Connect: true,            // Can connect
                                        Speak: true,             // Can speak
                                        UseVAD: true,            // Can use voice activity
                                        Stream: true,            // Can stream
                                        SendMessages: true,      // Can send messages in chat
                                        ReadMessageHistory: true // Can read message history
                                    });
                                    
                                    // Move to existing gullet instead
                                    try {
                                        await roller.setChannel(existingGullet);
                                    } catch (error) {
                                        if (error.code === 40032) {
                                            console.log(`⚠️ Cannot move ${rollerMember.user.tag} to existing gullet - user not in voice`);
                                        } else {
                                            console.error(`Error moving ${rollerMember.user.tag} to existing gullet:`, error);
                                        }
                                    }
                                    
                                    // Update cooldown
                                    userCooldown.gachaRollData.channelId = existingGullet.id;
                                    userCooldown.gachaRollData.typeId = 16;
                                    await userCooldown.save();
                                    
                                    if (sanityCooldownOverride) {
                                        await gachaRollChannel.send(
                                            `🧠💀 **${rollerMember.user.tag}** Your previous VC was deleted. Your sanity (${playerSanityCooldown}) draws you to the existing **???'s gullet**!\n` +
                                            `⏰ You can roll for a new one in **${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}**.`
                                        );
                                        
                                        await existingGullet.send(
                                            `🧠💀 ${rollerMember} **A BROKEN MIND REJOINS THE GULLET!** 🧠💀\n` +
                                            `⏰ Your sanity has led you back. You can roll for a new VC at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.`
                                        );
                                    } else {
                                        await gachaRollChannel.send(
                                            `🔥 **${rollerMember.user.tag}** Your previous VC was deleted. Moving you to the existing **???'s gullet**!\n` +
                                            `⏰ You can roll for a new one in **${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}**.`
                                        );
                                        
                                        await existingGullet.send(
                                            `🔥 ${rollerMember} **REJOINS THE GULLET!** 🔥\n` +
                                            `⏰ This is the collective gullet. You can roll for a new VC at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.`
                                        );
                                    }
                                    
                                    return;
                                } catch (err) {
                                    // Gullet doesn't exist anymore, will create new one below
                                    await ActiveVCS.deleteOne({ channelId: existingGulletVC.channelId });
                                }
                            }
                        }
                    }
                
                if (!chosenChannelType) {
                    // Type not found, let them roll a new one
                    userCooldown.gachaRollData = undefined;
                    await userCooldown.save();
                    await gachaRollChannel.send(
                        `⚠️ **${rollerMember.user.tag}** Your previous VC type no longer exists. You can roll a new one!`
                    );
                    // Continue with normal roll process below
                } else {
                    // Recreate the VC of the same type
                    try {
                        const newGachaChannel = await guild.channels.create({
                            name: chosenChannelType.name,
                            type: ChannelType.GuildVoice,
                            parent: parentCategory,
                            position: 0, // Place at the top of the channel list
                        });

                        try {
                            await roller.setChannel(newGachaChannel);
                        } catch (error) {
                            if (error.code === 40032) {
                                console.log(`⚠️ Cannot move ${rollerMember.user.tag} to new gacha channel - user not in voice`);
                            } else {
                                console.error(`Error moving ${rollerMember.user.tag} to new gacha channel:`, error);
                            }
                        }

                        // Store the new VC in database
                        const storeVC = new ActiveVCS({
                            channelId: newGachaChannel.id,
                            guildId: guild.id,
                            typeId: parseInt(chosenChannelType.id), // Ensure consistent type
                            nextTrigger: new Date(Date.now() + 1000 * 30),
                            nextShopRefresh: new Date(Date.now() + 1000 * 60 * 25),
                            nextLongBreak: new Date(Date.now() + 60 * 1000 * 100),
                        });
                        
                        // If it's a mining type VC, set up initial data
                        if (chosenChannelType.type === 'mining') {
                            const basePowerLevel = chosenChannelType.power || 1;
                            
                            storeVC.gameData = {
                                miningMode: true,
                                powerLevel: basePowerLevel
                            };
                        }
                        
                        await storeVC.save();
                        
                        // If this is a gullet channel, set special permissions
                        if (chosenChannelType.id == 16) {
                            // Set base permissions: everyone can see but cannot connect or interact with text
                            await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                                ViewChannel: true,        // Can see the channel exists
                                Connect: false,           // Cannot connect directly
                                SendMessages: false,      // Cannot send messages
                                ReadMessageHistory: false // Cannot read message history
                            });
                            
                            // Grant specific permissions to the user who rolled the gullet
                            await newGachaChannel.permissionOverwrites.edit(rollerMember, {
                                ViewChannel: true,        // Can see the channel
                                Connect: true,            // Can connect
                                Speak: true,             // Can speak
                                UseVAD: true,            // Can use voice activity
                                Stream: true,            // Can stream
                                SendMessages: true,      // Can send messages in chat
                                ReadMessageHistory: true // Can read message history
                            });
                        }
                        
                        // If this is a debug channel recreation, set special debug permissions
                        if (debugOverride) {
                            // Set base permissions: everyone can see but cannot connect or interact with text
                            await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                                ViewChannel: true,        // Can see the channel exists
                                Connect: false,           // Cannot connect directly
                                SendMessages: false,      // Cannot send messages
                                ReadMessageHistory: false // Cannot read message history
                            });
                            
                            // Grant full permissions to the debug user
                            await newGachaChannel.permissionOverwrites.edit(rollerMember, {
                                ViewChannel: true,        // Can see the channel
                                Connect: true,            // Can connect
                                Speak: true,             // Can speak
                                UseVAD: true,            // Can use voice activity
                                Stream: true,            // Can stream
                                SendMessages: true,      // Can send messages in chat
                                ReadMessageHistory: true // Can read message history
                            });
                            
                            console.log(`🔧 Recreated debug channel with locked permissions for ${rollerMember.user.tag}`);
                        }

                        // Update cooldown with new channel ID
                        userCooldown.gachaRollData.channelId = newGachaChannel.id;
                        await userCooldown.save();

                        // Send messages
                        await gachaRollChannel.send(
                            `🔄 **${rollerMember.user.tag}** Your previous VC was deleted. Recreating your **${chosenChannelType.name}** (no charge).\n` +
                            `⏰ You can roll for a new one in **${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}**.`
                        );

                        await newGachaChannel.send(
                            `${rollerMember} Welcome back to the ${chosenChannelType.name}!\n` +
                            `⏰ This is the same type you rolled earlier. You can roll for a new VC at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.`
                        );

                        // Build and send the embed with image
                        let imagePath = path.join(__dirname, '../assets/gachaLocations', chosenChannelType.image + '.png');
                        let imageFileName = chosenChannelType.image + '.png';
                        
                        // Check if image exists, fallback to placeholder if not
                        if (!fs.existsSync(imagePath)) {
                            console.log(`Image not found: ${imagePath}, using placeholder`);
                            imagePath = path.join(__dirname, '../assets/gachaLocations', 'placeHolder.png');
                            imageFileName = 'placeHolder.png';
                        }
                        
                        const imageAttachment = new AttachmentBuilder(imagePath, { name: imageFileName });
                        const rollEmbed = new EmbedBuilder()
                            .setTitle(chosenChannelType.name)
                            .setDescription('```' + chosenChannelType.description + '```')
                            .setFooter({ text: `Rarity: ${chosenChannelType.rarity} | Restored from cooldown` })
                            .setColor(chosenChannelType.colour || 'Gold')
                            .setImage(`attachment://${imageFileName}`);
                        
                        await newGachaChannel.send({ embeds: [rollEmbed], files: [imageAttachment] });
                        
                        // Set channel permissions based on user's role (cooldown recreation)
                        const specialRoleId = '1421477924187541504';
                        if (rollerMember.roles.cache.has(specialRoleId)) {
                            // User has special role - make channel visible only to special role
                            try {
                                const specialRole = await guild.roles.fetch(specialRoleId);
                                if (specialRole) {
                                    // Hide from @everyone
                                    await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                                        ViewChannel: false
                                    });
                                    
                                    // Show to special role
                                    await newGachaChannel.permissionOverwrites.edit(specialRole, {
                                        ViewChannel: true,
                                        Connect: true,
                                        Speak: true,
                                        SendMessages: true
                                    });
                                    
                                    console.log(`🔒 Set cooldown recreation channel permissions for user with special role: ${rollerMember.user.tag}`);
                                }
                            } catch (roleError) {
                                console.error(`Error setting special role permissions (cooldown recreation):`, roleError);
                            }
                        } else if (chosenChannelType.id == 1) {
                            // Tutorial user in coal mine - give individual permissions
                            try {
                                // Hide from @everyone
                                await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                                    ViewChannel: false
                                });
                                
                                // Give individual permissions to the tutorial user
                                await newGachaChannel.permissionOverwrites.edit(rollerMember, {
                                    ViewChannel: true,
                                    Connect: true,
                                    Speak: true,
                                    SendMessages: true,
                                    ReadMessageHistory: true
                                });
                                
                                console.log(`📚 Set cooldown recreation tutorial channel permissions for user: ${rollerMember.user.tag}`);
                            } catch (permissionError) {
                                console.error(`Error setting tutorial user permissions (cooldown recreation):`, permissionError);
                            }
                        } else {
                            // User doesn't have special role and not tutorial - make channel visible to everyone
                            try {
                                await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                                    ViewChannel: true,
                                    Connect: true,
                                    Speak: true,
                                    SendMessages: true
                                });
                                
                                console.log(`🌐 Set cooldown recreation channel permissions for user without special role: ${rollerMember.user.tag}`);
                            } catch (permissionError) {
                                console.error(`Error setting everyone permissions (cooldown recreation):`, permissionError);
                            }
                        }
                        
                        await generateShop(newGachaChannel, 0.5);
                        
                        return;
                    } catch (err) {
                        console.error('Error recreating VC:', err);
                        await gachaRollChannel.send(
                            `⚠️ **${rollerMember.user.tag}** Failed to recreate your VC. Please try again or contact an admin.`
                        );
                        return;
                    }
                }
            }
        } else {
            // Cooldown has expired, clean it up
            userCooldown.gachaRollData = undefined;
            userCooldown.cooldowns.delete('gachaRoll'); // Clean up old format if exists
            await userCooldown.save();
        }
    }

    // step 1: do a cost check and proceed after taking payment!
    // step 2: Generate VC channel > then write it's entry into the VC database -> Set name as ROLLING //
    // step 3: Look into VC tiers data and calculate its chance based on weight?
    // get the user's profile > generate one if there isn't one. 

    const existingProfile = createCurrencyProfile(rollerMember, 0);

    if (existingProfile.money < rollPrice) {
        await roller.voice.disconnect();
        return gachaRollChannel.send(`${roller} You're broke!, You need ${rollPrice} coins to roll!`);
    }

    console.log ('roll price check succeeded!');
    
    existingProfile.money -= rollPrice;
    (await existingProfile).save();

    try {
        // Create the voice channel under the given parent category
        const newGachaChannel = await guild.channels.create({
            name: '🎲 Rolling...',
            type: ChannelType.GuildVoice,
            parent: parentCategory,
            position: 0, // Place at the top of the channel list
        });

        try {
            await roller.setChannel(newGachaChannel);
        } catch (error) {
            if (error.code === 40032) {
                console.log(`⚠️ Cannot move ${rollerMember.user.tag} to new gacha channel - user not in voice`);
            } else {
                console.error(`Error moving ${rollerMember.user.tag} to new gacha channel:`, error);
            }
        }

        // Now store VC data on the mongodb
        const storeVC = new ActiveVCS ({
            channelId: newGachaChannel.id,
            guildId: guild.id,
            typeId: 0,
            nextTrigger: new Date(Date.now() + 1000 * 10), // 30 second delay before events start.
            nextShopRefresh: new Date(Date.now() + 1000 * 60 * 25), 
            nextLongBreak: new Date(Date.now() + 60 * 1000 * 100),
        })

        await storeVC.save();

        // roll for VC type > then update the storeVC to match it.
        let chosenChannelType;
        let existingGulletChannel = null;
        let sanityOverride = false;
        let debugOverride = false;
        
        // DEBUG: Check if this is the debug user
        const DEBUG_USER_ID = "1";
        const DEBUG_CHANNEL_ID = 13; // Change this to the channel ID you want for debugging (e.g., 16 for gullet)
        
        if (roller.id === DEBUG_USER_ID) {
            debugOverride = true;
            console.log(`🔧 DEBUG MODE: User ${roller.id} detected - forcing channel type ${DEBUG_CHANNEL_ID}`);
        }
        
        // Check player's sanity for gluttony roll chance
        const playerStats = await getPlayerStats(roller.id);
        const playerSanity = playerStats.stats.sanity || 0;
        
        // Calculate gluttony chance based on negative sanity
        // Each -1 sanity = 1% chance, capped at 99%
        if (playerSanity < 0) {
            const gluttonyChance = Math.min(99, Math.abs(playerSanity)); // Cap at 99%
            const rollPercentage = Math.random() * 100;
            
            if (rollPercentage < gluttonyChance) {
                sanityOverride = true;
                console.log(`🧠 Sanity override triggered! Player sanity: ${playerSanity}, Chance: ${gluttonyChance}%, Roll: ${rollPercentage.toFixed(2)}%`);
            } else {
                console.log(`🧠 Sanity check: Player sanity: ${playerSanity}, Chance: ${gluttonyChance}%, Roll: ${rollPercentage.toFixed(2)}% - No override`);
            }
        }
        
        // DEBUG OVERRIDE: Force specific channel for debug user
        if (debugOverride) {
            chosenChannelType = channelData.find(ch => ch.id == DEBUG_CHANNEL_ID);
            if (!chosenChannelType) {
                console.error(`⚠️ DEBUG WARNING: Channel ID ${DEBUG_CHANNEL_ID} not found in gachaServers.json!`);
                chosenChannelType = pickRandomChannelWeighted(channelData); // Fallback to normal roll
            } else {
                console.log(`🔧 DEBUG: Forcing channel type: ${chosenChannelType.name} for debug user`);
            }
        }
        // ROLE CHECK: If user doesn't have the special role, default to coal mine (id: 1)
        else if (!rollerMember.roles.cache.has('1421477924187541504')) {
            chosenChannelType = channelData.find(ch => ch.id == 1);
            if (!chosenChannelType) {
                console.error("⚠️ Warning: Coal mine (id: 1) not found in gachaServers.json!");
                chosenChannelType = pickRandomChannelWeighted(channelData); // Fallback to normal roll
            } else {
                console.log(`⛏️ Role check: User ${rollerMember.user.tag} doesn't have special role, defaulting to coal mine`);
            }
        }
        // If sacrificing is active OR sanity override triggered, force roll to ???'s gullet (id: 16)
        else if (sacrificeData && sacrificeData.isSacrificing || sanityOverride) {
            chosenChannelType = channelData.find(ch => ch.id == 16);
            if (!chosenChannelType) {
                console.error("⚠️ Warning: ???'s gullet (id: 16) not found in gachaServers.json!");
                chosenChannelType = pickRandomChannelWeighted(channelData); // Fallback to normal roll
            } else {
                if (sanityOverride) {
                    console.log(`🧠💀 Sanity override: Rolling ???'s gullet for ${rollerMember.user.tag} (Sanity: ${playerSanity})`);
                } else {
                    console.log(`🔥 Sacrifice override: Rolling ???'s gullet for ${rollerMember.user.tag}`);
                }
                
                // Check if a gullet channel already exists
                const existingGulletVC = await ActiveVCS.findOne({ 
                    guildId: guild.id, 
                    typeId: 16 
                });
                
                if (existingGulletVC) {
                    try {
                        existingGulletChannel = await guild.channels.fetch(existingGulletVC.channelId);
                        console.log(`🔥 Found existing gullet channel: ${existingGulletChannel.name}`);
                    } catch (err) {
                        console.log(`🔥 Previous gullet channel no longer exists, will create new one`);
                        // Delete the stale database entry
                        await ActiveVCS.deleteOne({ channelId: existingGulletVC.channelId });
                    }
                }
            }
        } else {
            chosenChannelType = pickRandomChannelWeighted(channelData);
            
            // Check if this is a gullet roll from normal weighted selection
            if (chosenChannelType.id == 16) {
                console.log(`🎲 Normal roll resulted in ???'s gullet for ${rollerMember.user.tag}`);
                
                // Check if a gullet channel already exists
                const existingGulletVC = await ActiveVCS.findOne({ 
                    guildId: guild.id, 
                    typeId: 16 
                });
                
                if (existingGulletVC) {
                    try {
                        existingGulletChannel = await guild.channels.fetch(existingGulletVC.channelId);
                        console.log(`🔥 Found existing gullet channel: ${existingGulletChannel.name}`);
                    } catch (err) {
                        console.log(`🔥 Previous gullet channel no longer exists, will create new one`);
                        // Delete the stale database entry
                        await ActiveVCS.deleteOne({ channelId: existingGulletVC.channelId });
                    }
                }
            }
        }

        // If we have an existing gullet channel, move player there instead of creating new
        if (existingGulletChannel && chosenChannelType.id == 16) {
            // Delete the temporary channel we just created
            await newGachaChannel.delete();
            await ActiveVCS.deleteOne({ channelId: newGachaChannel.id });
            
            // Grant permissions to the user for the existing gullet channel
            await existingGulletChannel.permissionOverwrites.edit(rollerMember, {
                ViewChannel: true,        // Can see the channel
                Connect: true,            // Can connect
                Speak: true,             // Can speak
                UseVAD: true,            // Can use voice activity
                Stream: true,            // Can stream
                SendMessages: true,      // Can send messages in chat
                ReadMessageHistory: true // Can read message history
            });
            
            // Move player to existing gullet
            try {
                await roller.setChannel(existingGulletChannel);
                console.log(`🔥 Moved ${rollerMember.user.tag} to existing gullet channel`);
            } catch (error) {
                if (error.code === 40032) {
                    console.log(`⚠️ Cannot move ${rollerMember.user.tag} to gullet channel - user not in voice`);
                    // Send a message to the user explaining they need to be in voice
                    try {
                        await gachaRollChannel.send(
                            `⚠️ **${rollerMember.user.tag}** You need to be in a voice channel to be moved to the gullet! Please join a voice channel and try again.`
                        );
                    } catch (msgError) {
                        console.error('Failed to send voice channel message:', msgError);
                    }
                } else {
                    console.error(`Error moving ${rollerMember.user.tag} to gullet channel:`, error);
                }
            }
            
            // Update the cooldown to reference the existing gullet channel
            const cooldownExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
            
            if (!userCooldown) {
                userCooldown = new Cooldown({
                    userId: roller.id,
                    cooldowns: new Map(),
                    gachaRollData: {
                        channelId: existingGulletChannel.id,
                        typeId: 16,
                        rolledAt: new Date(),
                        expiresAt: cooldownExpiry
                    }
                });
            } else {
                userCooldown.gachaRollData = {
                    channelId: existingGulletChannel.id,
                    typeId: 16,
                    rolledAt: new Date(),
                    expiresAt: cooldownExpiry
                };
            }
            await userCooldown.save();
            
            // Send messages about joining the existing gullet
            if (sanityOverride) {
                await gachaRollChannel.send(
                    `🧠💀 **MADNESS CONSUMES YOU** 🧠💀\n` +
                    `**${rollerMember.user.tag}** Your deteriorating sanity (${playerSanity}) draws you into the existing **???'s gullet**!\n` +
                    `⏰ Next roll available in **60 minutes**.`
                );
                
                await existingGulletChannel.send(
                    `🧠💀 ${rollerMember} **A BROKEN MIND JOINS THE GULLET!** 🧠💀\n` +
                    `Your sanity (${playerSanity}) has led you here. The whispers welcome you...`
                );
            } else if (sacrificeData && sacrificeData.isSacrificing) {
                await gachaRollChannel.send(
                    `🔥 **SACRIFICE OVERRIDE** 🔥\n` +
                    `**${rollerMember.user.tag}** The sacrifice ritual compels you! You've been drawn into the existing **???'s gullet**!\n` +
                    `⏰ Next roll available in **60 minutes**.`
                );
                
                await existingGulletChannel.send(
                    `🔥 ${rollerMember} **ANOTHER SOUL JOINS THE GULLET!** 🔥\n` +
                    `Welcome to the collective feast within ???'s digestive system!`
                );
            } else {
                // Normal roll that resulted in gullet
                await gachaRollChannel.send(
                    `🌀 **MYTHIC ROLL** 🌀\n` +
                    `**${rollerMember.user.tag}** You've rolled into the existing **???'s gullet**!\n` +
                    `⏰ Next roll available in **60 minutes**.`
                );
                
                await existingGulletChannel.send(
                    `🌀 ${rollerMember} **JOINS THE GULLET!** 🌀\n` +
                    `Welcome to the depths of ???'s digestive system!`
                );
            }
            
            return; // Exit early since we're using existing channel
        }
        
        storeVC.typeId = parseInt(chosenChannelType.id); // Ensure consistent type
        
        // If it's a mining type VC, set up initial data
        if (chosenChannelType.type === 'mining') {
            const basePowerLevel = chosenChannelType.power || 1;
            
            // Store mining data in gameData
            storeVC.gameData = {
                ...storeVC.gameData,
                miningMode: true,
                powerLevel: basePowerLevel
            };
        }
        
        await storeVC.save();

        // === TILE MAP INTEGRATION ===
        // Try to attach this gacha server to an available tile
        try {
            let tileMap = await TileMap.findOne({ guildId: guild.id });
            if (!tileMap) {
                // Initialize tile map for this guild if it doesn't exist
                tileMap = await TileMap.initializeGuildMap(guild.id);
                console.log(`🗺️ Initialized new tile map for guild ${guild.id}`);
            }

            // Find tiles with less than 20 points and no existing gacha server
            const availableTiles = tileMap.tiles.filter(tile => 
                tile.points < 20 && !tile.gachaServerId
            );

            if (availableTiles.length > 0) {
                // Sort by points first, then by distance to center (closest first)
                const centerRow = tileMap.centerRow;
                const centerCol = tileMap.centerCol;
                
                availableTiles.sort((a, b) => {
                    // First priority: lower points
                    if (a.points !== b.points) {
                        return a.points - b.points;
                    }
                    
                    // Second priority: distance to center (closer is better)
                    const distanceA = Math.sqrt(Math.pow(a.row - centerRow, 2) + Math.pow(a.col - centerCol, 2));
                    const distanceB = Math.sqrt(Math.pow(b.row - centerRow, 2) + Math.pow(b.col - centerCol, 2));
                    return distanceA - distanceB;
                });
                
                const selectedTile = availableTiles[0];

                // Attach the gacha server to the tile
                const success = tileMap.attachGachaToTile(selectedTile.row, selectedTile.col, newGachaChannel.id);
                if (success) {
                    await tileMap.save();
                    console.log(`🗺️ Attached gacha server ${newGachaChannel.name} to tile (${selectedTile.row}, ${selectedTile.col}) with ${selectedTile.points} points`);
                }
            } else {
                console.log(`🗺️ No available tiles for gacha server ${newGachaChannel.name} (all tiles have 20+ points or are occupied)`);
            }
        } catch (tileError) {
            console.error('Error integrating gacha server with tile map:', tileError);
            // Don't fail the entire gacha roll if tile integration fails
        }

        // If this is a gullet channel, set special permissions
        if (chosenChannelType.id == 16) {
            // Set base permissions: everyone can see but cannot connect or interact with text
            await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                ViewChannel: true,        // Can see the channel exists
                Connect: false,           // Cannot connect directly
                SendMessages: false,      // Cannot send messages
                ReadMessageHistory: false // Cannot read message history
            });
            
            // Grant specific permissions to the user who rolled the gullet
            await newGachaChannel.permissionOverwrites.edit(rollerMember, {
                ViewChannel: true,        // Can see the channel
                Connect: true,            // Can connect (they're being moved there)
                Speak: true,             // Can speak
                UseVAD: true,            // Can use voice activity
                Stream: true,            // Can stream
                SendMessages: true,      // Can send messages in chat
                ReadMessageHistory: true // Can read message history
            });
            
            console.log(`🔥 Created new gullet channel with permissions for ${rollerMember.user.tag}`);
        }
        
        // If this is a debug channel, set special debug permissions
        if (debugOverride) {
            // Set base permissions: everyone can see but cannot connect or interact with text
            await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                ViewChannel: true,        // Can see the channel exists
                Connect: false,           // Cannot connect directly
                SendMessages: false,      // Cannot send messages
                ReadMessageHistory: false // Cannot read message history
            });
            
            // Grant full permissions to the debug user
            await newGachaChannel.permissionOverwrites.edit(rollerMember, {
                ViewChannel: true,        // Can see the channel
                Connect: true,            // Can connect
                Speak: true,             // Can speak
                UseVAD: true,            // Can use voice activity
                Stream: true,            // Can stream
                SendMessages: true,      // Can send messages in chat
                ReadMessageHistory: true // Can read message history
            });
            
            console.log(`🔧 Created debug channel with locked permissions for ${rollerMember.user.tag}`);
        }

        // Update VC name to the selected VC and create the intro message
        await newGachaChannel.setName('『 ' + chosenChannelType.rarity.toUpperCase() + ' ROLL 』');
        await new Promise(r => setTimeout(r, 1500));
        await newGachaChannel.setName(`${chosenChannelType.name}`);
        console.log(`🎉 Gacha rolled [${chosenChannelType.rarity.toUpperCase()}]: ${chosenChannelType.name}`);
        console.log(`Created VC ${newGachaChannel.name} for ${rollerMember.user.tag}`);

        // Set channel permissions based on user's role
        const specialRoleId = '1421477924187541504';
        if (rollerMember.roles.cache.has(specialRoleId)) {
            // User has special role - make channel visible only to special role
            try {
                const specialRole = await guild.roles.fetch(specialRoleId);
                if (specialRole) {
                    // Hide from @everyone
                    await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                        ViewChannel: false
                    });
                    
                    // Show to special role
                    await newGachaChannel.permissionOverwrites.edit(specialRole, {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true,
                        SendMessages: true
                    });
                    
                    console.log(`🔒 Set channel permissions for user with special role: ${rollerMember.user.tag}`);
                }
            } catch (roleError) {
                console.error(`Error setting special role permissions:`, roleError);
            }
        } else if (chosenChannelType.id == 1) {
            // Tutorial user in coal mine - give individual permissions
            try {
                // Hide from @everyone
                await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    ViewChannel: false
                });
                
                // Give individual permissions to the tutorial user
                await newGachaChannel.permissionOverwrites.edit(rollerMember, {
                    ViewChannel: true,
                    Connect: true,
                    Speak: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });
                
                console.log(`📚 Set tutorial channel permissions for user: ${rollerMember.user.tag}`);
            } catch (permissionError) {
                console.error(`Error setting tutorial user permissions:`, permissionError);
            }
        } else {
            // User doesn't have special role and not tutorial - make channel visible to everyone
            try {
                await newGachaChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    ViewChannel: true,
                    Connect: true,
                    Speak: true,
                    SendMessages: true
                });
                
                console.log(`🌐 Set channel permissions for user without special role: ${rollerMember.user.tag}`);
            } catch (permissionError) {
                console.error(`Error setting everyone permissions:`, permissionError);
            }
        }

        // Store the roll in cooldowns (1 hour cooldown) - only for users with special role
        if (hasSpecialRole) {
            const cooldownExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

            if (!userCooldown) {
                userCooldown = new Cooldown({
                    userId: roller.id,
                    cooldowns: new Map(),
                    gachaRollData: {
                        channelId: newGachaChannel.id,
                        typeId: parseInt(chosenChannelType.id), // Ensure it's stored as a number
                        rolledAt: new Date(),
                        expiresAt: cooldownExpiry
                    }
                });
            } else {
                userCooldown.gachaRollData = {
                    channelId: newGachaChannel.id,
                    typeId: parseInt(chosenChannelType.id), // Ensure it's stored as a number
                    rolledAt: new Date(),
                    expiresAt: cooldownExpiry
                };
            }

            await userCooldown.save();
            console.log(`⏰ Set cooldown for user with special role: ${rollerMember.user.tag}`);
        } else {
            console.log(`🚀 No cooldown for tutorial user: ${rollerMember.user.tag}`);
        }

        // Send special message based on override type
        if (debugOverride) {
            await gachaRollChannel.send(
                `🔧 **DEBUG MODE** 🔧\n` +
                `**${rollerMember.user.tag}** Debug override active! Spawned in **${chosenChannelType.name}**\n` +
                `⏰ Next roll available in **60 minutes**.`
            );
        } else if (sanityOverride && chosenChannelType.id == 16) {
            await gachaRollChannel.send(
                `🧠💀 **MADNESS CONSUMES YOU** 🧠💀\n` +
                `**${rollerMember.user.tag}** Your deteriorating sanity (${playerSanity}) draws you into **???'s gullet**!\n` +
                `⏰ Next roll available in **60 minutes**.`
            );
        } else if (sacrificeData && sacrificeData.isSacrificing && chosenChannelType.id == 16) {
            await gachaRollChannel.send(
                `🔥 **SACRIFICE OVERRIDE** 🔥\n` +
                `**${rollerMember.user.tag}** The sacrifice ritual compels you! You've been drawn into **???'s gullet**!\n` +
                `⏰ Next roll available in **60 minutes**.`
            );
        } else {
            if (hasSpecialRole) {
                await gachaRollChannel.send(
                    `**${rollerMember.user.tag}** Inserted ${rollPrice} Coins! Your rolling booth is ready: **${newGachaChannel.name}**\n` +
                    `⏰ Next roll available in **60 minutes**.`
                );
            } else {
                await gachaRollChannel.send(
                    `**${rollerMember.user.tag}** Inserted ${rollPrice} Coins! Your rolling booth is ready: **${newGachaChannel.name}**\n` +
                    `🚀 **Tutorial Mode:** You can roll for a new VC anytime! No cooldowns.`
                );
            }
        }

        // Send special message in the VC based on override type
        if (debugOverride) {
            const cooldownMessage = hasSpecialRole ? 
                `⏰ **Note:** You can only roll for a new VC once per hour. Your next roll will be available at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.` :
                `🚀 **Tutorial Mode:** You can roll for a new VC anytime! No cooldowns for tutorial users.`;
                
            await newGachaChannel.send(
                `🔧 ${rollerMember} **DEBUG MODE ACTIVE** 🔧\n` +
                `You've been spawned in ${chosenChannelType.name} for debugging purposes!\n` +
                cooldownMessage
            );
        } else if (sanityOverride && chosenChannelType.id == 16) {
            const cooldownMessage = hasSpecialRole ? 
                `⏰ **Note:** You can only roll for a new VC once per hour. Your next roll will be available at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.` :
                `🚀 **Tutorial Mode:** You can roll for a new VC anytime! No cooldowns for tutorial users.`;
                
            await newGachaChannel.send(
                `🧠💀 ${rollerMember} **YOUR MIND UNRAVELS!** 🧠💀\n` +
                `Your sanity (${playerSanity}) has led you to ${chosenChannelType.name}! The whispers grow louder...\n` +
                cooldownMessage
            );
        } else if (sacrificeData && sacrificeData.isSacrificing && chosenChannelType.id == 16) {
            const cooldownMessage = hasSpecialRole ? 
                `⏰ **Note:** You can only roll for a new VC once per hour. Your next roll will be available at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.` :
                `🚀 **Tutorial Mode:** You can roll for a new VC anytime! No cooldowns for tutorial users.`;
                
            await newGachaChannel.send(
                `🔥 ${rollerMember} **THE SACRIFICE DEMANDS YOUR PRESENCE!** 🔥\n` +
                `You've been forcefully drawn into ${chosenChannelType.name}!\n` +
                cooldownMessage
            );
        } else {
            if (hasSpecialRole) {
                await newGachaChannel.send(
                    `${rollerMember} You've found the ${chosenChannelType.name}!\n` +
                    `⏰ **Note:** You can only roll for a new VC once per hour. Your next roll will be available at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.`
                );
            }
            // Tutorial users don't get a channel message - they get the tutorial embed instead
        }

        // Build the file path for the image
        let imagePath = path.join(__dirname, '../assets/gachaLocations', chosenChannelType.image + '.png');
        let imageFileName = chosenChannelType.image + '.png';
        
        // Check if image exists, fallback to placeholder if not
        if (!fs.existsSync(imagePath)) {
            console.log(`Image not found: ${imagePath}, using placeholder`);
            imagePath = path.join(__dirname, '../assets/gachaLocations', 'placeHolder.png');
            imageFileName = 'placeHolder.png';
        }

        // Create the attachment
        const imageAttachment = new AttachmentBuilder(imagePath, { name: imageFileName });

        // Build the embed
        const rollEmbed = new EmbedBuilder()
            .setTitle(chosenChannelType.name)
            .setDescription('```' + chosenChannelType.description + '```')
            .setFooter({ text: `Rarity: ${chosenChannelType.rarity}` })
            .setColor(chosenChannelType.colour || 'Gold') // Use custom color if set, else Gold
            .setImage(`attachment://${imageFileName}`); // Display the image in the embed

        // Send it in the new text channel with the attachment
        await newGachaChannel.send({ embeds: [rollEmbed], files: [imageAttachment] });

        // Send tutorial embed for new users in coal mine (after main embed)
        if (chosenChannelType.id == 1 && !rollerMember.roles.cache.has('1421477924187541504')) {
            // Send user mention first
            await newGachaChannel.send(`${rollerMember}`);
            
            const tutorialEmbed = new EmbedBuilder()
                .setTitle('[TUTORIAL MODE]')
                .setDescription(
                    `> > > Please Hold > > >\n` +
                    `Game Beginning Shortly\n\n` +
                    `Reach the next level for complete tutorial and unlock the full server!`
                )
                .setColor(0x00FF00) // Green color
                .setTimestamp();
            
            await newGachaChannel.send({ embeds: [tutorialEmbed] });
            console.log(`📚 Sent tutorial embed for new user: ${rollerMember.user.tag}`);
            
            // Add iron pickaxe to tutorial player's inventory (if they don't already have one)
            try {
                const session = await mongoose.startSession();
                session.startTransaction();
                
                // Find or create player's inventory
                let playerInv = await PlayerInventory.findOne({ playerId: roller.id }).session(session);
                if (!playerInv) {
                    playerInv = new PlayerInventory({ 
                        playerId: roller.id, 
                        items: [] 
                    });
                }
                
                // Check if iron pickaxe already exists in inventory
                const ironPickaxeId = "7";
                const existingItemIndex = playerInv.items.findIndex(item => item.itemId === ironPickaxeId);
                
                if (existingItemIndex === -1) {
                    // Item doesn't exist, create new entry
                    const newItem = {
                        itemId: ironPickaxeId,
                        quantity: 1,
                        obtainedAt: new Date(),
                        currentDurability: 40 // Full durability for worn iron pickaxe
                    };
                    playerInv.items.push(newItem);
                    
                    await playerInv.save({ session });
                    await session.commitTransaction();
                    session.endSession();
                    
                    console.log(`⛏️ Added iron pickaxe to tutorial player inventory: ${rollerMember.user.tag}`);
                } else {
                    await session.commitTransaction();
                    session.endSession();
                    console.log(`⛏️ Tutorial player already has iron pickaxe: ${rollerMember.user.tag}`);
                }
            } catch (inventoryError) {
                console.error(`Error adding iron pickaxe to tutorial player inventory:`, inventoryError);
            }
        } else {
            // Only generate shop for non-tutorial channels
            await generateShop(newGachaChannel, 0.5);
        }

    } catch (err) {
        console.error('Error creating or assigning VC:', err);
        await gachaRollChannel.send(`${rollerMember} Something went wrong making your VC.`)
        .then(sentMessage => {
            registerBotMessage(sentMessage.guild.id, sentMessage.channel.id, sentMessage.id, 5); // 5 minutes expiry
        })
        .catch(console.error);
    }
};

function pickRandomChannelWeighted(channels) {
    const totalWeight = channels.reduce((sum, ch) => sum + ch.spawnWeight, 0);
    let random = Math.random() * totalWeight;

    for (const channel of channels) {
        if (random <= channel.spawnWeight) {
            return channel;
        }
        random -= channel.spawnWeight;
    }
    
    // Fallback to last channel if something goes wrong
    return channels[channels.length - 1];
}
