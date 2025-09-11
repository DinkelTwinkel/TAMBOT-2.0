const fs = require('fs');
const path = require('path');
const { ChannelType, NewsChannel } = require('discord.js');
const messageDeletus = require('../models/tidyMessages'); // Adjust path accordingly
const ActiveVCS =  require ('../models/activevcs');
const createCurrencyProfile = require('../patterns/currency/createCurrencyProfile');
const registerBotMessage = require('./registerBotMessage');
const Cooldown = require('../models/coolDowns');

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

    // Check if user has an active roll cooldown
    let userCooldown = await Cooldown.findOne({ userId: roller.id });
    
    if (userCooldown && userCooldown.gachaRollData && userCooldown.gachaRollData.expiresAt) {
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
        const DEBUG_USER_ID = "865147754358767627";
        const DEBUG_CHANNEL_ID = 4001; // Change this to the channel ID you want for debugging (e.g., 16 for gullet)
        
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

        // Update VC name to the selected VC and create the intro message
        await newGachaChannel.setName('『 ' + chosenChannelType.rarity.toUpperCase() + ' ROLL 』');
        await new Promise(r => setTimeout(r, 1500));
        await newGachaChannel.setName(`${chosenChannelType.name}`);
        console.log(`🎉 Gacha rolled [${chosenChannelType.rarity.toUpperCase()}]: ${chosenChannelType.name}`);
        console.log(`Created VC ${newGachaChannel.name} for ${rollerMember.user.tag}`);

        // Store the roll in cooldowns (1 hour cooldown)
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
            await gachaRollChannel.send(
                `**${rollerMember.user.tag}** Inserted ${rollPrice} Coins! Your rolling booth is ready: **${newGachaChannel.name}**\n` +
                `⏰ Next roll available in **60 minutes**.`
            );
        }

        // Send special message in the VC based on override type
        if (debugOverride) {
            await newGachaChannel.send(
                `🔧 ${rollerMember} **DEBUG MODE ACTIVE** 🔧\n` +
                `You've been spawned in ${chosenChannelType.name} for debugging purposes!\n` +
                `⏰ **Note:** You can only roll for a new VC once per hour. Your next roll will be available at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.`
            );
        } else if (sanityOverride && chosenChannelType.id == 16) {
            await newGachaChannel.send(
                `🧠💀 ${rollerMember} **YOUR MIND UNRAVELS!** 🧠💀\n` +
                `Your sanity (${playerSanity}) has led you to ${chosenChannelType.name}! The whispers grow louder...\n` +
                `⏰ **Note:** You can only roll for a new VC once per hour. Your next roll will be available at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.`
            );
        } else if (sacrificeData && sacrificeData.isSacrificing && chosenChannelType.id == 16) {
            await newGachaChannel.send(
                `🔥 ${rollerMember} **THE SACRIFICE DEMANDS YOUR PRESENCE!** 🔥\n` +
                `You've been forcefully drawn into ${chosenChannelType.name}!\n` +
                `⏰ **Note:** You can only roll for a new VC once per hour. Your next roll will be available at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.`
            );
        } else {
            await newGachaChannel.send(
                `${rollerMember} You've found the ${chosenChannelType.name}!\n` +
                `⏰ **Note:** You can only roll for a new VC once per hour. Your next roll will be available at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.`
            );
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

        await generateShop(newGachaChannel, 0.5);

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
