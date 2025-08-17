const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const generateVoiceChannelImage = require('../patterns/generateLocationImage'); // your function file

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gacha-image')
        .setDescription('Generate an image of everyone in your voice channel'),
        
    async execute(interaction) {
        await interaction.deferReply(); // give bot time to process

        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.editReply('❌ You must be in a voice channel to use this.');
        }

        // Adjust paths for your assets
        const backgroundPath = path.join(__dirname, '../assets/gachaLocations/placeHolder.png');
        const maskPath = 'placeHolder_character_map.png';
        const holderPath = path.join(__dirname, '../assets/gachaLocations/placeHolder_legs.png');
        const scale = 0.7;

        try {
            const buffer = await generateVoiceChannelImage(voiceChannel, backgroundPath, maskPath, holderPath,  scale, minDistance = 70, holderOffset = -20);
            const attachment = new AttachmentBuilder(buffer, { name: 'gacha-image.png' });

            await interaction.editReply({ content: '🎉 Here is your gacha image!', files: [attachment] });
        } catch (err) {
            console.error('❌ Failed to generate image:', err);
            await interaction.editReply('⚠ An error occurred while generating the image.');
        }
    }
};
