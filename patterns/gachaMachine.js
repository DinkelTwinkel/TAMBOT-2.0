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

const channelsFile = path.join(__dirname, '../data/gachaServers.json');
const channelData = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));


module.exports = async (roller, guild, parentCategory, gachaRollChannel) => {

    let guildConfig = await GuildConfig.findOne({ guildId: guild.id });

    console.log (guildConfig);

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
                await roller.setChannel(existingVC);
                
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
                const chosenChannelType = channelData.find(ch => ch.id == storedTypeId); // Use == for type coercion
                
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
                        });

                        await roller.setChannel(newGachaChannel);

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
        });

        await roller.setChannel(newGachaChannel);

        // Now store VC data on the mongodb
        const storeVC = new ActiveVCS ({
            channelId: newGachaChannel.id,
            guildId: guild.id,
            typeId: 0,
            nextTrigger: new Date(Date.now() + 1000 * 30), // 30 second delay before events start.
            nextShopRefresh: new Date(Date.now() + 1000 * 60 * 25), 
            nextLongBreak: new Date(Date.now() + 60 * 1000 * 100),
        })

        await storeVC.save();

        // roll for VC type > then update the storeVC to match it.
        const chosenChannelType = pickRandomChannelWeighted(channelData);

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

        await gachaRollChannel.send(
            `**${rollerMember.user.tag}** Inserted ${rollPrice} Coins! Your rolling booth is ready: **${newGachaChannel.name}**\n` +
            `⏰ Next roll available in **60 minutes**.`
        )

        await newGachaChannel.send(
            `${rollerMember} You've found the ${chosenChannelType.name}!\n` +
            `⏰ **Note:** You can only roll for a new VC once per hour. Your next roll will be available at <t:${Math.floor(cooldownExpiry.getTime() / 1000)}:t>.`
        );

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
        if (random < channel.spawnWeight) {
            return channel;
        }
        random -= channel.spawnWeight;
    }
}
