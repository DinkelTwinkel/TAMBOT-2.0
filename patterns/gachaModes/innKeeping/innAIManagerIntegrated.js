// innKeeping/innAIManagerIntegrated.js
// Inn AI Manager integrated with Unified Dialogue Pool

const OpenAI = require('openai');
const InnConfig = require('./innConfig');
const UnifiedDialoguePool = require('../../UnifiedDialoguePool');

class InnAIManager {
    constructor() {
        this.config = InnConfig.AI;
        this.fallbackDialogue = this.loadFallbackDialogue();
        
        // Initialize OpenAI if available
        this.openai = null;
        if (this.config.ENABLED && process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
            console.log('[InnAI] OpenAI initialized with Unified Dialogue Pool');
        } else {
            console.log('[InnAI] Running without OpenAI (using fallbacks and pool)');
        }
        
        // Initialize dialogue pool
        this.initializePool();
    }
    
    /**
     * Initialize the unified dialogue pool system
     */
    async initializePool() {
        await UnifiedDialoguePool.initialize();
        
        // Log pool statistics on startup
        const stats = UnifiedDialoguePool.getStatsReport();
        console.log('[InnAI] Unified Pool Stats:', {
            innDialogues: stats.inn.pools,
            innReuseRate: stats.inn.reuseRate,
            totalSaved: stats.total.costSaved
        });
    }

    /**
     * Check if AI is available
     */
    isAvailable() {
        return this.openai !== null;
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
     * Generate NPC dialogue with unified pooling
     */
    async generateNPCDialogue(npc, item, price, context = {}) {
        const mood = context.mood || this.determineMood(npc);
        
        // Create context key for pooling
        const contextKey = `npc-${mood}-w${Math.floor(npc.wealth/3)}`;
        const contextData = {
            mood: mood,
            wealth: npc.wealth,
            innType: context.innType || 'default',
            npcType: npc.type || 'generic',
            tipModifier: npc.tipModifier
        };
        
        // Use unified dialogue pool system
        const dialogue = await UnifiedDialoguePool.getDialogue(
            'inn',
            'npc',
            contextKey,
            async () => {
                // Generation function - only called when pool decides to generate
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
                
                return await this.generateWithAI(prompt);
            },
            contextData
        );
        
        return dialogue || this.selectFallback(this.fallbackDialogue.npc[mood] || this.fallbackDialogue.npc.neutral);
    }

    /**
     * Generate player dialogue with unified pooling
     */
    async generatePlayerDialogue(player, item, price, context = {}) {
        const playerName = typeof player === 'string' 
            ? player 
            : (player.displayName || player.username || 'Customer');
        
        // Create context key for pooling
        const isRegular = context.previousPurchases > 3;
        const contextKey = `player-${isRegular ? 'regular' : 'new'}`;
        const contextData = {
            isRegular: isRegular,
            innType: context.innType || 'default',
            previousPurchases: context.previousPurchases || 0
        };
        
        // Use unified dialogue pool system
        const dialogue = await UnifiedDialoguePool.getDialogue(
            'inn',
            'player',
            contextKey,
            async () => {
                if (!this.isAvailable()) {
                    return this.selectFallback(this.fallbackDialogue.player);
                }
                
                const prompt = `Generate a brief customer comment for ${playerName} 
                buying ${item.name} for ${price} coins at an inn.
                ${isRegular ? 'They are a regular customer.' : 'They are a new customer.'}
                Keep it natural and under 15 words.
                Do not include quotation marks in the dialogue.`;
                
                return await this.generateWithAI(prompt);
            },
            contextData
        );
        
        return dialogue || this.selectFallback(this.fallbackDialogue.player);
    }

    /**
     * Generate event dialogue with unified pooling
     */
    async generateEventDialogue(eventType, eventContext = {}) {
        let contextKey, contextData, generateFunction, fallbacks;

        switch (eventType) {
            case 'barFight':
                contextKey = `barfight-${eventContext.severity || 'standard'}`;
                contextData = {
                    eventType: 'barFight',
                    severity: eventContext.severity || 'standard',
                    innType: eventContext.innType || 'default'
                };
                generateFunction = async () => {
                    if (!this.isAvailable()) return null;
                    
                    const prompt = `Describe a brief bar fight between ${eventContext.npc1} and ${eventContext.npc2} 
                    over ${eventContext.reason}. Keep it under 20 words, action-focused.
                    Do not include quotation marks.`;
                    
                    return await this.generateWithAI(prompt);
                };
                fallbacks = this.fallbackDialogue.events.barFight.start;
                break;
                
            case 'rumor':
                contextKey = `rumor-${eventContext.topic || 'general'}`;
                contextData = {
                    eventType: 'rumor',
                    topic: eventContext.topic || 'general',
                    innType: eventContext.innType || 'default'
                };
                generateFunction = async () => {
                    if (!this.isAvailable()) return null;
                    
                    const prompt = `Generate a mysterious rumor about interdimensional portals or The One Pick 
                    that ${eventContext.npc1} might share with ${eventContext.npc2}. Under 20 words.
                    Do not include quotation marks in the rumor.
                    ${this.config.WORLD_CONTEXT}`;
                    
                    return await this.generateWithAI(prompt);
                };
                fallbacks = this.fallbackDialogue.events.rumor;
                break;
                
            case 'coinFind':
                const powerLevel = eventContext.powerLevel || 1;
                contextKey = `coinfind-power${Math.floor(powerLevel/2)}`;
                contextData = {
                    eventType: 'coinFind',
                    powerLevel: powerLevel,
                    innType: eventContext.innType || 'default',
                    luckLevel: eventContext.luckStat > 100 ? 'high' : 'normal'
                };
                generateFunction = async () => {
                    if (!this.isAvailable()) return null;
                    
                    let prompt;
                    if (powerLevel >= 4) {
                        prompt = `${eventContext.finder} finds ${eventContext.amount} coins in the luxury establishment ${eventContext.innName}. 
                        Describe where exactly they found it. Keep it under 20 words, elegant tone.`;
                    } else if (powerLevel >= 2) {
                        prompt = `${eventContext.finder} discovers ${eventContext.amount} coins at ${eventContext.innName}. 
                        Describe the lucky find. Keep it under 20 words, casual tone.`;
                    } else {
                        prompt = `${eventContext.finder} spots ${eventContext.amount} coins on the floor. 
                        Simple description. Keep it under 15 words, working-class tone.`;
                    }
                    
                    if (eventContext.luckStat > 100) {
                        prompt += ` Their exceptional luck (${eventContext.luckStat}) makes this find seem magical.`;
                    }
                    
                    return await this.generateWithAI(prompt);
                };
                fallbacks = this.fallbackDialogue.events.coinFind;
                break;
                
            case 'innkeeperComment':
                const level = eventContext.businessLevel || 'slow';
                contextKey = `innkeeper-${level}`;
                contextData = {
                    eventType: 'innkeeperComment',
                    businessLevel: level,
                    innType: eventContext.innType || 'default'
                };
                generateFunction = async () => {
                    if (!this.isAvailable()) return null;
                    
                    const prompt = `Generate an innkeeper action/observation during a ${level} business period. Under 15 words.
                    Do not include quotation marks.`;
                    
                    return await this.generateWithAI(prompt);
                };
                fallbacks = this.fallbackDialogue.events.innkeeperComment[level];
                break;
                
            default:
                return "Something interesting happens...";
        }

        // Use unified dialogue pool system
        const dialogue = await UnifiedDialoguePool.getDialogue(
            'inn',
            'events',
            contextKey,
            generateFunction,
            contextData
        );
        
        return dialogue || this.selectFallback(fallbacks || []);
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

            let content = response.choices[0].message.content.trim();
            
            // Remove surrounding quotes if they exist
            if ((content.startsWith('"') && content.endsWith('"')) || 
                (content.startsWith("'") && content.endsWith("'"))) {
                content = content.slice(1, -1);
            }
            
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
     * Get pool statistics
     */
    getPoolStats() {
        const stats = UnifiedDialoguePool.getStatsReport();
        return {
            inn: stats.inn,
            total: stats.total,
            efficiency: `Inn system: ${stats.inn.efficiency}`,
            savings: `Total saved: ${stats.total.costSaved}`
        };
    }
    
    /**
     * Save all dialogue pools
     */
    async saveAllPools() {
        await UnifiedDialoguePool.saveAllPools();
        console.log('[InnAI] All dialogue pools saved');
    }
    
    /**
     * Export dialogue pool for backup
     */
    async exportDialoguePool(path) {
        await UnifiedDialoguePool.exportPool(path);
    }
    
    /**
     * Import dialogue pool from backup
     */
    async importDialoguePool(path) {
        await UnifiedDialoguePool.importPool(path);
    }
}

module.exports = InnAIManager;