const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { NPC_TYPES, NPC_CONFIGS, canSummonNPC, summonNPC, getPlayerNPCStatus } = require('../patterns/gachaModes/mining/npcHelperSystem');
const GachaVC = require('../models/activevcs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('npc')
        .setDescription('Manage your NPC helpers (requires Crown of the Forgotten King)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('summon')
                .setDescription('Summon an NPC helper')
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Type of NPC to summon')
                        .setRequired(true)
                        .addChoices(
                            { name: '⛏️ Royal Miner - Helps mine walls and find ore', value: NPC_TYPES.MINER },
                            { name: '🔍 Royal Scout - Reveals map and finds treasures', value: NPC_TYPES.SCOUT },
                            { name: '🛡️ Royal Guard - Protects against hazards', value: NPC_TYPES.GUARD },
                            { name: '💰 Royal Merchant - Buys ore at premium prices', value: NPC_TYPES.MERCHANT }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check your active NPCs')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('View information about NPC types')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const channel = interaction.channel;
        const user = interaction.user;

        // Check if this is a mining channel
        const gachaVC = await GachaVC.findOne({ channelId: channel.id }).lean();
        if (!gachaVC) {
            return interaction.reply({ content: '❌ This command can only be used in active mining channels!', ephemeral: true });
        }

        try {
            switch (subcommand) {
                case 'summon':
                    await handleSummonNPC(interaction, gachaVC);
                    break;
                case 'status':
                    await handleNPCStatus(interaction, gachaVC);
                    break;
                case 'info':
                    await handleNPCInfo(interaction);
                    break;
            }
        } catch (error) {
            console.error('[NPC Command] Error:', error);
            await interaction.reply({ content: '❌ An error occurred while processing the NPC command.', ephemeral: true });
        }
    }
};

async function handleSummonNPC(interaction, gachaVC) {
    const npcType = interaction.options.getString('type');
    const user = interaction.user;
    const channel = interaction.channel;

    // Check if player can summon this NPC type
    const canSummon = await canSummonNPC(user.id, npcType);
    if (!canSummon) {
        const config = NPC_CONFIGS[npcType];
        return interaction.reply({
            content: `❌ You cannot summon ${config.name}!\n\n**Requirements:**\n• Crown of the Forgotten King equipped\n• ${Math.floor(config.cooldown / (60 * 60 * 1000))} hour cooldown completed`,
            ephemeral: true
        });
    }

    // Get map data from the database entry
    const mapData = gachaVC.gameData?.mapData;
    if (!mapData) {
        return interaction.reply({ content: '❌ No active mining map found!', ephemeral: true });
    }

    // Summon the NPC
    const result = await summonNPC(user.id, user.displayName, channel.id, npcType, mapData);
    
    if (result.success) {
        const config = NPC_CONFIGS[npcType];
        const embed = new EmbedBuilder()
            .setTitle(`${config.emoji} NPC Summoned!`)
            .setDescription(`**${config.name}** has been summoned to assist you!`)
            .addFields(
                { name: 'Description', value: config.description, inline: false },
                { name: 'Duration', value: `${Math.floor(config.duration / 60000)} minutes`, inline: true },
                { name: 'Cooldown', value: `${Math.floor(config.cooldown / (60 * 60 * 1000))} hours`, inline: true }
            )
            .setColor('Purple')
            .setFooter({ text: 'Your NPC will work automatically while you mine!' });

        await interaction.reply({ embeds: [embed] });
        
        // Announce to the channel
        await channel.send(`👑 ${user.displayName} has summoned ${config.emoji} **${config.name}** to assist in the mines!`);
    } else {
        await interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
    }
}

async function handleNPCStatus(interaction, gachaVC) {
    const user = interaction.user;
    const channel = interaction.channel;

    const playerNPCs = getPlayerNPCStatus(user.id, channel.id);
    
    if (playerNPCs.length === 0) {
        return interaction.reply({ content: '📋 You have no active NPCs.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('👥 Your Active NPCs')
        .setColor('Blue')
        .setFooter({ text: 'NPCs work automatically while you mine!' });

    for (const npc of playerNPCs) {
        const timeLeft = Math.max(0, npc.expiresAt - Date.now());
        const minutesLeft = Math.floor(timeLeft / 60000);
        
        embed.addFields({
            name: `${npc.emoji} ${npc.name}`,
            value: `**Time Left:** ${minutesLeft} minutes\n**Actions:** ${npc.actions}\n**Items Found:** ${npc.itemsFound.length}\n**Coins Earned:** ${npc.coinsEarned}`,
            inline: true
        });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleNPCInfo(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('👑 Royal NPC Helpers')
        .setDescription('Available to players with the **Crown of the Forgotten King**')
        .setColor('Gold');

    for (const [type, config] of Object.entries(NPC_CONFIGS)) {
        const abilities = Object.entries(config.abilities)
            .map(([key, value]) => `${key}: ${typeof value === 'number' ? (value > 1 ? `${value}x` : `${Math.round(value * 100)}%`) : value}`)
            .join(', ');

        embed.addFields({
            name: `${config.emoji} ${config.name}`,
            value: `${config.description}\n**Duration:** ${Math.floor(config.duration / 60000)} min\n**Cooldown:** ${Math.floor(config.cooldown / (60 * 60 * 1000))} hrs\n**Abilities:** ${abilities}`,
            inline: true
        });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}
