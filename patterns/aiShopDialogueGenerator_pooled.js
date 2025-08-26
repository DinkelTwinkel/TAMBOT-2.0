// AI Shop Dialogue Generator - Generates contextual shopkeeper dialogue using OpenAI
// This module creates dynamic dialogue for shop interactions with personality and lore
// INTEGRATED WITH UNIFIED DIALOGUE POOL FOR COST SAVINGS

const OpenAI = require('openai');
require('dotenv').config();
const GachaVC = require('../models/activevcs');
const gachaServers = require('../data/gachaServers.json');
const { UNIQUE_ITEMS } = require('../data/uniqueItemsSheet');
const UnifiedDialoguePool = require('./UnifiedDialoguePool'); // Added for dialogue pooling

class AIShopDialogueGenerator {
    constructor() {
        // Initialize OpenAI client from .env
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        // Maximum dialogue length - increased for more natural dialogue
        this.MAX_DIALOGUE_LENGTH = 100;  // Increased from 50 to allow complete sentences
        
        // Initialize the dialogue pool
        this.initializePool();
        
        // HELLUNGI world details - the dimensional abyss
        this.worldContext = {
            location: "HELLUNGI - The Dimensional Abyss",
            currentTime: this.getTimeOfDay(),
            currentWeather: this.getRandomWeather(),
            district: "The expanding void where mines emerge",
            
            // The One Pick lore (legendary artifact that may be the way out)
            theOnePickLore: {
                description: "A pickaxe of impossible perfection, once wielded by the Miner King",
                powers: "Can mine through reality itself, possibly the key to escaping HELLUNGI",
                location: "Lost somewhere in HELLUNGI's infinite depths",
                believers: ["desperate miners", "lost souls seeking escape", "cult worshippers", "ancient scholars"],
                skeptics: ["pragmatists", "those who've given up hope", "merchants profiting from the status quo"]
            },
            
            recentEvents: [
                "The space expanded again - three new mines appeared overnight",
                "More lost souls arrived today, confused about how they got here",
                "The vast creature's rumblings shook the entire abyss last night",
                "Ancient texts about The One Pick were discovered in the ruins",
                "The center void consumed a merchant's entire memory yesterday",
                "A cult formed claiming The One Pick is a deity, not a tool",
                "Miners report the walls whisper about legendary artifacts",
                "Someone claims they saw the Miner King's shadow in the depths",
                "The gacha machine glowed ominously and spawned new tunnels"
            ],
            activeVCs: [] // Will store active voice channels
        };
        
        // Shop keeper opinions on The One Pick (10% chance to mention)
        // THE ONE PICK is the legendary artifact that may free everyone from HELLUNGI
        this.onePickOpinions = {
            believer: [
                "The One Pick is real... it's our only way out of this cursed place.",
                "I'd give everything I own to hold The One Pick just once - to escape HELLUNGI.",
                "The Miner King used it to enter this dimension... we can use it to leave."
            ],
            skeptic: [
                "The One Pick? Just false hope for those who can't accept we're trapped forever.",
                "If The One Pick existed, someone would have escaped by now.",
                "We're stuck here, friend. No magical pickaxe will change that."
            ],
            mysterious: [
                "The One Pick exists in the space between here and nowhere...",
                "Those who seek The One Pick often lose themselves to the void...",
                "Perhaps we're not meant to find it... perhaps it must find us."
            ],
            reverent: [
                "The One Pick is divine... it will choose its bearer when the time comes.",
                "We should worship The One Pick, not seek it. It is beyond us.",
                "The Miner King still guards it, waiting for one worthy of escape."
            ]
        };
    }
    
    /**
     * Initialize the unified dialogue pool
     */
    async initializePool() {
        await UnifiedDialoguePool.initialize();
        console.log('[AIShopDialogue] Unified pool initialized for cost savings');
        
        // Get initial stats
        const stats = UnifiedDialoguePool.getStatsReport();
        if (stats.shop.totalDialogues > 0) {
            console.log(`[AIShopDialogue] Loaded ${stats.shop.totalDialogues} existing shop dialogues`);
        }
    }
    
    /**
     * Get shop type from shop data (helper for pooling)
     */
    getShopType(shop) {
        const name = shop.name.toLowerCase();
        if (name.includes('coal')) return 'coal';
        if (name.includes('topaz')) return 'topaz';
        if (name.includes('diamond')) return 'diamond';
        if (name.includes('emerald')) return 'emerald';
        if (name.includes('ruby')) return 'ruby';
        if (name.includes('obsidian')) return 'obsidian';
        if (name.includes('mythril')) return 'mythril';
        if (name.includes('adamantite')) return 'adamantite';
        if (name.includes('copper')) return 'copper';
        if (name.includes('iron')) return 'iron';
        if (name.includes('crystal')) return 'crystal';
        if (name.includes('fossil')) return 'fossil';
        if (name.includes('inn') || name.includes('tavern')) return 'inn';
        if (name.includes('hunter') || name.includes('lodge')) return 'hunter';
        if (name.includes('noble')) return 'noble';
        return 'general';
    }
    
    /**
     * Get shopkeeper mood based on various factors
     */
    getShopkeeperMood(shop) {
        const hour = new Date().getHours();
        const moods = [];
        
        // Time-based moods
        if (hour < 6) moods.push('tired', 'grumpy');
        else if (hour < 12) moods.push('energetic', 'welcoming');
        else if (hour < 17) moods.push('busy', 'focused');
        else if (hour < 21) moods.push('relaxed', 'chatty');
        else moods.push('tired', 'closing-soon');
        
        // Shop-based moods
        if (shop.name.includes('Inn')) moods.push('friendly', 'hospitable');
        if (shop.name.includes('Abyss')) moods.push('ominous', 'cryptic');
        if (shop.name.includes('Diamond')) moods.push('superior', 'calculating');
        if (shop.name.includes('Copper')) moods.push('practical', 'no-nonsense');
        
        return moods[Math.floor(Math.random() * moods.length)];
    }

    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 6) return "the void hours";
        if (hour < 12) return "morning expansion";
        if (hour < 17) return "eternal noon";
        if (hour < 21) return "the fading light";
        return "abyssal midnight";
    }

    getRandomWeather() {
        const weather = [
            "thick with void mist that steals warmth",
            "echoing with the vast creature's rumblings",
            "expanding - new spaces forming from nothing",
            "heavy with forgotten memories",
            "crackling with gacha energy",
            "eerily silent as if the void is listening",
            "pulsing with ominous vibrations",
            "consuming - the center void grows hungry"
        ];
        return weather[Math.floor(Math.random() * weather.length)];
    }

    /**
     * Load active voice channels for awareness
     * @param {string} guildId - Discord guild ID
     */
    async loadActiveVCs(guildId) {
        try {
            const activeVCs = await GachaVC.find({ guildId }).lean();
            const activeLocations = activeVCs.map(vc => {
                const gachaServer = gachaServers.find(g => g.id === vc.typeId);
                return gachaServer ? {
                    name: gachaServer.name,
                    type: gachaServer.type,
                    rarity: gachaServer.rarity
                } : null;
            }).filter(Boolean);
            
            this.worldContext.activeVCs = activeLocations;
            console.log(`[AIShopDialogue] Loaded ${activeLocations.length} active locations`);
        } catch (error) {
            console.error('[AIShopDialogue] Error loading active VCs:', error);
            this.worldContext.activeVCs = [];
        }
    }

    /**
     * Generate dialogue for failed sale (don't have item) - WITH POOLING
     * @param {Object} shop - Shop data
     * @param {Object} item - Item attempted to sell
     * @param {number} quantity - Quantity they tried to sell
     * @param {number} available - How many they actually have
     * @returns {Promise<string>} Generated dialogue
     */
    async generateNoItemDialogue(shop, item = null, quantity = 0, available = 0) {
        const shopkeeper = shop.shopkeeper;
        if (!shopkeeper) {
            if (available === 0) {
                return shop.failureOther?.[0] || "You don't seem to have that item.";
            }
            return shop.failureOther?.[0] || `You only have ${available} of those.`;
        }
        
        // Create context for pooling
        const contextKey = `noitem-${available === 0 ? 'none' : 'insufficient'}`;
        const contextData = {
            shopkeeper: shopkeeper.name,
            shopType: this.getShopType(shop),
            available: available,
            requested: quantity
        };
        
        // Use unified pool
        const dialogue = await UnifiedDialoguePool.getDialogue(
            'shop',
            'noItem',
            contextKey,
            async () => {
                // Existing AI generation code
                if (!this.isAvailable()) return null;
                
                const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in HELLUNGI.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio} (You're from another world, trapped here like everyone else)
Personality: ${shopkeeper.personality}
Context: HELLUNGI is a dimensional abyss where lost souls from different worlds are trapped.

A customer is trying to sell ${quantity} x ${item ? item.name : 'an item'} but they only have ${available}.
${available === 0 ? "They don't have any to sell!" : `They only have ${available}.`}

Generate a SHORT response that:
- Points out they don't have the item (or enough of it)
- Reflects your personality
- MAXIMUM 80 CHARACTERS (keep it concise but complete)
- Is about the item, NOT money

Respond with ONLY the dialogue, no quotes, UNDER 80 CHARACTERS.`;

                const response = await this.openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 30,
                    temperature: 0.8,
                });

                return response.choices[0].message.content.trim();
            },
            contextData
        );
        
        if (dialogue) return this.truncateDialogue(dialogue);
        
        // Fallback
        if (available === 0) {
            return shop.failureOther?.[0] || "You don't seem to have that item.";
        }
        return shop.failureOther?.[0] || `You only have ${available} of those.`;
    }

    /**
     * Determine if this is a mining-related shop
     */
    isMiningShop(shop) {
        const miningKeywords = ['mine', 'mining', 'coal', 'topaz', 'diamond', 'emerald', 'ruby', 'obsidian', 
                                'mythril', 'adamantite', 'copper', 'iron', 'crystal', 'fossil', 'ore', 
                                'quarry', 'excavation', 'gems', 'vault', 'abyss', 'depths', 'cavern'];
        const desc = (shop.description || shop.name).toLowerCase();
        return miningKeywords.some(keyword => desc.includes(keyword));
    }

    /**
     * Get appropriate world context based on shop type
     */
    getWorldContext(shop) {
        const isMining = this.isMiningShop(shop);
        
        if (!isMining) {
            // Tavern/Inn context in Hellungi
            return {
                location: shop.description || "A bustling interdimensional establishment",
                currentTime: this.getTimeOfDay(),
                currentWeather: this.getTavernWeather(),
                atmosphere: "The sounds of otherworldly languages and dimensional static fill the air",
                
                recentEvents: [
                    "Worldwalkers from the Crystal Dimension just arrived",
                    "The Portal Authority increased transit fees again",
                    "Refugees from a dying world seek shelter here",
                    "A dimensional scholar claims to have mapped new routes",
                    "The convergence festival approaches when all portals align",
                    "Strange beings from the Void Realm were spotted nearby",
                    "Interdimensional merchants offer impossible wares"
                ]
            };
        }
        
        // Mining context in Hellungi (still has portals)
        return {
            ...this.worldContext,
            recentEvents: [
                "Portal instability has revealed new ore deposits",
                "Miners from the Iron World share advanced techniques",
                "Reality rifts in the mines lead to gem-rich dimensions",
                "The Portal Authority claims mining rights on new rifts",
                "Crystallized portal energy sells for high prices",
                "Void creatures infest the lower tunnels",
                "An ancient portal was uncovered in shaft seven"
            ]
        };
    }

    getTavernWeather() {
        const weather = [
            "cozy despite the dimensional static",
            "lively with interdimensional patrons",
            "quiet between portal arrivals",
            "packed with worldwalkers",
            "smoky from exotic otherworldly cuisines",
            "warm with the glow of portal energies"
        ];
        return weather[Math.floor(Math.random() * weather.length)];
    }

    /**
     * Determine shopkeeper's stance on The One Pick based on personality
     */
    getOnePickStance(shopkeeper) {
        const personality = shopkeeper.personality.toLowerCase();
        
        if (personality.includes('practical') || personality.includes('skeptic') || personality.includes('ruthless')) {
            return 'skeptic';
        } else if (personality.includes('mystical') || personality.includes('ethereal') || personality.includes('psychic')) {
            return 'believer';
        } else if (personality.includes('mysterious') || personality.includes('cryptic') || personality.includes('alien')) {
            return 'mysterious';
        } else if (personality.includes('ancient') || personality.includes('wise') || personality.includes('sacred')) {
            return 'reverent';
        }
        
        // Random stance for neutral personalities
        const stances = ['believer', 'skeptic', 'mysterious', 'reverent'];
        return stances[Math.floor(Math.random() * stances.length)];
    }
    
    /**
     * Generate idle dialogue with AI (extracted for pooling)
     */
    async generateIdleWithAI(shop, shopkeeper, options) {
        // Decide what to mention in dialogue
        const mentionTheOnePick = Math.random() < 0.10; // 10% chance
        const mentionOtherArtifacts = Math.random() < 0.05; // 5% chance for other legendary items
        const mentionPrices = Math.random() < 0.3 && options.shopContext;
        const mentionRotationalItem = Math.random() < 0.25 && options.shopContext?.rotationalItems?.length > 0;
        const mentionActiveLocations = Math.random() < 0.15 && this.worldContext.activeVCs.length > 0;
        
        const worldContext = this.getWorldContext(shop);
        const recentEvent = worldContext.recentEvents[
            Math.floor(Math.random() * worldContext.recentEvents.length)
        ];

        // Add context about other active locations
        let activeLocationContext = '';
        if (this.worldContext.activeVCs.length > 0) {
            const locations = this.worldContext.activeVCs.map(loc => loc.name).join(', ');
            activeLocationContext = `\nActive locations in HELLUNGI: ${locations}`;
        }
        
        // Mention other legendary artifacts occasionally
        let artifactContext = '';
        if (mentionOtherArtifacts) {
            const artifacts = ['Blue Breeze', "Midas' Burden", 'Earthshaker', 'Whisper of the Void', 'Shadow Legion Amulet'];
            const artifact = artifacts[Math.floor(Math.random() * artifacts.length)];
            artifactContext = `\nYou've heard rumors about ${artifact} being found recently.`;
        }

        let prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in HELLUNGI.
        
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio} (You're from another world, trapped here like everyone)
Personality: ${shopkeeper.personality}
Setting: HELLUNGI - ${worldContext.location}, during ${worldContext.currentTime}
Current conditions: ${worldContext.currentWeather}
Recent event: ${recentEvent}
${activeLocationContext}
${artifactContext}

World Context: HELLUNGI is a dimensional abyss with no sky or ground. Everyone here is trapped, having arrived from other worlds without knowing how. The space expands, mines appear from nothing, and a vast creature rumbles below. The center void consumes memories. Most don't even know this place is called HELLUNGI.

${options.playerClass ? `Customer type: Someone who was a ${options.playerClass} in their world` : 'Waiting for other lost souls'}
${options.mood ? `Your current mood: ${options.mood}` : ''}
`;

        // Add shop inventory context if available
        if (options.shopContext) {
            const ctx = options.shopContext;
            
            // Add price information
            if (ctx.overallPriceStatus !== 'normal') {
                prompt += `\nIMPORTANT: Prices are ${ctx.overallPriceStatus} today!`;
            }
            
            // Add rotational items info
            if (ctx.rotationalItems && ctx.rotationalItems.length > 0) {
                const featuredItems = ctx.rotationalItems.slice(0, 2).map(item => {
                    let desc = item.name;
                    if (item.priceStatus === 'high') desc += ' (overpriced today)';
                    else if (item.priceStatus === 'low') desc += ' (great deal!)';
                    return desc;
                });
                prompt += `\nToday's special items: ${featuredItems.join(', ')}`;
            }
        }

        // Mention The One Pick occasionally
        if (mentionTheOnePick) {
            const stance = this.getOnePickStance(shopkeeper);
            const opinion = this.onePickOpinions[stance][
                Math.floor(Math.random() * this.onePickOpinions[stance].length)
            ];
            
            prompt += `\nIMPORTANT: You must naturally work in this opinion about The One Pick (the legendary pickaxe that may be the key to escaping HELLUNGI): "${opinion}"
Make it feel organic to your personality and current conversation.`;
        }
        
        // Mention active locations occasionally
        if (mentionActiveLocations && this.worldContext.activeVCs.length > 0) {
            const randomLoc = this.worldContext.activeVCs[Math.floor(Math.random() * this.worldContext.activeVCs.length)];
            prompt += `\nMention that ${randomLoc.name} has been active lately, or that lost souls have been appearing there.`;
        }

        prompt += `\nGenerate a single line of idle shop dialogue or action that:
- Reflects your personality and that you're trapped here from another world
- Might reference your confusion about how you got here, the expanding void, the creature's rumblings, or memories being consumed
- Sounds natural for someone trapped in HELLUNGI running a shop
- Stays completely in character
- Remember you're trapped in HELLUNGI, a dimension with no escape (yet)

CRITICAL: Maximum 100 characters! Keep it concise but complete.
Respond with ONLY the dialogue or action, UNDER 100 CHARACTERS.`;

        const response = await this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 40,
            temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.9,
        });

        return response.choices[0].message.content.trim();
    }

    /**
     * Generate idle dialogue for a shopkeeper - WITH POOLING
     * @param {Object} shop - Shop data including shopkeeper info
     * @param {Object} options - Additional context options
     * @returns {Promise<string>} Generated dialogue
     */
    async generateIdleDialogue(shop, options = {}) {
        const shopkeeper = shop.shopkeeper;
        if (!shopkeeper) {
            if (shop.idleDialogue && shop.idleDialogue.length > 0) {
                return shop.idleDialogue[Math.floor(Math.random() * shop.idleDialogue.length)];
            }
            return "Welcome to my shop, traveler!";
        }
        
        // Load active VCs if guildId provided
        if (options.guildId) {
            await this.loadActiveVCs(options.guildId);
        }
        
        // Create context for pooling
        const shopType = this.getShopType(shop);
        const mood = options.mood || this.getShopkeeperMood(shop);
        const contextKey = `idle-${shopType}-${mood}`;
        const contextData = {
            shopkeeper: shopkeeper.name,
            shopType: shopType,
            mood: mood,
            priceStatus: options.shopContext?.overallPriceStatus || 'normal',
            hasSpecials: options.shopContext?.rotationalItems?.length > 0
        };
        
        // Use unified pool
        const dialogue = await UnifiedDialoguePool.getDialogue(
            'shop',
            'idle',
            contextKey,
            async () => {
                if (!this.isAvailable()) return null;
                return await this.generateIdleWithAI(shop, shopkeeper, options);
            },
            contextData
        );
        
        if (dialogue) return this.truncateDialogue(dialogue);
        
        // Fallback
        if (shop.idleDialogue && shop.idleDialogue.length > 0) {
            return shop.idleDialogue[Math.floor(Math.random() * shop.idleDialogue.length)];
        }
        return "Welcome to my shop, traveler!";
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
     * Generate dialogue for successful purchase - WITH POOLING
     * @param {Object} shop - Shop data
     * @param {Object} item - Item being purchased
     * @param {number} price - Total purchase price
     * @param {Object} buyer - Buyer information
     * @param {number} quantity - Number of items purchased
     * @returns {Promise<string>} Generated dialogue
     */
    async generatePurchaseDialogue(shop, item, price, buyer = {}, quantity = 1, playerContext = null) {
        const shopkeeper = shop.shopkeeper;
        if (!shopkeeper) {
            return shop.successBuy?.[0] || "A pleasure doing business!";
        }
        
        // Create context for pooling
        const shopType = this.getShopType(shop);
        const wealthTier = playerContext?.wealthTier || 'normal';
        const hasLegendary = playerContext?.hasLegendary || false;
        const contextKey = `purchase-${shopType}-${wealthTier}-${hasLegendary ? 'legendary' : 'normal'}`;
        const contextData = {
            shopkeeper: shopkeeper.name,
            shopType: shopType,
            quantity: quantity > 5 ? 'bulk' : quantity === 1 ? 'single' : 'moderate',
            wealthTier: wealthTier,
            hasLegendary: hasLegendary,
            customerType: playerContext?.customerType || 'normal'
        };
        
        // Use unified pool
        const dialogue = await UnifiedDialoguePool.getDialogue(
            'shop',
            'purchase',
            contextKey,
            async () => {
                if (!this.isAvailable()) return null;
                return await this.generatePurchaseWithAI(shop, shopkeeper, item, price, buyer, quantity, playerContext);
            },
            contextData
        );
        
        if (dialogue) return this.truncateDialogue(dialogue);
        
        // Fallback
        const fallback = shop.successBuy?.[0] || "A pleasure doing business!";
        return this.truncateDialogue(fallback);
    }
    
    /**
     * Generate purchase dialogue with AI (extracted for pooling)
     */
    async generatePurchaseWithAI(shop, shopkeeper, item, price, buyer, quantity, playerContext) {
        const pricePerItem = Math.floor(price / quantity);
        const isBulkPurchase = quantity > 5;
        const isSmallPurchase = quantity === 1;
        const isModerateQuantity = quantity > 1 && quantity <= 5;
        
        // Build customer profile string
        let customerProfile = '';
        if (playerContext) {
            // Legendary status comes first - it's the most impressive
            if (playerContext.hasMultipleLegendaries) {
                customerProfile += `\n⚡ LEGENDARY COLLECTOR - Owns ${playerContext.legendaryCount} legendary items!`;
                const legendaryNames = playerContext.legendaryItems.map(item => item.name).join(', ');
                customerProfile += `\n   Wielding: ${legendaryNames}`;
            } else if (playerContext.hasLegendary) {
                customerProfile += `\n⚡ LEGENDARY OWNER - Possesses the ${playerContext.legendaryItems[0].name}!`;
                if (!playerContext.legendaryItems[0].wellMaintained) {
                    customerProfile += ' (poorly maintained)';
                }
            }
            
            // Wealth status
            if (playerContext.isRichest) {
                customerProfile += '\n💰 THE RICHEST PLAYER IN THE SERVER!';
            } else if (playerContext.wealthTier === 'wealthy') {
                customerProfile += '\n💰 Wealthy customer (top 3 richest).';
            }
            
            // Customer loyalty
            if (playerContext.customerType === 'vip') {
                customerProfile += '\n⭐ VIP CUSTOMER - has spent over 10,000 coins in your shop!';
            } else if (playerContext.customerType === 'regular') {
                customerProfile += '\n⭐ Regular customer - frequently shops here.';
            }
        }
        
        const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in HELLUNGI.
        
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio} (You're trapped here from another world)
Personality: ${shopkeeper.personality}
Context: HELLUNGI is a dimensional abyss where everyone is trapped. No sky, no ground, only endless void.
${customerProfile}

A customer just purchased: ${quantity}x ${item.name} for ${price} coins total (${pricePerItem} each)
${buyer?.displayName ? `Customer name: "${this.capitalizePlayerName(buyer.displayName)}"` : ''}

Generate SHORT success dialogue:
- React to quantity (${quantity} items)
- Stay in character
- MAXIMUM 80 CHARACTERS (keep it concise but complete)
${playerContext?.hasLegendary ? '- BE IN AWE of their legendary item(s)' : ''}
${playerContext?.isRichest ? '- Acknowledge their wealth' : ''}

Respond with ONLY the dialogue, UNDER 80 CHARACTERS`;

        const response = await this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 30,
            temperature: 0.85,
        });

        return response.choices[0].message.content.trim();
    }

    /**
     * Generate dialogue for failed purchase (too poor) - WITH POOLING
     * @param {Object} shop - Shop data
     * @param {Object} item - Item attempted to purchase
     * @param {number} shortBy - How much money they're short
     * @returns {Promise<string>} Generated dialogue
     */
    async generatePoorDialogue(shop, item = null, shortBy = 0) {
        const shopkeeper = shop.shopkeeper;
        if (!shopkeeper) {
            return shop.failureTooPoor?.[0] || "You need more coins!";
        }
        
        // Create context for pooling
        const shopType = this.getShopType(shop);
        const contextKey = `poor-${shopType}`;
        const contextData = {
            shopkeeper: shopkeeper.name,
            shopType: shopType,
            shortBy: shortBy > 0
        };
        
        // Use unified pool
        const dialogue = await UnifiedDialoguePool.getDialogue(
            'shop',
            'poor',
            contextKey,
            async () => {
                if (!this.isAvailable()) return null;
                
                const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in HELLUNGI.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio} (You're trapped here from another world)
Personality: ${shopkeeper.personality}

A customer cannot afford ${item ? item.name : 'an item'}${shortBy > 0 ? `, they're ${shortBy} coins short` : ''}.

Context: You're both trapped in HELLUNGI, surviving in this dimensional abyss.

Generate SHORT rejection:
- Need more money message
- Stay in character
- MAXIMUM 80 CHARACTERS (keep it concise but complete)

Respond with ONLY the dialogue, UNDER 80 CHARACTERS.`;

                const response = await this.openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 30,
                    temperature: 0.8,
                });

                return response.choices[0].message.content.trim();
            },
            contextData
        );
        
        if (dialogue) return this.truncateDialogue(dialogue);
        
        // Fallback
        const fallback = shop.failureTooPoor?.[0] || "You need more coins!";
        return this.truncateDialogue(fallback);
    }

    /**
     * Generate dialogue for selling items to shop - WITH POOLING
     * @param {Object} shop - Shop data
     * @param {Object} item - Item being sold
     * @param {number} price - Total sell price
     * @param {number} quantity - Number of items being sold
     * @returns {Promise<string>} Generated dialogue
     */
    async generateSellDialogue(shop, item, price, quantity = 1, playerContext = null, seller = null) {
        const shopkeeper = shop.shopkeeper;
        if (!shopkeeper) {
            return shop.successSell?.[0] || "I'll take that off your hands.";
        }
        
        // Create context for pooling
        const shopType = this.getShopType(shop);
        const wealthTier = playerContext?.wealthTier || 'normal';
        const contextKey = `sell-${shopType}-${wealthTier}`;
        const contextData = {
            shopkeeper: shopkeeper.name,
            shopType: shopType,
            quantity: quantity > 5 ? 'bulk' : quantity === 1 ? 'single' : 'moderate',
            wealthTier: wealthTier,
            hasLegendary: playerContext?.hasLegendary || false
        };
        
        // Use unified pool
        const dialogue = await UnifiedDialoguePool.getDialogue(
            'shop',
            'sell',
            contextKey,
            async () => {
                if (!this.isAvailable()) return null;
                return await this.generateSellWithAI(shop, shopkeeper, item, price, quantity, playerContext, seller);
            },
            contextData
        );
        
        if (dialogue) return this.truncateDialogue(dialogue);
        
        // Fallback
        const fallback = shop.successSell?.[0] || "I'll take that off your hands.";
        return this.truncateDialogue(fallback);
    }
    
    /**
     * Generate sell dialogue with AI (extracted for pooling)
     */
    async generateSellWithAI(shop, shopkeeper, item, price, quantity, playerContext, seller) {
        const pricePerItem = Math.floor(price / quantity);
        const isBulkSale = quantity > 5;
        const isSingleItem = quantity === 1;
        const isModerateQuantity = quantity > 1 && quantity <= 5;
        
        // Build customer profile for selling
        let customerProfile = '';
        if (playerContext) {
            if (playerContext.hasLegendary) {
                customerProfile += `\n⚡ Bearer of legendary items is selling to you!`;
            }
            
            if (playerContext.isRichest) {
                customerProfile += '\n💰 THE RICHEST PLAYER selling to you (suspicious?)!';
            } else if (playerContext.wealthTier === 'poor') {
                customerProfile += '\n💰 Poor customer, probably needs the money.';
            }
            
            if (playerContext.customerType === 'vip') {
                customerProfile += '\n⭐ Your best customer is selling back to you.';
            }
        }
        
        const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in HELLUNGI.
        
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio} (You're trapped here from another world)
Personality: ${shopkeeper.personality}
Context: HELLUNGI is a dimensional void where lost souls trade to survive.
${customerProfile}

A customer just sold you: ${quantity}x ${item.name} for ${price} coins total (${pricePerItem} each)
${seller?.displayName ? `Seller name: "${this.capitalizePlayerName(seller.displayName)}"` : ''}

Generate SHORT sell acceptance:
- React to quantity (${quantity} items)
- Stay in character
- MAXIMUM 80 CHARACTERS (keep it concise but complete)
${playerContext?.hasLegendary ? '- REACT to a legendary hero selling items' : ''}
${playerContext?.isRichest ? '- Wonder why the richest player needs to sell' : ''}

Respond with ONLY the dialogue, UNDER 80 CHARACTERS.`;

        const response = await this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 30,
            temperature: 0.85,
        });

        return response.choices[0].message.content.trim();
    }

    /**
     * Get shop specialty based on description or name
     */
    getShopSpecialty(shop) {
        // Use the description field if available
        if (shop.description) {
            return shop.description;
        }
        
        // Fallback to inferring from name
        if (shop.name.includes('Coal')) return "basic mining supplies and coal";
        if (shop.name.includes('Topaz')) return "golden topaz gems and jewelry";
        if (shop.name.includes('Diamond')) return "precious diamonds and luxury items";
        if (shop.name.includes('Emerald')) return "mystical emeralds and nature magic";
        if (shop.name.includes('Ruby')) return "fiery rubies and forge items";
        if (shop.name.includes('Obsidian')) return "volcanic glass and sharp blades";
        if (shop.name.includes('Mythril')) return "blessed mythril and divine artifacts";
        if (shop.name.includes('Adamantite')) return "reality-bending adamantite";
        if (shop.name.includes('Copper')) return "honest copper goods";
        if (shop.name.includes('Iron')) return "strong iron equipment";
        if (shop.name.includes('Crystal')) return "magical crystals and prophecies";
        if (shop.name.includes('Fossil')) return "ancient fossils and history";
        if (shop.name.includes('Inn') || shop.name.includes('Tavern')) return "food, drink, and warm beds";
        if (shop.name.includes('Hunter') || shop.name.includes('Lodge')) return "hearty meals, trail rations, and hunting supplies";
        if (shop.name.includes('Noble') || shop.name.includes('Rest')) return "exquisite cuisine and luxury accommodations";
        return "various goods and supplies";
    }

    /**
     * Helper to determine if price is good for shop
     */
    isPriceGood(item, price) {
        const baseValue = item.value || 10;
        return price > baseValue * 1.1;
    }

    /**
     * Helper to determine if buy price is good for shop
     */
    isGoodBuy(item, price) {
        const baseValue = item.value || 10;
        return price < baseValue * 0.4;
    }

    /**
     * Truncate dialogue to maximum length at word boundaries
     * This method ensures we don't cut off in the middle of words
     */
    truncateDialogue(text) {
        if (!text) return '';
        
        // Remove quotes first if present
        text = text.replace(/^["']|["']$/g, '').trim();
        
        // If already within limit, return as is
        if (text.length <= this.MAX_DIALOGUE_LENGTH) return text;
        
        // Find a good breaking point - look for last space before limit
        const maxLength = this.MAX_DIALOGUE_LENGTH - 3; // Reserve space for "..."
        let truncateAt = maxLength;
        
        // Look for the last space, period, comma, or other punctuation before the limit
        const breakPoints = [' ', '.', ',', '!', '?', ';', ':', '-'];
        for (let i = maxLength; i > maxLength * 0.7; i--) { // Don't go back too far
            if (breakPoints.includes(text[i])) {
                truncateAt = i;
                break;
            }
        }
        
        // If the break point is punctuation, include it
        if (['.', '!', '?'].includes(text[truncateAt])) {
            return text.substring(0, truncateAt + 1).trim();
        }
        
        // Otherwise add ellipsis
        return text.substring(0, truncateAt).trim() + '...';
    }
    
    /**
     * Check if AI is available and configured
     * @returns {boolean} Whether AI dialogue generation is available
     */
    isAvailable() {
        return !!process.env.OPENAI_API_KEY;
    }

    /**
     * Update world context (for dynamic events)
     * @param {Object} updates - Updates to world context
     */
    updateWorldContext(updates) {
        this.worldContext = { ...this.worldContext, ...updates };
    }

    /**
     * Add a recent event to the world
     * @param {string} event - Event description
     */
    addRecentEvent(event) {
        this.worldContext.recentEvents.unshift(event);
        if (this.worldContext.recentEvents.length > 8) {
            this.worldContext.recentEvents.pop();
        }
    }
    
    /**
     * Get pool statistics
     */
    getPoolStats() {
        const stats = UnifiedDialoguePool.getStatsReport();
        return {
            shop: stats.shop,
            total: stats.total,
            efficiency: `Shop system: ${stats.shop.efficiency}`,
            savings: `Total saved: $${stats.total.costSaved.toFixed(2)}`
        };
    }
}

module.exports = AIShopDialogueGenerator;