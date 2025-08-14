const fs = require('fs');
const path = require('path');
const { ChannelType, NewsChannel } = require('discord.js');
const messageDeletus = require('../models/tidyMessages'); // Adjust path accordingly
const ActiveVCS =  require ('../models/activevcs');
const createCurrencyProfile = require('../patterns/currency/createCurrencyProfile');
const registerBotMessage = require('./registerBotMessage');
const rollPrice = 0;

const channelsFile = path.join(__dirname, '../data/gachaServers.json');
const channelData = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));


module.exports = async (roller, guild, parentCategory, gachaRollChannel) => {

    const rollerMember = await guild.members.fetch(roller.id);

    // step 1: do a cost check and proceed after taking payment!
    // step 2: Generate VC channel > then write it's entry into the VC database -> Set name as ROLLING //
    // step 3: Look into VC tiers data and calculate its chance based on weight?
    // get the user's profile > generate one if there isn't one. 

    const existingProfile = createCurrencyProfile(rollerMember, 0);

    if (existingProfile.money < rollPrice) {
        await roller.voice.disconnect();
        return gachaRollChannel.send(`${roller} You're broke!`);
    }

    console.log ('roll price check succeeded!');
    
    existingProfile.money -= rollPrice;
    (await existingProfile).save();

    // code to create a channel 
    // Step 2: Create a temporary VC and move the roller into it

    // get Roller's true member data 

    try {
        // Create the voice channel under the given parent category
        const newGachaChannel = await guild.channels.create({
            name: '🎲 Rolling...',
            type: ChannelType.GuildVoice,
            parent: parentCategory,
        });

        await roller.setChannel(newGachaChannel);

        // Now store vc data on the mongodb

        const storeVC = new ActiveVCS ({
            channelid: newGachaChannel.id,
            guildid: guild.id,
            typeid: 0,
        })

        await storeVC.save();

        // roll for VC type > then update the storeVC to match it.

        const chosenChannelType = pickRandomChannelWeighted(channelData);

        storeVC.typeid = chosenChannelType.id;
        await storeVC.save();

        // need to now update the vc name to the selected VC and create the intro message!
        // 

        await newGachaChannel.setName('『' + chosenChannelType.rarity.toUpperCase() + ' ROLL 』');
        await new Promise(r => setTimeout(r, 1500));
        await newGachaChannel.setName(`${chosenChannelType.name}`);
        console.log(`🎉 Gacha rolled [${chosenChannelType.rarity.toUpperCase()}]: ${chosenChannelType.name}`);

        console.log(`Created VC ${newGachaChannel.name} for ${rollerMember.user.tag}`);
        await gachaRollChannel.send(`**${rollerMember.user.tag}** Your rolling booth is ready: **${newGachaChannel.name}**`)
        .then( sentMessage => {
            registerBotMessage(sentMessage);
        })
        .catch(console.error);

    } catch (err) {
        console.error('Error creating or assigning VC:', err);
        await gachaRollChannel.send(`${rollerMember} Something went wrong making your VC.`)
        .then( sentMessage => {
            registerBotMessage(sentMessage);
        })
        .catch(console.error);
    }


};

function pickRandomChannelWeighted(channels) {
    // Calculate total weight
    const totalWeight = channels.reduce((sum, ch) => sum + ch.spawnWeight, 0);

    // Get a random number between 0 and totalWeight
    let random = Math.random() * totalWeight;

    // Loop through channels and find where the random number falls
    for (const channel of channels) {
        if (random < channel.spawnWeight) {
            return channel;
        }
        random -= channel.spawnWeight;
    }
}