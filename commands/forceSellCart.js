// Example: How to integrate debug commands into your bot

// 1. For Discord slash commands (Discord.js v14)
const { SlashCommandBuilder } = require('discord.js');
const { forceSellMineCart, getMineCartDetails } = require('../patterns/gachaModes/miningDebugUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mining-debug')
        .setDescription('Mining system debug commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('forcesell')
                .setDescription('Force sell mine cart contents')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Voice channel to target')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cartinfo')
                .setDescription('Get mine cart details')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Voice channel to check')
                        .setRequired(false))),
    
    async execute(interaction) {
        // Admin check
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return interaction.reply({ 
                content: '❌ Admin only command', 
                ephemeral: true 
            });
        }
        
        const subcommand = interaction.options.getSubcommand();
        const channel = interaction.options.getChannel('channel') || interaction.member.voice?.channel;
        
        if (!channel) {
            return interaction.reply({ 
                content: '❌ Please specify a channel or join a voice channel', 
                ephemeral: true 
            });
        }
        
        if (subcommand === 'forcesell') {
            await interaction.deferReply();
            const result = await forceSellMineCart(channel);
            
            if (result.success) {
                await interaction.editReply(
                    `✅ **Force Sell Complete**\n` +
                    `📦 Items Sold: ${result.itemsSold}\n` +
                    `💰 Total Value: ${result.totalValue} coins\n` +
                    `📍 Channel: ${channel.name}`
                );
            } else {
                await interaction.editReply(`❌ Error: ${result.error}`);
            }
        }
        
        if (subcommand === 'cartinfo') {
            const details = await getMineCartDetails(channel.id);
            
            if (!details) {
                return interaction.reply({ 
                    content: '❌ No mine cart data found', 
                    ephemeral: true 
                });
            }
            
            let response = `**Mine Cart Details for ${channel.name}**\n`;
            response += `📦 Total Items: ${details.totalItems}\n`;
            response += `💰 Total Value: ${details.totalValue} coins\n\n`;
            
            for (const [playerId, playerData] of Object.entries(details.players)) {
                const member = interaction.guild.members.cache.get(playerId);
                const name = member?.displayName || 'Unknown Player';
                response += `**${name}**: ${playerData.totalItems} items (${playerData.totalValue} coins)\n`;
            }
            
            await interaction.reply({ content: response, ephemeral: true });
        }
    }
};

// 2. For text-based commands (traditional prefix commands)
module.exports.handleDebugCommand = async (message, args) => {
    const debugUtils = require('./patterns/gachaModes/miningDebugUtils');
    
    // Parse command
    const action = args[0]?.toLowerCase();
    
    switch(action) {
        case 'sell':
        case 'forcesell': {
            const channel = message.member.voice?.channel;
            if (!channel) {
                return message.reply('❌ Join a voice channel first');
            }
            
            const result = await debugUtils.forceSellMineCart(channel);
            if (result.success) {
                message.reply(`✅ Sold ${result.itemsSold} items for ${result.totalValue} coins`);
            } else {
                message.reply(`❌ ${result.error}`);
            }
            break;
        }
        
        case 'info':
        case 'details': {
            const channelId = args[1] || message.member.voice?.channel?.id;
            if (!channelId) {
                return message.reply('❌ Provide channel ID or join a voice channel');
            }
            
            const details = await debugUtils.getMineCartDetails(channelId);
            if (details) {
                message.reply(`📦 Cart has ${details.totalItems} items worth ${details.totalValue} coins`);
            } else {
                message.reply('❌ No cart data found');
            }
            break;
        }
        
        case 'clear': {
            const channelId = args[1] || message.member.voice?.channel?.id;
            const success = await debugUtils.clearMineCart(channelId);
            message.reply(success ? '✅ Cart cleared' : '❌ Failed to clear cart');
            break;
        }
        
        case 'end': {
            const channel = message.member.voice?.channel;
            if (!channel) {
                return message.reply('❌ Join a voice channel first');
            }
            
            const result = await debugUtils.forceEndMiningSession(channel);
            if (result.success) {
                message.reply(`✅ Session ended. Distributed ${result.itemsSold} items worth ${result.totalValue} coins`);
            } else {
                message.reply(`❌ ${result.error}`);
            }
            break;
        }
        
        case 'additem': {
            // !mining-debug additem <channelId> <playerId> <itemId> <quantity>
            const [, channelId, playerId, itemId, quantity] = args;
            if (!channelId || !playerId || !itemId || !quantity) {
                return message.reply('❌ Usage: !mining-debug additem <channelId> <playerId> <itemId> <quantity>');
            }
            
            const success = await debugUtils.addTestItemToCart(
                channelId, 
                playerId, 
                itemId, 
                parseInt(quantity)
            );
            message.reply(success ? '✅ Item added' : '❌ Failed to add item');
            break;
        }
        
        default:
            message.reply(
                '**Mining Debug Commands:**\n' +
                '`forcesell` - Force sell cart contents\n' +
                '`info [channelId]` - Get cart details\n' +
                '`clear [channelId]` - Clear cart without selling\n' +
                '`end` - End mining session\n' +
                '`additem <channelId> <playerId> <itemId> <qty>` - Add test item'
            );
    }
};

// 3. Console/REPL usage for direct debugging
async function debugConsoleCommands(client) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const debugUtils = require('./patterns/gachaModes/miningDebugUtils');
    
    console.log('Mining Debug Console Ready. Commands: forcesell, info, clear, end, quit');
    
    rl.on('line', async (input) => {
        const [cmd, ...args] = input.trim().split(' ');
        
        switch(cmd) {
            case 'forcesell': {
                const channelId = args[0];
                if (!channelId) {
                    console.log('Usage: forcesell <channelId>');
                    break;
                }
                
                const channel = client.channels.cache.get(channelId);
                if (!channel) {
                    console.log('Channel not found');
                    break;
                }
                
                const result = await debugUtils.forceSellMineCart(channel);
                console.log(result.success ? 
                    `Success! Sold ${result.itemsSold} items for ${result.totalValue} coins` :
                    `Error: ${result.error}`
                );
                break;
            }
            
            case 'info': {
                const channelId = args[0];
                if (!channelId) {
                    console.log('Usage: info <channelId>');
                    break;
                }
                
                const details = await debugUtils.getMineCartDetails(channelId);
                if (details) {
                    console.log('Mine Cart Details:');
                    console.log(`Total: ${details.totalItems} items, ${details.totalValue} coins`);
                    console.log('Players:', Object.keys(details.players).length);
                } else {
                    console.log('No cart data found');
                }
                break;
            }
            
            case 'clear': {
                const channelId = args[0];
                const success = await debugUtils.clearMineCart(channelId);
                console.log(success ? 'Cart cleared' : 'Failed to clear cart');
                break;
            }
            
            case 'quit':
                rl.close();
                break;
                
            default:
                console.log('Unknown command. Use: forcesell, info, clear, quit');
        }
    });
}

// Export for use
module.exports.debugConsoleCommands = debugConsoleCommands;