// AI Dialogue Generator - Generates contextual customer dialogue using OpenAI
// Dynamically loads inn configuration based on channel and game data

const OpenAI = require('openai');
require('dotenv').config();
const GachaVC = require('../../../models/activevcs');
const gachaServers = require('../../../data/gachaServers.json');
const shops = require('../../../data/shops.json');
const itemSheet = require('../../../data/itemSheet.json');
const { UNIQUE_ITEMS } = require('../../../data/uniqueItemsSheet');

class AIDialogueGenerator {
    constructor(channelId = null) {
        // Initialize OpenAI client from .env
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        // Default inn details (fallback if no channel provided)
        this.innDetails = {
            name: "Miner's Inn",
            location: "HELLUNGI - The Dimensional Abyss, Mining District",
            atmosphere: "A makeshift tavern carved from the void itself, where lost souls from countless worlds gather",
            specialties: ["Hearty Miner's Stew", "Dimensional Ale", "Rock Bread"],
            currentTime: this.getTimeOfDay(),
            currentWeather: this.getRandomWeather(),
            innkeeper: null,
            recentEvents: [
                "The space expanded again last night - new tunnels appeared from nothing",
                "A miner swears they heard the rumbling of the vast creature below",
                "Ancient engravings about The One Pick were found in shaft seven",
                "More lost souls arrived today, confused about how they got here",
                "The center void consumed three miners' memories yesterday"
            ],
            worldContext: {
                name: "HELLUNGI",
                description: "A dimension with an ominous gacha machine, no sky, no ground - only endless abyss",
                theOnePickLore: "The legendary pickaxe that may be the way out of this place",
                npcAwareness: "Most don't know this place is called HELLUNGI - only the intellectuals",
                activeVCs: [] // Will be populated with active voice channels
            }
        };
        
        // Store channel ID for later use
        this.channelId = channelId;
        
        // If channelId provided, load dynamic inn details
        if (channelId) {
            this.loadInnDetailsPromise = this.loadInnDetails(channelId);
        }
    }
    
    /**
     * Load inn details dynamically from game configuration
     * @param {string} channelId - Discord channel ID
     */
    async loadInnDetails(channelId) {
        try {
            // Load ALL active VCs on the server to be aware of other locations
            const activeVC = await GachaVC.findOne({ channelId }).lean();
            if (!activeVC) {
                console.log('[AIDialogue] No active VC found for channel, using defaults');
                return;
            }
            
            // Get all active VCs in this guild
            const allActiveVCs = await GachaVC.find({ guildId: activeVC.guildId }).lean();
            const activeLocations = allActiveVCs.map(vc => {
                const gachaServer = gachaServers.find(g => g.id === vc.typeId);
                return gachaServer ? gachaServer.name : 'Unknown Location';
            });
            this.innDetails.worldContext.activeVCs = activeLocations;
            
            // Find the gacha server configuration
            const gachaServer = gachaServers.find(g => g.id === activeVC.typeId);
            if (!gachaServer) {
                console.log('[AIDialogue] No gacha server found for typeId, using defaults');
                return;
            }
            
            // Find the shop configuration
            const shop = shops.find(s => s.id === gachaServer.shop);
            if (!shop) {
                console.log('[AIDialogue] No shop found for gacha server, using defaults');
                return;
            }
            
            // Get the inn name from gacha server
            this.innDetails.name = gachaServer.name
                .replace('🍖', '')
                .replace('⛏️', '')
                .replace('🍺', '')
                .replace('🎶', '')
                .trim();
            
            // If it's actually the Miner's Inn (id 13), use full inn configuration
            if (gachaServer.id === "13" && gachaServer.type === "innkeeper") {
                this.innDetails.atmosphere = gachaServer.description;
                this.innDetails.name = "Miner's Inn Tavern";
            } else {
                // For mining locations, adapt as a nearby tavern
                this.innDetails.atmosphere = `The local tavern near ${gachaServer.name}, where miners rest after working the ${gachaServer.name.toLowerCase()}`;
                this.innDetails.name = `${this.innDetails.name} Tavern`;
            }
            
            // Get shopkeeper info if available
            if (shop.shopkeeper) {
                this.innDetails.innkeeper = {
                    name: shop.shopkeeper.name,
                    bio: shop.shopkeeper.bio,
                    personality: shop.shopkeeper.personality
                };
                console.log(`[AIDialogue] Loaded innkeeper: ${shop.shopkeeper.name}`);
            }
            
            // Get specialties from shop's static items and item pool
            const specialties = [];
            const itemsToCheck = [...(shop.staticItems || []), ...(shop.itemPool || [])].slice(0, 5);
            
            for (const itemId of itemsToCheck) {
                const item = itemSheet.find(i => i.id === String(itemId));
                if (item && (item.type === 'consumable' || item.name.toLowerCase().includes('ale') || 
                           item.name.toLowerCase().includes('stew') || item.name.toLowerCase().includes('bread'))) {
                    specialties.push(item.name);
                    if (specialties.length >= 3) break; // Get max 3 specialties
                }
            }
            
            // If we found consumables, use them as specialties
            if (specialties.length > 0) {
                this.innDetails.specialties = specialties;
            } else {
                // Fallback specialties based on mine type
                this.innDetails.specialties = this.getSpecialtiesByMineType(gachaServer.name);
            }
            
            // Update location based on mine rarity/type
            this.innDetails.location = this.getLocationByRarity(gachaServer.rarity, gachaServer.name);
            
            // Add mine-specific recent events
            this.innDetails.recentEvents = this.generateMineEvents(gachaServer);
            
            console.log(`[AIDialogue] Loaded dynamic inn details for ${this.innDetails.name}`);
            console.log(`[AIDialogue] Specialties: ${this.innDetails.specialties.join(', ')}`);
            
        } catch (error) {
            console.error('[AIDialogue] Error loading inn details:', error);
            // Keep default configuration on error
        }
    }
    
    /**
     * Get specialties based on mine type
     */
    getSpecialtiesByMineType(mineName) {
        const lowerName = mineName.toLowerCase();
        
        if (lowerName.includes('coal')) {
            return ["Black Bread", "Miner's Stew", "Coal Dust Ale"];
        } else if (lowerName.includes('topaz')) {
            return ["Golden Honey Mead", "Topaz-Glazed Chicken", "Amber Ale"];
        } else if (lowerName.includes('diamond')) {
            return ["Crystal Clear Vodka", "Diamond-Cut Steak", "Sparkling Wine"];
        } else if (lowerName.includes('emerald')) {
            return ["Forest Green Soup", "Emerald Tea", "Herb-Crusted Fish"];
        } else if (lowerName.includes('ruby')) {
            return ["Spiced Ruby Wine", "Fire-Roasted Meat", "Dragon's Breath Chili"];
        } else if (lowerName.includes('obsidian')) {
            return ["Volcanic Rum", "Blackened Fish", "Obsidian Porter"];
        } else if (lowerName.includes('mythril')) {
            return ["Blessed Water", "Ethereal Bread", "Celestial Mead"];
        } else if (lowerName.includes('adamantite')) {
            return ["Void Whiskey", "Abyssal Stew", "Shadow Ale"];
        } else if (lowerName.includes('copper')) {
            return ["Copper Kettle Soup", "Working Man's Ale", "Hearty Bread"];
        } else if (lowerName.includes('iron')) {
            return ["Iron Rations", "Stronghold Stout", "Forge-Baked Bread"];
        } else if (lowerName.includes('crystal')) {
            return ["Crystal Berry Wine", "Prismatic Salad", "Rainbow Trout"];
        } else if (lowerName.includes('fossil')) {
            return ["Ancient Grain Bread", "Prehistoric Stew", "Aged Wine"];
        } else if (lowerName.includes('inn')) {
            return ["Hearty Meat Stew", "House Special Ale", "Fresh Baked Bread"];
        } else {
            return ["Hearty Stew", "Local Ale", "Fresh Bread"];
        }
    }
    
    /**
     * Get location description based on rarity
     */
    getLocationByRarity(rarity, mineName) {
        const cleanName = mineName.replace('⛏️', '').replace('🍖', '').trim();
        
        switch(rarity) {
            case 'common':
                return `Surface level, near the ${cleanName} entrance`;
            case 'uncommon':
                return `Mid-level mining district, ${cleanName} sector`;
            case 'rare':
                return `Deep mining quarter, ${cleanName} territory`;
            case 'epic':
                return `Restricted depths, ${cleanName} zone`;
            case 'legendary':
                return `Forbidden abyss, ${cleanName} domain`;
            default:
                return `Mining District, ${cleanName} area`;
        }
    }
    
    /**
     * Generate mine-specific recent events
     */
    generateMineEvents(gachaServer) {
        const events = [];
        const mineName = gachaServer.name.replace('⛏️', '').replace('🍖', '').trim();
        
        // Get the primary resource type from the name
        let resourceType = "ore";
        if (mineName.toLowerCase().includes('coal')) resourceType = "coal";
        else if (mineName.toLowerCase().includes('topaz')) resourceType = "topaz";
        else if (mineName.toLowerCase().includes('diamond')) resourceType = "diamonds";
        else if (mineName.toLowerCase().includes('emerald')) resourceType = "emeralds";
        else if (mineName.toLowerCase().includes('ruby')) resourceType = "rubies";
        else if (mineName.toLowerCase().includes('obsidian')) resourceType = "obsidian";
        else if (mineName.toLowerCase().includes('mythril')) resourceType = "mythril";
        else if (mineName.toLowerCase().includes('adamantite')) resourceType = "adamantite";
        else if (mineName.toLowerCase().includes('copper')) resourceType = "copper";
        else if (mineName.toLowerCase().includes('iron')) resourceType = "iron";
        else if (mineName.toLowerCase().includes('crystal')) resourceType = "crystals";
        else if (mineName.toLowerCase().includes('fossil')) resourceType = "fossils";
        
        // HELLUNGI-specific events
        events.push(
            `The ${mineName} expanded overnight - new tunnels appeared from the void`,
            `A miner from another world just appeared in ${mineName}, confused and lost`,
            `Strange engravings about The One Pick were discovered in ${mineName}`,
            `The void consumed part of ${mineName} - several shafts just vanished`,
            `Miners report hearing the vast creature's rumbling from ${mineName} depths`
        );
        
        // Rarity-specific events with HELLUNGI lore
        if (gachaServer.rarity === 'legendary') {
            events.push(`Whispers say The One Pick was last seen in ${mineName} depths`);
            events.push(`A scholar claims ${mineName} holds the key to escaping HELLUNGI`);
        } else if (gachaServer.rarity === 'epic') {
            events.push(`Ancient texts about the Miner King found in ${mineName}`);
            events.push(`${mineName} miners debate if The One Pick truly exists`);
        } else if (gachaServer.rarity === 'rare') {
            events.push(`New arrivals from other worlds assigned to ${mineName}`);
            events.push(`The ${mineName} cult worships The One Pick as a deity`);
        } else if (gachaServer.rarity === 'uncommon') {
            events.push(`${mineName} miners form a search party for legendary artifacts`);
        } else {
            events.push(`New lost souls wander into ${mineName}, asking 'where am I?'`);
        }
        
        // Hazard-specific events
        if (gachaServer.hazardConfig) {
            if (gachaServer.hazardConfig.allowedTypes.includes('green_fog')) {
                events.push(`Toxic fog warning in ${mineName} lower levels`);
            }
            if (gachaServer.hazardConfig.allowedTypes.includes('bomb_trap')) {
                events.push(`Unstable geology reported in ${mineName}`);
            }
            if (gachaServer.hazardConfig.allowedTypes.includes('wall_trap')) {
                events.push(`Cave-in risk elevated in ${mineName} eastern tunnel`);
            }
            if (gachaServer.hazardConfig.allowedTypes.includes('portal_trap')) {
                events.push(`Strange portals sighted in ${mineName} depths`);
            }
        }
        
        return events;
    }

    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 6) return "the void hours";
        if (hour < 12) return "morning cycle";
        if (hour < 17) return "eternal noon";
        if (hour < 21) return "dusk shift";
        return "the dark cycle";
    }

    getRandomWeather() {
        const weather = [
            "thick with void mist", 
            "echoing with distant rumblings", 
            "eerily still", 
            "dusty from the expanding mines", 
            "cold - the abyss is stealing warmth", 
            "shimmering with gacha energy",
            "heavy with forgotten memories"
        ];
        return weather[Math.floor(Math.random() * weather.length)];
    }

    /**
     * Ensure inn details are loaded before generating dialogue
     */
    async ensureLoaded() {
        if (this.loadInnDetailsPromise) {
            await this.loadInnDetailsPromise;
        }
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
        // Ensure inn details are loaded
        await this.ensureLoaded();
        
        try {
            const recentEvent = this.innDetails.recentEvents[
                Math.floor(Math.random() * this.innDetails.recentEvents.length)
            ];

            let innkeeperContext = '';
            if (this.innDetails.innkeeper) {
                innkeeperContext = `The innkeeper is ${this.innDetails.innkeeper.name}, ${this.innDetails.innkeeper.bio}`;
            }

            // Determine if NPC mentions The One Pick or artifacts (5% chance)
            const mentionsArtifact = Math.random() < 0.05;
            const artifactContext = mentionsArtifact ? `\nYou've heard rumors about The One Pick - ${Math.random() < 0.5 ? 'you believe it exists and could free us from HELLUNGI' : 'you think it\'s just a myth to give false hope'}` : '';
            
            // Check if other locations are active
            const otherLocations = this.innDetails.worldContext.activeVCs.filter(loc => !loc.includes(this.innDetails.name));
            const locationAwareness = otherLocations.length > 0 ? `\nYou know these other locations are active: ${otherLocations.join(', ')}` : '';

            const prompt = `You are ${npc.name}, ${npc.description}. You're from another world and don't know how you got to HELLUNGI.
            
Setting: You're at ${this.innDetails.name} in HELLUNGI - a dimension with no sky, no ground, only endless abyss. 
${innkeeperContext}
It's ${this.innDetails.currentTime} and the conditions are ${this.innDetails.currentWeather}.
The inn's atmosphere: ${this.innDetails.atmosphere}
They're known for: ${this.innDetails.specialties.join(', ')}
Recent local news: ${recentEvent}
${artifactContext}
${locationAwareness}

IMPORTANT CONTEXT:
- You're trapped in HELLUNGI like everyone else
- You don't know how you got here - one day you just... were here
- Some believe The One Pick (legendary artifact) is the way out
- The space is expanding, mines appear from nothing
- Sometimes you hear rumblings of a vast creature
- The center void consumes words and memories
- Most don't know this place is called HELLUNGI (only intellectuals do)

Your personality traits:
- Budget level: ${npc.budget}
- Typical tip behavior: ${npc.tipModifier > 1 ? 'generous' : npc.tipModifier < 0.5 ? 'stingy' : 'average'}
- Frequency of visits: ${npc.frequency}

Service Quality Today:
${options.workerPerformance ? this.getServiceDescription(options.workerPerformance) : 'Normal service'}

You are purchasing: ${item.name} for ${price} coins
${options.tip ? `You're leaving a ${options.tip} coin tip.` : ''}
${options.isHungry ? "You're particularly hungry/thirsty today." : ''}
${options.mood ? `Your current mood: ${options.mood}` : ''}

Generate a single line of dialogue (1-2 sentences max) that this character would say while making this purchase. 
The dialogue should:
- Reflect your personality and background from another world
- Possibly reference the item, price, conditions, time, specialties, or recent events
- Maybe express fear, hope, confusion about being trapped in HELLUNGI
- Might mention The One Pick, other legendary artifacts, or the expanding void
${options.workerPerformance ? this.getDialogueInstructions(options.workerPerformance) : ''}
- Be natural and conversational
- Stay in character as someone trapped in this dimension
- Remember you're from another world and confused/scared/brave about your situation

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
     * @param {Object} options - Additional options (including worker stats)
     * @returns {Promise<string>} Generated dialogue
     */
    async generatePlayerDialogue(player, item, price, options = {}) {
        // Ensure inn details are loaded
        await this.ensureLoaded();
        
        try {
            let innkeeperContext = '';
            if (this.innDetails.innkeeper) {
                innkeeperContext = `The innkeeper (${this.innDetails.innkeeper.name}) is ${this.innDetails.innkeeper.personality}.`;
            }

            const prompt = `Generate a brief customer comment at ${this.innDetails.name} in HELLUNGI.

Context:
- Customer name: ${player.username || 'Lost Soul'}
- Purchasing: ${item.name} for ${price} coins
- Location: HELLUNGI - the dimensional abyss with no sky or ground
- Time: ${this.innDetails.currentTime}
- Conditions: ${this.innDetails.currentWeather}
- Inn atmosphere: ${this.innDetails.atmosphere}
- Known for: ${this.innDetails.specialties.join(', ')}
${innkeeperContext}
${options.workerPerformance ? `\nService Quality: ${this.getServiceDescription(options.workerPerformance)}` : ''}
${options.tip ? `- Leaving a generous ${options.tip} coin tip` : ''}
${options.previousPurchases ? `- Been surviving here for a while, visited ${options.previousPurchases} times` : '- Recently arrived in this dimension'}
${options.playerClass ? `- Was a ${options.playerClass} in their home world` : ''}

World Context:
- You're trapped in HELLUNGI, a dimension with endless abyss
- You may or may not know how you got here
- Some believe The One Pick can help escape
- The space expands, new mines appear from nothing
- The void consumes memories

Generate a single brief comment (1 sentence) that a customer might say. It should be:
- Natural and conversational
- Possibly reference the item, inn's specialties, innkeeper, weather, or how their day is going
${options.workerPerformance ? this.getDialogueInstructions(options.workerPerformance) : ''}
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
                `Best inn in the ${this.innDetails.location || 'district'}!`
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
        // Ensure inn details are loaded
        await this.ensureLoaded();
        
        try {
            let prompt = '';
            
            switch(eventType) {
                case 'rush_hour':
                    prompt = `The ${this.innDetails.name} is packed during ${this.innDetails.currentTime} rush hour. Generate a brief comment from a hurried customer who just wants quick service. One sentence only.`;
                    break;
                case 'big_tipper':
                    prompt = `A wealthy customer at ${this.innDetails.name} is leaving an exceptionally large ${context.tip} coin tip. Generate their generous comment about the service or establishment. One sentence only.`;
                    break;
                case 'complaint':
                    prompt = `A difficult customer at ${this.innDetails.name} is complaining about ${context.issue || 'something'}. Generate their grumpy comment. Keep it mild and one sentence.`;
                    break;
                case 'celebration':
                    prompt = `Customers at ${this.innDetails.name} are celebrating ${context.occasion || 'a successful mining expedition'}. Generate an enthusiastic comment from one of them. One sentence only.`;
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
     * Get dialogue instructions based on worker performance
     * @param {Object} performance - Worker performance data
     * @returns {string} Dialogue instructions
     */
    getDialogueInstructions(performance) {
        if (!performance) return '';
        
        const instructions = [];
        
        // React to speed
        if (performance.speedStat >= 100) {
            instructions.push('- MUST comment on the incredibly fast service');
        } else if (performance.speedStat >= 50) {
            instructions.push('- Maybe mention the quick service');
        } else if (performance.speedStat < 10) {
            instructions.push('- Might complain about slow service');
        }
        
        // React to attentiveness
        if (performance.sightStat >= 100) {
            instructions.push('- Be impressed by staff anticipating your needs');
        } else if (performance.sightStat >= 50) {
            instructions.push('- Appreciate the attentive service');
        } else if (performance.sightStat < 10) {
            instructions.push('- Might mention having to get staff attention');
        }
        
        // React to overall performance
        if (performance.performanceTier === 'legendary') {
            instructions.push('- Be AMAZED by the exceptional service quality');
        } else if (performance.performanceTier === 'excellent') {
            instructions.push('- Compliment the excellent service');
        } else if (performance.performanceTier === 'poor') {
            instructions.push('- Express disappointment with service');
        }
        
        return instructions.join('\n');
    }
    
    /**
     * Get service quality description based on worker performance
     * @param {Object} performance - Worker performance data
     * @returns {string} Service description
     */
    getServiceDescription(performance) {
        if (!performance) return 'Normal service';
        
        const descriptions = [];
        
        // Describe speed of service
        if (performance.speedStat >= 100) {
            descriptions.push('Lightning-fast service - orders appear almost instantly');
        } else if (performance.speedStat >= 50) {
            descriptions.push('Very quick service - minimal waiting time');
        } else if (performance.speedStat >= 25) {
            descriptions.push('Prompt service - reasonable wait times');
        } else if (performance.speedStat >= 10) {
            descriptions.push('Standard service speed');
        } else {
            descriptions.push('Slow service - noticeable delays');
        }
        
        // Describe attentiveness
        if (performance.sightStat >= 100) {
            descriptions.push('Staff anticipates needs before you ask');
        } else if (performance.sightStat >= 50) {
            descriptions.push('Very attentive staff - notices empty glasses immediately');
        } else if (performance.sightStat >= 25) {
            descriptions.push('Attentive service - checks on customers regularly');
        } else if (performance.sightStat >= 10) {
            descriptions.push('Basic attention to customer needs');
        } else {
            descriptions.push('Inattentive service - have to flag down staff');
        }
        
        // Overall performance tier
        if (performance.performanceTier === 'legendary') {
            descriptions.push('LEGENDARY SERVICE - the best you\'ve ever experienced!');
        } else if (performance.performanceTier === 'excellent') {
            descriptions.push('Excellent overall performance');
        } else if (performance.performanceTier === 'good') {
            descriptions.push('Good, professional service');
        } else if (performance.performanceTier === 'poor') {
            descriptions.push('Service could be better');
        }
        
        // Special mentions for high stats
        if (performance.luckStat >= 50) {
            descriptions.push('Something feels lucky about this place today');
        }
        if (performance.miningStat >= 50) {
            descriptions.push('Staff handles heavy kegs and supplies with ease');
        }
        
        return descriptions.join('. ');
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