const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction, Client } = require('discord.js');
const Vote = require('../models/votes'); // your vote schema

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for another member in this channel')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('Select a member to vote for')
                .setRequired(true)
        ),

    /**
     * @param {CommandInteraction} interaction 
     * @param {Client} client 
     */
    async execute(interaction, client) {
        const voterId = interaction.user.id;
        const channelId = interaction.channelId;
        const target = interaction.options.getUser('target');

        // Prevent voting for self
        if (target.id === voterId) {
            return interaction.reply({ content: "You cannot vote for yourself.", ephemeral: true });
        }

        // Check if the user has a vote record
        const existingVote = await Vote.findOne({ userId: voterId });

        if (!existingVote || existingVote.channelId !== channelId) {
            return interaction.reply({ content: "You have nothing to vote for here.", ephemeral: true });
        }

        // Update the vote with the new target
        existingVote.targetId = target.id;
        await existingVote.save();

        return interaction.reply({ content: `You have successfully voted for ${target.tag}!`, ephemeral: false });
    }
};
