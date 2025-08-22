// AI Dialogue Generator - Generates contextual customer dialogue using OpenAI
// This module creates dynamic, personality-driven dialogue for inn customers

const OpenAI = require('openai');
require('dotenv').config();

class AIDialogueGenerator {
    constructor() {
        // Initialize OpenAI client from .env
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        // Inn and area details - customize these for your setting
        this.innDetails = {
            name: "The Pickaxe & Ale",
            location: "Mining District, Lower Quarter",
            atmosphere: "Cozy but worn, frequented by miners and travelers",
            specialties: ["Hearty Miner's Stew", "Dwarven Ale", "Rock Bread"],
            currentTime: this.getTimeOfDay(),
            currentWeather: this.getRandomWeather(),
            recentEvents: [
                "A rich vein of silver was discovered in the eastern tunnels",
                "The mine elevator broke down yesterday, causing delays",
                "New safety regulations were announced by the Mining Guild",
                "Strange glowing crystals were found in the deep shafts"
            ]
        };
    }

    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 6) return "late night";
        if (hour < 12) return "morning";
        if (hour < 17) return "afternoon";
        if (hour < 21) return "evening";
        return "night";
    }

    getRandomWeather() {
        const weather = ["foggy", "rainy", "clear", "dusty from the mines", "cold and damp", "unusually warm"];
        return weather[Math.floor(Math.random() * weather.length)];
    }

    /**
     * Generate dialogue for an NPC customer
     * @param {Object} npc - NPC data object
     * @param {Object} item - Item being purchased
     * @param {number} price - Price being paid
     * @param {Object} options - Additional options
     * @returns {Promise<string>} Generated dialogue
     */
    async generateNPCDialogue(npc, item, price, options = {}) {
        try {
            const recentEvent = this.innDetails.recentEvents[
                Math.floor(Math.random() * this.innDetails.recentEvents.length)
            ];

            const prompt = `You are ${npc.name}, ${npc.description}.
            
Setting: You're at ${this.innDetails.name} inn in the ${this.innDetails.location}. 
It's ${this.innDetails.currentTime} and the weather is ${this.innDetails.currentWeather}.
Recent local news: ${recentEvent}

Your personality traits:
- Budget level: ${npc.budget}
- Typical tip behavior: ${npc.tipModifier > 1 ? 'generous' : npc.tipModifier < 0.5 ? 'stingy' : 'average'}
- Frequency of visits: ${npc.frequency}

You are purchasing: ${item.name} for ${price} coins
${options.tip ? `You're leaving a ${options.tip} coin tip.` : ''}
${options.isHungry ? "You're particularly hungry/thirsty today." : ''}
${options.mood ? `Your current mood: ${options.mood}` : ''}

Generate a single line of dialogue (1-2 sentences max) that this character would say while making this purchase. 
The dialogue should:
- Reflect your personality and background
- Possibly reference the item, price, weather, time of day, or recent events
- Be natural and conversational
- Stay in character

Respond with ONLY the dialogue, no quotation marks or attribution.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 60,
                temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.9,
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('[AIDialogue] Error generating NPC dialogue:', error.message);
            // Fallback to existing dialogue if API fails
            if (npc.dialogue && npc.dialogue.length > 0) {
                return npc.dialogue[Math.floor(Math.random() * npc.dialogue.length)];
            }
            return "I'll take one of those, please.";
        }
    }

    /**
     * Generate dialogue for a player customer
     * @param {Object} player - Player data (username, etc.)
     * @param {Object} item - Item being purchased
     * @param {number} price - Price being paid
     * @param {Object} options - Additional options
     * @returns {Promise<string>} Generated dialogue
     */
    async generatePlayerDialogue(player, item, price, options = {}) {
        try {
            const prompt = `Generate a brief customer comment at an inn called ${this.innDetails.name}.

Context:
- Customer name: ${player.username || 'Adventurer'}
- Purchasing: ${item.name} for ${price} coins
- Time: ${this.innDetails.currentTime}
- Weather: ${this.innDetails.currentWeather}
- Inn atmosphere: ${this.innDetails.atmosphere}
${options.tip ? `- Leaving a generous ${options.tip} coin tip` : ''}
${options.previousPurchases ? `- Regular customer who has been here ${options.previousPurchases} times before` : '- New customer'}
${options.playerClass ? `- Character class/profession: ${options.playerClass}` : ''}

Generate a single brief comment (1 sentence) that a customer might say. It should be:
- Natural and conversational
- Possibly reference the item, inn, weather, or how their day is going
- Friendly and appropriate for a fantasy inn setting
- Different each time

Respond with ONLY the dialogue, no quotation marks.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 40,
                temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.95,
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('[AIDialogue] Error generating player dialogue:', error.message);
            // Fallback dialogue
            const fallbacks = [
                "Thanks, this is exactly what I needed!",
                "Perfect timing, I was getting hungry.",
                "This place never disappoints!",
                "Keep the change, friend.",
                "Best inn in the district!"
            ];
            return fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }
    }

    /**
     * Generate contextual event dialogue (for special occasions)
     * @param {string} eventType - Type of event
     * @param {Object} context - Event context
     * @returns {Promise<string>} Generated dialogue
     */
    async generateEventDialogue(eventType, context) {
        try {
            let prompt = '';
            
            switch(eventType) {
                case 'rush_hour':
                    prompt = `The inn is packed during ${this.innDetails.currentTime} rush hour. Generate a brief comment from a hurried customer who just wants quick service. One sentence only.`;
                    break;
                case 'big_tipper':
                    prompt = `A wealthy customer is leaving an exceptionally large ${context.tip} coin tip. Generate their generous comment about the service or establishment. One sentence only.`;
                    break;
                case 'complaint':
                    prompt = `A difficult customer is complaining about ${context.issue || 'something'}. Generate their grumpy comment. Keep it mild and one sentence.`;
                    break;
                case 'celebration':
                    prompt = `Customers are celebrating ${context.occasion || 'a successful mining expedition'}. Generate an enthusiastic comment from one of them. One sentence only.`;
                    break;
                default:
                    return null;
            }

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 40,
                temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.9,
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('[AIDialogue] Error generating event dialogue:', error.message);
            return null;
        }
    }

    /**
     * Update inn details (for dynamic world events)
     * @param {Object} updates - Updates to inn details
     */
    updateInnDetails(updates) {
        this.innDetails = { ...this.innDetails, ...updates };
    }

    /**
     * Add a recent event to the inn's context
     * @param {string} event - Event description
     */
    addRecentEvent(event) {
        this.innDetails.recentEvents.unshift(event);
        // Keep only the 5 most recent events
        if (this.innDetails.recentEvents.length > 5) {
            this.innDetails.recentEvents.pop();
        }
    }

    /**
     * Check if AI is available and configured
     * @returns {boolean} Whether AI dialogue generation is available
     */
    isAvailable() {
        return !!process.env.OPENAI_API_KEY;
    }
}

module.exports = AIDialogueGenerator;