// patterns/digDeeperListener.js
// Listener for the "Dig Deeper" button when conditions aren't met

const { EmbedBuilder } = require('discord.js');

// Collection of narration messages for failed dig attempts
// Using {player} as placeholder for player name
const narrationMessages = [
    "{player}'s pickaxe left no mark on the ground.",
    "{player}'s pick helplessly bounced out of their hand.",
    "The cavern floor echoed beneath {player}, yet nothing changed.",
    "{player} strikes with all their might, but the earth refuses to yield.",
    "The ground seems to laugh at {player}'s futile attempts.",
    "{player}'s pickaxe clangs uselessly against the impenetrable floor.",
    "Despite {player}'s efforts, the mine floor remains unchanged.",
    "{player} swings and swings, but it's as if they're hitting solid bedrock.",
    "The earth here is different... ancient... unyielding to {player}'s attempts.",
    "{player}'s pickaxe rebounds with such force they nearly lose their grip.",
    "The floor here is harder than any material {player} has encountered.",
    "{player}'s strike creates sparks, but no progress.",
    "The mine seems to resist {player}'s every attempt to go deeper.",
    "{player} feels the vibrations travel up their arms, but the ground doesn't budge.",
    "It's as if an invisible force prevents {player} from digging any deeper.",
    "{player}'s pickaxe meets an impossibly dense layer of stone.",
    "The sound of {player}'s strike echoes hollowly through the cavern.",
    "{player} chips away for what feels like hours with no visible progress.",
    "The floor beneath {player} might as well be made of diamond.",
    "{player}'s best strike barely scratches the surface.",
    "The mine floor here defies all geological understanding, resisting {player}.",
    "{player} wonders if they've reached the limits of what mortals can excavate.",
    "{player}'s pickaxe feels heavier with each failed attempt.",
    "The ground here has been compressed by eons of pressure, defeating {player}.",
    "Even {player}'s strongest blow fails to make a dent."
];

class DigDeeperListener {
    constructor(client) {
        this.client = client;
        this.initialize();
    }

    /**
     * Initialize the listener
     */
    initialize() {
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            
            // Check if this is a dig deeper button for unmet conditions (red button)
            if (interaction.customId.startsWith('dig_mystery_')) {
                await this.handleDigDeeperMystery(interaction);
            }
            // Check if this is a successful dig deeper button (green button)
            else if (interaction.customId.startsWith('dig_deeper_')) {
                await this.handleDigDeeperSuccess(interaction);
            }
        });
        
        console.log('[DIG_DEEPER_LISTENER] Dig deeper listener initialized for both red and green buttons');
    }

    /**
     * Handle the dig deeper button interaction when conditions aren't met
     * @param {Interaction} interaction - The button interaction
     */
    async handleDigDeeperMystery(interaction) {
        try {
            // Defer the update instead of reply
            await interaction.deferUpdate();
            
            // Get the player's display name
            const playerName = interaction.member?.displayName || interaction.user.username || 'A miner';
            
            // Get a random narration message and replace placeholder
            const narrationTemplate = narrationMessages[Math.floor(Math.random() * narrationMessages.length)];
            const narration = narrationTemplate.replace(/{player}/g, playerName);
            
            // Get the existing message and embed
            const message = interaction.message;
            if (!message || !message.embeds || message.embeds.length === 0) {
                console.error('[DIG_DEEPER_MYSTERY] No embed found on message');
                return;
            }
            
            const existingEmbed = message.embeds[0];
            
            // Get current description (event log)
            let currentDescription = existingEmbed.description || '';
            currentDescription = currentDescription.replace(/^```\n?|```$/g, ''); // Remove code block markers
            
            // Parse existing lines
            const lines = currentDescription.split('\n').filter(line => line.trim());
            
            // Add the new narration as an event
            const newEvent = `⛏️ ${narration}`;
            
            // Keep only last 12 events (same as logEvent function)
            if (lines.length >= 12) {
                lines.shift(); // Remove oldest event
            }
            lines.push(newEvent);
            lines.push('-------------------------------'); // Add separator like other events
            
            // Rebuild description with code block
            const newDescription = '```\n' + lines.join('\n') + '\n```';
            
            // Create updated embed maintaining all other fields
            const updatedEmbed = new EmbedBuilder()
                .setTitle(existingEmbed.title || '🗺️ MINING MAP')
                .setColor(existingEmbed.color || 0x8B4513)
                .setDescription(newDescription)
                .setTimestamp();
            
            // Preserve footer if it exists
            if (existingEmbed.footer) {
                updatedEmbed.setFooter({ 
                    text: existingEmbed.footer.text || 'MINECART: Empty'
                });
            }
            
            // Preserve image if it exists
            if (existingEmbed.image) {
                updatedEmbed.setImage(existingEmbed.image.url);
            }
            
            // Copy any additional fields (like the Deeper Level Progress field)
            if (existingEmbed.fields && existingEmbed.fields.length > 0) {
                for (const field of existingEmbed.fields) {
                    updatedEmbed.addFields({
                        name: field.name,
                        value: field.value,
                        inline: field.inline || false
                    });
                }
            }
            
            // Edit the message with updated embed, keeping the same components
            await interaction.editReply({
                embeds: [updatedEmbed],
                components: message.components || []
            });
            
        } catch (error) {
            console.error('[DIG_DEEPER_MYSTERY] Error handling interaction:', error);
            
            // Try to respond with error if possible
            try {
                // Since we deferred update, we can't reply normally
                // Just log the error and fail silently from user perspective
                console.error('[DIG_DEEPER_MYSTERY] Failed to update embed:', error.message);
            } catch (replyError) {
                console.error('[DIG_DEEPER_MYSTERY] Error sending error message:', replyError);
            }
        }
    }
}

module.exports = DigDeeperListener;
