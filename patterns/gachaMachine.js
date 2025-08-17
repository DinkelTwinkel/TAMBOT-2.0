const fs = require('fs');
const path = require('path');
const { ChannelType, NewsChannel } = require('discord.js');
const messageDeletus = require('../models/tidyMessages'); // Adjust path accordingly
const ActiveVCS =  require ('../models/activevcs');
const createCurrencyProfile = require('../patterns/currency/createCurrencyProfile');
const registerBotMessage = require('./registerBotMessage');

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const generateShop = require('./generateShop');
const GuildConfig = require('../models/GuildConfig');

const channelsFile = path.join(__dirname, '../data/gachaServers.json');
const channelData = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));


module.exports = async (roller, guild, parentCategory, gachaRollChannel) => {

    const rollPrice = (await GuildConfig.findOne({ guildId: guild.id }))?.gachaCost ?? 0;

    gachaRollChannel.setName(`🎰 𝙂𝘼𝘾𝙃𝘼 [ ${rollPrice} COINS ]`);

    const rollerMember = await guild.members.fetch(roller.id);

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

        storeVC.typeId = chosenChannelType.id;
        await storeVC.save();

        // Update VC name to the selected VC and create the intro message
        await newGachaChannel.setName('『 ' + chosenChannelType.rarity.toUpperCase() + ' ROLL 』');
        await new Promise(r => setTimeout(r, 1500));
        await newGachaChannel.setName(`${chosenChannelType.name}`);
        console.log(`🎉 Gacha rolled [${chosenChannelType.rarity.toUpperCase()}]: ${chosenChannelType.name}`);
        console.log(`Created VC ${newGachaChannel.name} for ${rollerMember.user.tag}`);

        await gachaRollChannel.send(`**${rollerMember.user.tag}** Your rolling booth is ready: **${newGachaChannel.name}**`)

        await newGachaChannel.send(`${rollerMember} You've found the ${chosenChannelType.name}!`);

        // Build the file path for the image
        const imagePath = path.join(__dirname, '../assets/gachaLocations', chosenChannelType.image + '.png');

        // Create the attachment
        const imageAttachment = new AttachmentBuilder(imagePath, { name: imagePath });

        // Build the embed
        const rollEmbed = new EmbedBuilder()
            .setTitle(chosenChannelType.name)
            .setDescription('```' + chosenChannelType.description + '```')
            .setFooter({ text: `Rarity: ${chosenChannelType.rarity}` })
            .setColor(chosenChannelType.colour || 'Gold') // Use custom color if set, else Gold
            .setImage(`attachment://${chosenChannelType.image}.png`); // Display the image in the embed

        // Send it in the new text channel with the attachment
        await newGachaChannel.send({ embeds: [rollEmbed], files: [imageAttachment] });

        await generateShop(newGachaChannel, 0.5);

    } catch (err) {
        console.error('Error creating or assigning VC:', err);
        await gachaRollChannel.send(`${rollerMember} Something went wrong making your VC.`)
        .then(sentMessage => {
            registerBotMessage(sentMessage.guild.id, sentMessage.channel.id, sentMessage.id);
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
