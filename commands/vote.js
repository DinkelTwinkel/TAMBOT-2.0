const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction, Client } = require('discord.js');
const Vote = require('../models/votes'); // your vote schema
const gachaVC = require('../models/activevcs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for a suspect in the thief game')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('Select a member to vote for (leave empty to clear vote/vote for shop keeper)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('shopkeeper')
                .setDescription('Vote for the Shop Keeper NPC')
                .setRequired(false)
        ),

    /**
     * @param {CommandInteraction} interaction 
     * @param {Client} client 
     */
    async execute(interaction, client) {
        const voterId = interaction.user.id;
        const channelId = interaction.channelId;
        const target = interaction.options.getUser('target');
        const voteShopkeeper = interaction.options.getBoolean('shopkeeper');

        // Check if there's an active thief event in this channel
        const vcEntry = await gachaVC.findOne({ channelId: channelId });
        if (!vcEntry?.gameData?.specialEvent || vcEntry.gameData.specialEvent.type !== 'thief') {
            return interaction.reply({ 
                content: "There's no active thief event in this channel.", 
                ephemeral: true 
            });
        }

        // Check if the user has a vote record (they should if there's an active event)
        let existingVote = await Vote.findOne({ userId: voterId, channelId: channelId });

        // If no vote exists, create one (in case they joined after event started)
        if (!existingVote) {
            existingVote = await Vote.create({
                channelId: channelId,
                userId: voterId,
                targetId: 'novote'
            });
        }

        // Handle different voting scenarios
        if (voteShopkeeper) {
            // Explicitly voting for the shop keeper
            existingVote.targetId = 'shopkeeper-npc';
            await existingVote.save();
            return interaction.reply({ 
                content: `You have voted for the 🏪 **Shop Keeper**!\n⚠️ *If you're wrong, you'll lose 5% of your wealth!*`, 
                ephemeral: false 
            });
        } else if (target) {
            // Voting for a specific player
            
            // Prevent voting for self
            if (target.id === voterId) {
                return interaction.reply({ 
                    content: "You cannot vote for yourself.", 
                    ephemeral: true 
                });
            }

            // Prevent voting for bots
            if (target.bot) {
                return interaction.reply({ 
                    content: "You cannot vote for bots.", 
                    ephemeral: true 
                });
            }

            // Check if target is in the voice channel
            const guild = interaction.guild;
            const member = await guild.members.fetch(target.id).catch(() => null);
            const voiceChannel = interaction.member.voice.channel;
            
            if (!voiceChannel) {
                return interaction.reply({ 
                    content: "You need to be in the voice channel to vote.", 
                    ephemeral: true 
                });
            }
            
            if (!member || member.voice.channelId !== voiceChannel.id) {
                return interaction.reply({ 
                    content: "That person is not in the voice channel with you.", 
                    ephemeral: true 
                });
            }

            existingVote.targetId = target.id;
            await existingVote.save();
            return interaction.reply({ 
                content: `You have voted for **${target.username}**!`, 
                ephemeral: false 
            });
        } else {
            // No target specified - clear vote (defaults to shop keeper)
            existingVote.targetId = 'novote';
            await existingVote.save();
            return interaction.reply({ 
                content: `You have cleared your vote. *(No vote defaults to voting for the Shop Keeper)*\n⚠️ *If the Shop Keeper is innocent, you'll lose 5% of your wealth!*`, 
                ephemeral: false 
            });
        }
    }
};
