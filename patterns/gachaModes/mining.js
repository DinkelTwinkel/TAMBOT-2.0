const PlayerInventory = require('../../models/inventory');
const Currency = require('../../models/currency');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
const itemSheet = require('../../data/itemSheet.json');
const { db } = require('../../models/GuildConfig');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');


// ---------------- Embed Helper ----------------
const createMessage = description => ({ content: `\`${description}\`` });

// ---------------- Item Pool for findResource ----------------
const itemPool = [
    { itemId: "1", name: "Coal Ore", baseWeight: 50, boostedPowerLevel: 1 },
    { itemId: "2", name: "Topaz Gem", baseWeight: 20, boostedPowerLevel: 3 },
];

// ---------------- Weighted Selection ----------------
function pickWeightedItem(powerLevel) {
    const weightedItems = itemPool.map(item => {
        const weight = item.baseWeight * (powerLevel === item.boostedPowerLevel ? 10 : 1);
        return { ...item, weight };
    });
    const totalWeight = weightedItems.reduce((sum, i) => sum + i.weight, 0);
    let rand = Math.random() * totalWeight;
    return weightedItems.find(i => (rand -= i.weight) < 0) || weightedItems[0];
}

function pickEvent(events) {
    const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * totalWeight;
    return events.find(e => (rand -= e.weight) < 0)?.func || events[0].func;
}

// ---------------- Inventory Helpers ----------------
async function addToInventory(player, itemId, quantity) {
    let inv = await PlayerInventory.findOne({ playerId: player.id, playerTag: player.user.tag });
    if (!inv) {
        inv = new PlayerInventory({ playerId: player.id, playerTag: player.user.tag, items: [{ itemId, quantity }] });
    } else {
        const existing = inv.items.find(i => i.itemId === itemId);
        if (existing) existing.quantity += quantity;
        else inv.items.push({ itemId, quantity });
    }
    await inv.save();
}

async function removeFromInventory(inv, itemRef, amount = 1) {
    itemRef.quantity = Math.max(0, itemRef.quantity - amount);
    inv.items = inv.items.filter(i => i.quantity > 0);
    await inv.save();
}

// ---------------- Event Functions ----------------
async function nothingHappens(player, channel, playerStats, item) {
    // If player has no mining ability, they might scavenge

    if (!playerStats.mining || playerStats.mining <= 0) {
        if (Math.random() < 0.3) { // 30% chance to scavenge
            await channel.send(createMessage(`🪓 Scavenged! ${player.displayName} found 『 ${item.name} 』x 1 on the floor...!`));
            await addToInventory(player, item.itemId, 1);
        } else {
            await channel.send(createMessage(`❌ ${player.displayName} failed to mine anything due to not having a pickaxe...`));
        }
    } else {
        // Player has mining ability, but failed
        await channel.send(createMessage(`😐 ${player.displayName} swung at the walls but found nothing.`));
    }
}

async function giveFindResource(player, channel, powerLevel) {
    const item = pickWeightedItem(powerLevel);
    const playerStats = await getPlayerStats(player.id);

    if (playerStats.mining && playerStats.mining > 0) {
        if (Math.random() > 0.95) {
            // Small chance to fail mining
            return nothingHappens(player, channel, playerStats, item);
        }
        const quantityFound = 1 + Math.floor(Math.random() * playerStats.mining);
        await channel.send(createMessage(`⛏️ MINED! ${player.displayName} found 『 ${item.name} 』x ${quantityFound}!`));
        await addToInventory(player, item.itemId, quantityFound);
    } else {
        // Player has no pickaxe → delegate to nothingHappens which handles scavenging chance
        return nothingHappens(player, channel, playerStats, item);
    }
}

async function sellCoalEvent(player, channel) {
    try {
        const inv = await PlayerInventory.findOne({ playerId: player.id });
        if (!inv) return channel.send(createMessage(`❌ ${player.displayName} Met a Coal Trader, but had no coal to sell...`));

        const coal = inv.items.find(i => i.itemId === "1" && i.quantity > 0);
        if (!coal) return channel.send(createMessage(`❌ ${player.displayName} Met a Coal Trader, but had no coal to sell...`));

        const sellAmount = Math.ceil(coal.quantity * Math.random());
        const pricePerCoal = Math.ceil(Math.random() * 5);
        const total = sellAmount * pricePerCoal;

        coal.quantity = 0;
        inv.items = inv.items.filter(i => i.quantity > 0);
        await inv.save();

        if (Math.random() < 0.2) {
            return channel.send(createMessage(`⚠️ Scammed! ${player.displayName} tried to sell Coal, but the trader scammed them! They lost ${sellAmount} coal and gained nothing.`));
        }

        const currency = await Currency.findOne({ userId: player.id }) || new Currency({ userId: player.id, money: 0 });
        currency.money += total;
        await currency.save();

        await channel.send(createMessage(`💰 Trader Event! ${player.displayName} sold ${sellAmount} Coal for ${total} coins!`));
    } catch (err) { console.error('Error selling coal in event:', err); }
}

async function pickaxeBreakEvent(player, channel, powerLevel) {
    const playerStats = await getPlayerStats(player.id);
    if (!playerStats.mining || playerStats.mining <= 0) return giveFindResource(player, channel, powerLevel);

    const inv = await PlayerInventory.findOne({ playerId: player.id });
    if (!inv) return console.log('Cannot find player inventory');

    const miningPickaxes = inv.items
        .map(invItem => ({ ...itemSheet.find(it => String(it.id) === String(invItem.itemId)), invRef: invItem }))
        .filter(i => i?.ability === "mining");

    const rustyPickaxe = itemSheet.find(it => it.id === '3');

    if (miningPickaxes.length === 0) return nothingHappens(player, channel, playerStats, rustyPickaxe);

    const bestPickaxe = miningPickaxes.reduce((prev, curr) => (curr.powerlevel > prev.powerlevel ? curr : prev));

    const breakChance = Math.max(0.05, 0.5 - (bestPickaxe.powerlevel * 0.05));

    if (Math.random() < breakChance) {
        await removeFromInventory(inv, bestPickaxe.invRef, 1);
        await channel.send(createMessage(`💥 ${player.displayName}'s 『 ${bestPickaxe.name} 』 shattered into pieces!`));
    } else {
        await channel.send(createMessage(`⚒️ ${player.displayName} heard their 『 ${bestPickaxe.name} 』 creak... but it held together!`));
    }
}

// ---------------- Main Mining Event ----------------
const miningEvents = [
    { func: giveFindResource, weight: 60 },
    { func: sellCoalEvent, weight: 5 },
    { func: pickaxeBreakEvent, weight: 20 }
];

module.exports = async (channel, dbEntry, json, client) => {

    const now = Date.now();
    // end any active games.
    if (dbEntry.gameData !== null) {
        await endThiefGame(channel, dbEntry);
        dbEntry.gameData = null;
    }
    
    if (now > dbEntry.nextShopRefresh) dbEntry.nextShopRefresh = new Date(now + 60 * 1000 * 25);

    if (!channel?.isVoiceBased()) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (!humans.size) return;

    const powerLevel = json.power || 1;
    const timesToRun = Math.floor(Math.random() * humans.size) + 1;

    for (let i = 0; i < timesToRun; i++) {
        const winner = humans.random();
        await pickEvent(miningEvents)(winner, channel, powerLevel);
    }

    await generateShop(channel);

    if (now > dbEntry.nextLongBreak) {
        dbEntry.nextLongBreak = new Date(now + 60 * 1000 * 125);
        dbEntry.nextTrigger = new Date(now + 60 * 1000 * 25);
        channel.send ('# 25 MIN BREAK, MINING PAUSED.');

        await startThiefGame(channel, dbEntry);
    }

    await dbEntry.save();

};

const Vote = require('../../models/votes'); // import your vote schema
const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../../models/GuildConfig');

async function startThiefGame(channel, dbEntry) {
    if (!channel?.isVoiceBased()) return;

    const guild = channel.guild;

    // Get all members currently in this voice channel (excluding bots)
    const humansArray = guild.members.cache
        .filter(member => member.voice.channelId === channel.id && !member.user.bot)
        .map(member => member);

    if (humansArray.length >= 3) {
        const thief = humansArray[Math.floor(Math.random() * humansArray.length)];
        let stealAmount = 0;
        const lossDescriptions = [];

        for (const user of humansArray) {
            let userMoney = await Currency.findOne({ userId: user.id });

            if (!userMoney) {
                userMoney = await Currency.create({
                    userId: user.id,
                    usertag: user.user.tag,
                    money: 0
                });
            }

            if (userMoney.money > 0) {
                const percentToSteal = Math.floor(Math.random() * 10) + 10;
                const stolen = Math.floor((percentToSteal / 100) * userMoney.money);

                userMoney.money -= stolen;
                stealAmount += stolen;
                await userMoney.save();

                lossDescriptions.push(`${user.user.username} lost ${stolen} coins`);
            }
        }

        // Store thief info in gameData
        dbEntry.gameData = {
            gamemode: 'thief',
            thiefId: thief.id,
            amount: stealAmount
        };
        await dbEntry.save();

        // Create vote entries for each user
        for (const user of humansArray) {
            await Vote.create({
                channelId: dbEntry.channelId,
                userId: user.id,
                targetId: 'novote'
            });
        }

        // Build the public embed
        const embed = new EmbedBuilder()
            .setTitle('⚠️ THIEF ALERT! ⚠️')
            .setDescription(`In the darkness of the mines, someone has stolen eveyone's coins! Use /vote to catch the thief.\n\n` +
                            lossDescriptions.join('\n') +
                            `\n\n💰 Total stolen: ${stealAmount}`)
            .setColor(0xff0000)
            .setTimestamp();

        if (dbEntry.nextTrigger) {
            const nextTriggerSeconds = Math.floor(dbEntry.nextTrigger.getTime() / 1000);
            embed.addFields({ name: 'Hurry!', value: `The thief is getting away... <t:${nextTriggerSeconds}:R>` });
        }

        await channel.send({ embeds: [embed] });

        // DM the thief
        await thief.send(`You are the thief! You stole a total of ${stealAmount} coins. Be careful not to get caught!`)
            .catch(async () => {
                console.log(`Could not DM thief: ${thief.user.tag}`);

                try {
                    // Find guild config in MongoDB
                    const guildConfig = await GuildConfig.findOne({ guildId: thief.guild.id });
                    if (!guildConfig?.gachaRollChannelIds?.length) return;

                    // Get the first gacha roll channel ID
                    const fallbackChannelId = guildConfig.gachaRollChannelIds[0];
                    const fallbackChannel = await thief.guild.channels.fetch(fallbackChannelId);
                    if (!fallbackChannel?.isTextBased()) return;

                    // Send message mentioning the thief
                    await fallbackChannel.send(`⚠️ ${thief} I tried to send you a direct message but I could not!`);
                } catch (err) {
                    console.error('Failed to send fallback thief message:', err);
                }
            });
    } else {
        console.log('There were not enough users to start a thief game!');
    }
}

async function endThiefGame(channel, dbEntry) {
    if (!dbEntry.gameData || dbEntry.gameData.gamemode !== 'thief') return;

    const { thiefId, amount: totalStolen } = dbEntry.gameData;

    // Fetch all votes for this channel
    const votes = await Vote.find({ channelId: dbEntry.channelId });

    const embed = new EmbedBuilder()
        .setTitle('🕵️ Thief Game Results')
        .setColor(0x00ff00)
        .setTimestamp();

    let winners = [];

    if (!votes.length) {
        embed.setDescription('No votes were cast this round.');
    } else {
        const voteLines = [];

        // Announce each user's vote
        for (const vote of votes) {
            const user = await channel.guild.members.fetch(vote.userId).catch(() => null);
            const target = await channel.guild.members.fetch(vote.targetId).catch(() => null);
            if (user) {
                voteLines.push(`${user.user.username} voted for ${target ? target.user.username : 'no one'}`);
            }
        }

        embed.addFields({ name: 'Votes', value: voteLines.join('\n') || 'No votes recorded' });

        // Find all users who guessed correctly
        winners = votes.filter(v => v.targetId === thiefId);

        if (winners.length) {
            const share = Math.floor(totalStolen / winners.length);
            const winnerLines = [];

            for (const winner of winners) {
                let winnerMoney = await Currency.findOne({ userId: winner.userId });
                if (!winnerMoney) {
                    const member = await channel.guild.members.fetch(winner.userId).catch(() => null);
                    winnerMoney = await Currency.create({
                        userId: winner.userId,
                        usertag: member ? member.user.tag : 'Unknown',
                        money: 0
                    });
                }

                winnerMoney.money += share;
                await winnerMoney.save();

                winnerLines.push(`<@${winner.userId}> receives ${share} coins!`);
            }

            embed.addFields(
                { name: 'Winners', value: winnerLines.join('\n') },
                { name: 'Total Stolen', value: `${totalStolen} coins` }
            );
            embed.setTitle('📰 THIEF CAUGHT');
        } else {
            embed.addFields({ name: 'Result', value: `No one guessed correctly. The thief got away with ${totalStolen} coins.` });
        }
    }

    // Announce the thief
    const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
    if (thiefMember) {
        embed.addFields({ name: 'The Thief', value: `<@${thiefId}>` });
    }

    // Only attach jail image if thief was caught
    if (winners.length && thiefMember) {
        try {
            const avatarURL = thiefMember.displayAvatarURL({ extension: 'png', size: 512 });
            const buffer = await generateJailImage(avatarURL);

            const fileName = 'jailed.png';
            embed.setImage(`attachment://${fileName}`);
            await channel.send({ embeds: [embed], files: [{ attachment: buffer, name: fileName }] });
        } catch (error) {
            console.log(error);
            // fallback: send embed without image
            await channel.send({ embeds: [embed] });
        }
    } else {
        // Send embed normally without image
        await channel.send({ embeds: [embed] });
    }

    // Clear votes and game data
    await Vote.deleteMany({ channelId: dbEntry.channelId });
}

async function generateJailImage(avatarURL, size = 512) {
  const [avatar, bars] = await Promise.all([
    loadImage(avatarURL),
    loadImage(path.join(__dirname, '../../assets/game/jailbars.png'))
  ]);

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Draw avatar
  ctx.drawImage(avatar, 0, 0, size, size);

  // Convert avatar to grayscale
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.3 * r + 0.59 * g + 0.11 * b;

    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  ctx.putImageData(imageData, 0, 0);

  // Draw jail bars overlay
  ctx.drawImage(bars, 0, 0, size, size);

  return canvas.toBuffer();
}