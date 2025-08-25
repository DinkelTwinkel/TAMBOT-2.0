// innKeeping/innAIManager.js
// Centralized AI dialogue generation for the inn system

const OpenAI = require('openai');
const InnConfig = require('./innConfig');
const gachaServers = require('../../../data/gachaServers.json');
const GachaVC = require('../../../models/activevcs');

class InnAIManager {
    constructor() {
        this.config = InnConfig.AI;
        this.cache = new Map();
        this.fallbackDialogue = this.loadFallbackDialogue();
        
        // Initialize OpenAI if available
        this.openai = null;
        if (this.config.ENABLED) {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
            console.log('[InnAI] OpenAI initialized');
        } else {
            console.log('[InnAI] Running without OpenAI (using fallbacks)');
        }
    }

    /**
     * Check if AI is available
     */
    isAvailable() {
        return this.openai !== null;
    }

    /**
     * Capitalize first letter of each word in a name
     */
    capitalizePlayerName(name) {
        if (!name) return 'Traveler';
        return name.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Get active VC info for a user
     */
    async getUserActiveVCInfo(userId, currentChannelId) {
        try {
            // Find all active VCs where the user might be connected
            const activeVCs = await GachaVC.find({ 
                connectedUsers: { $in: [userId] } 
            }).lean();
            
            // Filter out the current channel
            const otherVCs = activeVCs.filter(vc => vc.channelId !== currentChannelId);
            
            if (otherVCs.length === 0) return null;
            
            // Get the first other VC they're connected to
            const otherVC = otherVCs[0];
            
            // Find the gacha server info
            const vcInfo = gachaServers.find(g => g.id === otherVC.typeId);
            
            return {
                name: vcInfo?.name || 'Unknown location',
                type: vcInfo?.type || 'unknown',
                description: vcInfo?.description || '',
                power: vcInfo?.power || 1
            };
        } catch (error) {
            console.error('[InnAI] Error getting user VC info:', error);
            return null;
        }
    }

    /**
     * Load fallback dialogue
     */
    loadFallbackDialogue() {
        return {
            npc: {
                grumpy: [
                    "Just give me the usual and be quick about it.",
                    "This better be fresh...",
                    "Last time the service was terrible.",
                    "Hmph. I suppose this will do.",
                    "Don't expect a big tip."
                ],
                cheerful: [
                    "What a lovely day for a meal!",
                    "This place always brightens my spirits!",
                    "I'll have your finest, please!",
                    "Everything looks delicious today!",
                    "Worth every coin!"
                ],
                neutral: [
                    "The usual, please.",
                    "I'll take one of those.",
                    "This will do nicely.",
                    "Just what I needed.",
                    "Thank you kindly."
                ]
            },
            player: [
                "Just what I needed!",
                "Perfect timing, I was getting hungry.",
                "This place never disappoints!",
                "I'll be back for more!",
                "Best inn in town!",
                "Worth every coin!",
                "Exactly what I was looking for.",
                "Great service as always!",
                "This hits the spot!",
                "I needed this today."
            ],
            playerWithVC: {
                fromMining: [
                    "Need a quick bite before heading back to the mines!",
                    "Taking a break from all that digging.",
                    "Coal dust makes me thirsty, perfect timing!",
                    "My pickaxe can wait, food first!",
                    "The mines are calling but I need sustenance!"
                ],
                fromOtherInn: [
                    "Just stopping by from another tavern!",
                    "Thought I'd check out the competition!",
                    "The other place was too crowded.",
                    "Heard this place has better food!",
                    "Making the rounds of all the inns today!"
                ],
                general: [
                    "Quick stop before I head back!",
                    "Can't stay long, just passing through!",
                    "Grabbing supplies before returning!",
                    "Just need a quick refill!",
                    "I'll be back to my work soon!"
                ]
            },
            events: {
                barFight: {
                    start: [
                        "tensions rise as voices get louder",
                        "suddenly, a chair goes flying",
                        "the argument escalates quickly",
                        "fists start flying over",
                        "tempers flare about"
                    ],
                    end: [
                        "The dust settles as they're pulled apart",
                        "Order is restored, but the damage is done",
                        "They're thrown out, still shouting",
                        "The innkeeper breaks them up with a glare",
                        "Other patrons separate the combatants"
                    ]
                },
                rumor: InnConfig.RUMORS,
                coinFind: [
                    "spotted something shiny under the table",
                    "found coins someone dropped",
                    "discovered a hidden stash while cleaning",
                    "noticed coins that rolled under the bar",
                    "found a forgotten tip on the floor"
                ],
                innkeeperComment: {
                    slow: InnConfig.INNKEEPER_COMMENTS.slow,
                    moderate: InnConfig.INNKEEPER_COMMENTS.moderate,
                    busy: InnConfig.INNKEEPER_COMMENTS.busy
                }
            }
        };
    }

    /**
     * Generic dialogue generation with caching
     */
    async generate(prompt, fallbackOptions = [], useCache = true) {
        // Check cache
        if (useCache) {
            const cached = this.getFromCache(prompt);
            if (cached) return cached;
        }

        // Try AI generation
        if (this.isAvailable()) {
            try {
                const dialogue = await this.generateWithAI(prompt);
                if (dialogue) {
                    this.addToCache(prompt, dialogue);
                    return dialogue;
                }
            } catch (error) {
                console.error('[InnAI] Generation failed:', error.message);
            }
        }

        // Use fallback
        return this.selectFallback(fallbackOptions);
    }

    /**
     * Generate NPC dialogue
     */
    async generateNPCDialogue(npc, item, price, context = {}) {
        const mood = context.mood || this.determineMood(npc);
        
        if (!this.isAvailable()) {
            return this.selectFallback(this.fallbackDialogue.npc[mood] || this.fallbackDialogue.npc.neutral);
        }

        const prompt = `Generate a short, in-character dialogue line for ${npc.name} (${npc.description}) 
        purchasing ${item.name} for ${price} coins at an inn in Hellungi.
        Personality: ${npc.aiPersonality || npc.description}
        Mood: ${mood}
        Tip amount: ${context.tip || 0} coins
        Keep it under 20 words and match their personality.
        Do not include quotation marks in the dialogue.
        ${this.config.WORLD_CONTEXT}`;

        const fallbacks = this.fallbackDialogue.npc[mood] || this.fallbackDialogue.npc.neutral;
        return await this.generate(prompt, fallbacks);
    }

    /**
     * Generate player dialogue with VC awareness
     */
    async generatePlayerDialogue(player, item, price, context = {}) {
        // Get player's other active VC if any
        const otherVCInfo = await this.getUserActiveVCInfo(
            context.playerId || player.id, 
            context.currentChannelId
        );
        
        // Select appropriate fallbacks based on VC info
        let fallbacks = this.fallbackDialogue.player;
        if (otherVCInfo) {
            if (otherVCInfo.type === 'mining') {
                fallbacks = this.fallbackDialogue.playerWithVC.fromMining;
            } else if (otherVCInfo.type === 'innkeeper') {
                fallbacks = this.fallbackDialogue.playerWithVC.fromOtherInn;
            } else {
                fallbacks = this.fallbackDialogue.playerWithVC.general;
            }
        }

        if (!this.isAvailable()) {
            return this.selectFallback(fallbacks);
        }

        // Handle both string names and player objects, and capitalize
        let playerName = typeof player === 'string' 
            ? player 
            : (player.displayName || player.username || 'Customer');
        
        // Capitalize player name properly
        playerName = this.capitalizePlayerName(playerName);
        
        // Build context about where they're coming from/going
        let vcContext = '';
        if (otherVCInfo) {
            if (otherVCInfo.type === 'mining') {
                vcContext = `They are taking a break from mining at ${otherVCInfo.name}.`;
            } else if (otherVCInfo.type === 'innkeeper') {
                vcContext = `They are visiting from ${otherVCInfo.name}, another inn.`;
            } else {
                vcContext = `They are connected to ${otherVCInfo.name} and will return there soon.`;
            }
        }
        
        const prompt = `Generate a brief customer comment for ${playerName} 
        buying ${item.name} for ${price} coins at an inn.
        ${vcContext}
        ${context.previousPurchases > 3 ? 'They are a regular customer.' : 'They are a new customer.'}
        Keep it natural and under 15 words. If they're connected elsewhere, they might mention needing to get back.
        Do not include quotation marks in the dialogue.
        IMPORTANT: Always capitalize the first letter of each word in the player's name when mentioning them.`;

        return await this.generate(prompt, fallbacks);
    }

    /**
     * Generate event dialogue
     */
    async generateEventDialogue(eventType, eventContext = {}) {
        let prompt, fallbacks;

        switch (eventType) {
            case 'barFight':
                prompt = `Describe a brief bar fight between ${eventContext.npc1} and ${eventContext.npc2} 
                over ${eventContext.reason}. Keep it under 20 words, action-focused.
                Do not include quotation marks.`;
                fallbacks = this.fallbackDialogue.events.barFight.start;
                break;
                
            case 'rumor':
                prompt = `Generate a mysterious rumor about interdimensional portals or The One Pick 
                that ${eventContext.npc1} might share with ${eventContext.npc2}. Under 20 words.
                Do not include quotation marks in the rumor.
                ${this.config.WORLD_CONTEXT}`;
                fallbacks = this.fallbackDialogue.events.rumor;
                break;
                
            case 'coinFind':
                // Enhanced coin find dialogue with establishment context
                if (eventContext.powerLevel >= 4) {
                    // Noble establishment
                    prompt = `${eventContext.finder} finds ${eventContext.amount} coins in the luxury establishment ${eventContext.innName}. 
                    Describe where exactly they found it - maybe ${eventContext.locations ? eventContext.locations[0] : 'in an elegant location'}.
                    Keep it under 20 words, make it sound appropriate for a high-class venue.
                    Do not include quotation marks.`;
                } else if (eventContext.powerLevel >= 2) {
                    // Mid-tier establishment
                    prompt = `${eventContext.finder} discovers ${eventContext.amount} coins at ${eventContext.innName}. 
                    Describe the lucky find - perhaps ${eventContext.locations ? eventContext.locations[0] : 'in a common area'}.
                    Keep it under 20 words, casual tone.
                    Do not include quotation marks.`;
                } else {
                    // Basic establishment
                    prompt = `${eventContext.finder} spots ${eventContext.amount} coins on the floor of the humble inn. 
                    Simple description of where - maybe ${eventContext.locations ? eventContext.locations[0] : 'under something'}.
                    Keep it under 15 words, working-class tone.
                    Do not include quotation marks.`;
                }
                
                // Add luck context if very lucky
                if (eventContext.luckStat > 100) {
                    prompt += ` Their exceptional luck (${eventContext.luckStat}) makes this find seem almost magical.`;
                }
                
                fallbacks = this.fallbackDialogue.events.coinFind;
                break;
                
            case 'innkeeperComment':
                const level = eventContext.businessLevel || 'slow';
                fallbacks = this.fallbackDialogue.events.innkeeperComment[level];
                if (!this.isAvailable()) {
                    return this.selectFallback(fallbacks);
                }
                prompt = `Generate an innkeeper action/observation during a ${level} business period. Under 15 words.
                Do not include quotation marks.`;
                break;
                
            default:
                return "Something interesting happens...";
        }

        return await this.generate(prompt, fallbacks, false); // Don't cache events
    }

    /**
     * Generate with OpenAI
     */
    async generateWithAI(prompt) {
        if (!this.openai) return null;

        try {
            const response = await this.openai.chat.completions.create({
                model: this.config.MODEL,
                messages: [{ 
                    role: "user", 
                    content: prompt 
                }],
                max_tokens: this.config.MAX_TOKENS,
                temperature: this.config.TEMPERATURE,
            });

            // Strip surrounding quotes from the response
            let content = response.choices[0].message.content.trim();
            
            // Remove surrounding quotes if they exist
            if ((content.startsWith('"') && content.endsWith('"')) || 
                (content.startsWith("'") && content.endsWith("'"))) {
                content = content.slice(1, -1);
            }
            
            // Also remove escaped quotes that might appear
            content = content.replace(/\\"/g, '"').replace(/\\'/g, "'");
            
            return content;
        } catch (error) {
            console.error('[InnAI] OpenAI error:', error);
            return null;
        }
    }

    /**
     * Determine NPC mood
     */
    determineMood(npc) {
        if (npc.tipModifier < 0.5) return 'grumpy';
        if (npc.tipModifier > 1.5) return 'cheerful';
        if (npc.wealth < 3) return 'grumpy';
        if (npc.wealth > 7) return 'cheerful';
        return 'neutral';
    }

    /**
     * Select random fallback
     */
    selectFallback(options) {
        if (!options || options.length === 0) {
            return "...";
        }
        return options[Math.floor(Math.random() * options.length)];
    }

    /**
     * Cache management
     */
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.config.CACHE_TIMEOUT) {
            return cached.value;
        }
        this.cache.delete(key);
        return null;
    }

    addToCache(key, value) {
        if (this.cache.size > this.config.MAX_CACHE_SIZE) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = InnAIManager;