// AI Shop Dialogue Generator - Generates contextual shopkeeper dialogue using OpenAI
// This module creates dynamic dialogue for shop interactions with personality and lore

const OpenAI = require('openai');
require('dotenv').config();
const GachaVC = require('../models/activevcs');
const gachaServers = require('../data/gachaServers.json');
const { UNIQUE_ITEMS } = require('../data/uniqueItemsSheet');

class AIShopDialogueGenerator {
    constructor() {
        // Initialize OpenAI client from .env
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        // Maximum dialogue length
        this.MAX_DIALOGUE_LENGTH = 200;
        
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
     * Generate dialogue for failed sale (don't have item)
     * @param {Object} shop - Shop data
     * @param {Object} item - Item attempted to sell
     * @param {number} quantity - Quantity they tried to sell
     * @param {number} available - How many they actually have
     * @returns {Promise<string>} Generated dialogue
     */
    async generateNoItemDialogue(shop, item = null, quantity = 0, available = 0) {
        try {
            const shopkeeper = shop.shopkeeper;
            if (!shopkeeper) {
                throw new Error('Shop missing shopkeeper data');
            }

            const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in HELLUNGI.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio} (You're from another world, trapped here like everyone else)
Personality: ${shopkeeper.personality}
Context: HELLUNGI is a dimensional abyss where lost souls from different worlds are trapped.

A customer is trying to sell ${quantity} x ${item ? item.name : 'an item'} but they only have ${available}.
${available === 0 ? "They don't have any to sell!" : `They only have ${available}.`}

Generate a VERY SHORT response that:
- Points out they don't have the item (or enough of it)
- Reflects your personality
- MAXIMUM 200 CHARACTERS (1-2 sentences)
- Is about the item, NOT money

Respond with ONLY the dialogue, no quotes, UNDER 200 CHARACTERS.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 60,
                temperature: 0.8,
            });

            const dialogue = response.choices[0].message.content.trim();
            return this.truncateDialogue(dialogue);
        } catch (error) {
            console.error('[AIShopDialogue] Error generating no item dialogue:', error.message);
            if (available === 0) {
                return shop.failureOther?.[0] || "You don't seem to have that item.";
            }
            return shop.failureOther?.[0] || `You only have ${available} of those.`;
        }
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
     * Generate idle dialogue for a shopkeeper
     * @param {Object} shop - Shop data including shopkeeper info
     * @param {Object} options - Additional context options
     * @returns {Promise<string>} Generated dialogue
     */
    async generateIdleDialogue(shop, options = {}) {
        try {
            const shopkeeper = shop.shopkeeper;
            if (!shopkeeper) {
                throw new Error('Shop missing shopkeeper data');
            }
            
            // Load active VCs if guildId provided
            if (options.guildId) {
                await this.loadActiveVCs(options.guildId);
            }

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
                
                // Add static items with notable prices
                const notableStatic = ctx.staticItems?.filter(item => item.priceStatus !== 'normal');
                if (notableStatic && notableStatic.length > 0) {
                    const notable = notableStatic[0];
                    prompt += `\n${notable.name} is ${notable.priceStatus === 'high' ? 'expensive' : 'cheap'} today at ${notable.currentPrice}c`;
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

            // Add specific dialogue instructions based on context
            let dialogueInstructions = [];
            if (mentionPrices && options.shopContext?.overallPriceStatus && options.shopContext.overallPriceStatus !== 'normal') {
                if (options.shopContext.overallPriceStatus === 'mostly high') {
                    dialogueInstructions.push('complain about or mention the high prices today');
                } else if (options.shopContext.overallPriceStatus === 'mostly low') {
                    dialogueInstructions.push('advertise the good deals or low prices');
                } else if (options.shopContext.overallPriceStatus === 'mixed') {
                    dialogueInstructions.push('comment on the unpredictable price fluctuations');
                }
            }
            if (mentionRotationalItem && options.shopContext?.rotationalItems?.length > 0) {
                const item = options.shopContext.rotationalItems[0];
                if (item.priceStatus === 'low') {
                    dialogueInstructions.push(`promote your special item "${item.name}" at a great price`);
                } else if (item.priceStatus === 'high') {
                    dialogueInstructions.push(`mention your rare "${item.name}" (worth the premium price)`);
                } else {
                    dialogueInstructions.push(`mention your featured item "${item.name}" that just arrived`);
                }
            }
            
            prompt += `\nGenerate a single line of idle shop dialogue or action that:
- Reflects your personality and that you're trapped here from another world
- Might reference your confusion about how you got here, the expanding void, the creature's rumblings, or memories being consumed
- Could express fear, hope, resignation, or determination about your situation
${dialogueInstructions.length > 0 ? '- Should ' + dialogueInstructions.join(' OR ') : ''}
- Sounds natural for someone trapped in HELLUNGI running a shop
${mentionTheOnePick ? '- Naturally incorporates your opinion about The One Pick' : ''}
- Stays completely in character
- Remember you're trapped in HELLUNGI, a dimension with no escape (yet)

You can EITHER:
1. Say something (just write the dialogue with quotes like "Another quiet day between portals.")
2. Perform an action (start with * for actions like *yawns* or *adjusts dimensional stabilizer*)
3. Make a sound/gesture (start with ~ for sounds like ~sighs or ~hums otherworldly tune)
4. Combine both if needed (like: *looks up from ledger* "Another worldwalker arrives.")

CRITICAL: Maximum 200 characters! (1-2 natural sentences)
Respond with ONLY the dialogue or action, UNDER 200 CHARACTERS.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 80,
                temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.9,
            });

            const dialogue = response.choices[0].message.content.trim();
            return this.truncateDialogue(dialogue);
        } catch (error) {
            console.error('[AIShopDialogue] Error generating idle dialogue:', error.message);
            // Fallback to existing dialogue
            if (shop.idleDialogue && shop.idleDialogue.length > 0) {
                return shop.idleDialogue[Math.floor(Math.random() * shop.idleDialogue.length)];
            }
            return "Welcome to my shop, traveler!";
        }
    }

    /**
     * Generate dialogue for successful purchase
     * @param {Object} shop - Shop data
     * @param {Object} item - Item being purchased
     * @param {number} price - Total purchase price
     * @param {Object} buyer - Buyer information
     * @param {number} quantity - Number of items purchased
     * @returns {Promise<string>} Generated dialogue
     */
    async generatePurchaseDialogue(shop, item, price, buyer = {}, quantity = 1, playerContext = null) {
        try {
            const shopkeeper = shop.shopkeeper;
            if (!shopkeeper) {
                throw new Error('Shop missing shopkeeper data');
            }

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
                
                // Special item mentions
                if (playerContext.hasMidasBurden) {
                    if (playerContext.midasBlessing === 0) {
                        customerProfile += "\n🎲 Bearer of Midas' Burden - CURSED with terrible luck!";
                    } else if (playerContext.midasBlessing === 100) {
                        customerProfile += "\n🎲 Bearer of Midas' Burden - BLESSED with incredible fortune!";
                    } else {
                        customerProfile += "\n🎲 Bearer of the legendary Midas' Burden!";
                    }
                }
                
                // Wealth status
                if (playerContext.isRichest) {
                    customerProfile += '\n💰 THE RICHEST PLAYER IN THE SERVER!';
                } else if (playerContext.wealthTier === 'wealthy') {
                    customerProfile += '\n💰 Wealthy customer (top 3 richest).';
                } else if (playerContext.wealthTier === 'rich') {
                    customerProfile += '\n💰 Rich customer.';
                }
                
                // Customer loyalty
                if (playerContext.customerType === 'vip') {
                    customerProfile += '\n⭐ VIP CUSTOMER - has spent over 10,000 coins in your shop!';
                } else if (playerContext.customerType === 'regular') {
                    customerProfile += '\n⭐ Regular customer - frequently shops here.';
                }
                
                // Stats and power
                if (playerContext.totalStatPower > 100) {
                    customerProfile += '\n💪 Very powerful worldwalker with exceptional stats.';
                } else if (playerContext.hasHighStats) {
                    customerProfile += '\n💪 Experienced dimensional traveler with good equipment.';
                }
                
                if (playerContext.stats.luck > 50 && !playerContext.hasMidasBurden) {
                    customerProfile += '\n🍀 Extremely lucky individual!';
                }
                if (playerContext.stats.mining > 50) {
                    customerProfile += '\n⛏️ Master miner from the ore dimensions!';
                }
            }
            
            const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in HELLUNGI.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio} (You're trapped here from another world)
Personality: ${shopkeeper.personality}
Context: HELLUNGI is a dimensional abyss where everyone is trapped. No sky, no ground, only endless void.
${customerProfile}

A customer just purchased: ${quantity}x ${item.name} for ${price} coins total (${pricePerItem} each)
${buyer?.displayName ? `Customer name: "${buyer.displayName}"` : ''}
${buyer?.username && buyer?.username !== buyer?.displayName ? `(username: ${buyer.username})` : ''}
${playerContext ? `Customer wealth: ${playerContext.money} coins (${playerContext.wealthTier})` : ''}
${playerContext && playerContext.totalSpent > 0 ? `Total spent in your shop: ${playerContext.totalSpent} coins` : ''}
${this.isPriceGood(item, pricePerItem) ? 'This was a good deal for you!' : 'This was at a discount.'}
${isBulkPurchase ? 'This is a BULK PURCHASE - react accordingly!' : ''}
${isSmallPurchase ? 'Just a single item.' : ''}
${isModerateQuantity ? 'A moderate quantity purchase.' : ''}

Generate VERY SHORT success dialogue:
- React to quantity (${quantity} items)
- Stay in character
- MAXIMUM 150 CHARACTERS (1-2 sentences)
${buyer?.displayName ? `- You MAY address the customer by name ("${buyer.displayName}") when it feels natural` : ''}
${playerContext?.hasLegendary ? '- BE IN AWE of their legendary item(s) - they might help escape HELLUNGI!' : ''}
${playerContext?.hasMidasBurden ? '- Reference their cursed/blessed Midas item if appropriate' : ''}
${playerContext?.hasMultipleLegendaries ? '- Express hope that their legendaries might be the key to escape' : ''}
${playerContext?.isRichest ? '- Acknowledge their wealth (but we\'re all still trapped here)' : ''}
${playerContext?.customerType === 'vip' ? '- Show appreciation for their loyalty in these dark times' : ''}
${playerContext?.wealthTier === 'poor' && quantity > 1 ? '- Maybe sympathize with their struggle to survive here' : ''}
- Might reference being lost souls together, the expanding void, or hope for escape
- Sounds natural and conversational - use their name sparingly
- Remember you're both trapped in HELLUNGI, trying to survive

Respond with ONLY the dialogue, UNDER 150 CHARACTERS`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 60,
                temperature: 0.85,
            });

            const dialogue = response.choices[0].message.content.trim();
            return this.truncateDialogue(dialogue);
        } catch (error) {
            console.error('[AIShopDialogue] Error generating purchase dialogue:', error.message);
            const fallback = shop.successBuy?.[0] || "A pleasure doing business!";
            return this.truncateDialogue(fallback);
        }
    }

    /**
     * Generate dialogue for failed purchase (too poor)
     * @param {Object} shop - Shop data
     * @param {Object} item - Item attempted to purchase
     * @param {number} shortBy - How much money they're short
     * @returns {Promise<string>} Generated dialogue
     */
    async generatePoorDialogue(shop, item = null, shortBy = 0) {
        try {
            const shopkeeper = shop.shopkeeper;
            if (!shopkeeper) {
                throw new Error('Shop missing shopkeeper data');
            }

            const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in HELLUNGI.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio} (You're trapped here from another world)
Personality: ${shopkeeper.personality}

A customer cannot afford ${item ? item.name : 'an item'}${shortBy > 0 ? `, they're ${shortBy} coins short` : ''}.

Context: You're both trapped in HELLUNGI, surviving in this dimensional abyss.

Generate SHORT rejection:
- Need more money message
- Stay in character
- MAXIMUM 150 CHARACTERS (1-2 sentences)

Respond with ONLY the dialogue, UNDER 150 CHARACTERS.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 60,
                temperature: 0.8,
            });

            const dialogue = response.choices[0].message.content.trim();
            return this.truncateDialogue(dialogue);
        } catch (error) {
            console.error('[AIShopDialogue] Error generating poor dialogue:', error.message);
            const fallback = shop.failureTooPoor?.[0] || "You need more coins!";
            return this.truncateDialogue(fallback);
        }
    }

    /**
     * Generate dialogue for selling items to shop
     * @param {Object} shop - Shop data
     * @param {Object} item - Item being sold
     * @param {number} price - Total sell price
     * @param {number} quantity - Number of items being sold
     * @returns {Promise<string>} Generated dialogue
     */
    async generateSellDialogue(shop, item, price, quantity = 1, playerContext = null, seller = null) {
        try {
            const shopkeeper = shop.shopkeeper;
            if (!shopkeeper) {
                throw new Error('Shop missing shopkeeper data');
            }

            const pricePerItem = Math.floor(price / quantity);
            const isBulkSale = quantity > 5;
            const isSingleItem = quantity === 1;
            const isModerateQuantity = quantity > 1 && quantity <= 5;
            
            // Build customer profile for selling
            let customerProfile = '';
            if (playerContext) {
                // Legendary status - most notable
                if (playerContext.hasMultipleLegendaries) {
                    customerProfile += `\n⚡ LEGENDARY COLLECTOR with ${playerContext.legendaryCount} legendary items is selling to you!`;
                    const legendaryNames = playerContext.legendaryItems.map(item => item.name).join(', ');
                    customerProfile += `\n   They possess: ${legendaryNames}`;
                } else if (playerContext.hasLegendary) {
                    customerProfile += `\n⚡ Bearer of the legendary ${playerContext.legendaryItems[0].name} is selling to you!`;
                }
                
                if (playerContext.hasMidasBurden) {
                    if (playerContext.midasBlessing === 0) {
                        customerProfile += "\n🎲 Cursed by Midas' Burden - desperately unlucky!";
                    } else if (playerContext.midasBlessing === 100) {
                        customerProfile += "\n🎲 Blessed by Midas' Burden - incredibly fortunate!";
                    }
                }
                
                // Wealth context for selling
                if (playerContext.isRichest) {
                    customerProfile += '\n💰 THE RICHEST PLAYER selling to you (suspicious?)!';
                } else if (playerContext.wealthTier === 'poor') {
                    customerProfile += '\n💰 Poor customer, probably needs the money.';
                } else if (playerContext.wealthTier === 'wealthy') {
                    customerProfile += '\n💰 Wealthy customer (why are they selling?).';
                }
                
                if (playerContext.stats.mining > 50) {
                    customerProfile += '\n⛏️ Master miner - probably has quality goods from other dimensions.';
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
${seller?.displayName ? `Seller name: "${seller.displayName}"` : ''}
${seller?.username && seller?.username !== seller?.displayName ? `(username: ${seller.username})` : ''}
${playerContext ? `Customer current wealth: ${playerContext.money} coins` : ''}
${this.isGoodBuy(item, pricePerItem) ? 'This was a great deal for your shop!' : 'This was a fair price.'}
${isBulkSale ? 'This is a BULK SALE - they are offloading a lot of items!' : ''}
${isSingleItem ? 'Just a single item.' : ''}
${isModerateQuantity ? 'A moderate quantity.' : ''}

Generate SHORT sell acceptance:
- React to quantity (${quantity} items)
- Stay in character
- MAXIMUM 150 CHARACTERS (1-2 sentences)
${seller?.displayName ? `- You MAY address the seller by name ("${seller.displayName}") when it feels natural` : ''}
${playerContext?.hasLegendary ? '- REACT to a legendary hero selling items - show awe, suspicion, or opportunism' : ''}
${playerContext?.hasMultipleLegendaries ? '- Express shock that someone with multiple legendaries needs to sell' : ''}
${playerContext?.hasMidasBurden && playerContext?.midasBlessing === 0 ? '- Maybe reference their cursed luck' : ''}
${playerContext?.isRichest ? '- Wonder why the richest player needs to sell items' : ''}
${playerContext?.wealthTier === 'poor' ? '- Might show sympathy or take advantage based on personality' : ''}
${playerContext?.customerType === 'vip' ? '- Acknowledge their loyalty even when buying from them' : ''}
- Might wonder where they found these items in the expanding void
- Could reference the struggle of surviving in HELLUNGI
- Use their name sparingly for natural conversation
- Remember you're both trapped here, trying to survive

Respond with ONLY the dialogue, UNDER 150 CHARACTERS.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 60,
                temperature: 0.85,
            });

            const dialogue = response.choices[0].message.content.trim();
            return this.truncateDialogue(dialogue);
        } catch (error) {
            console.error('[AIShopDialogue] Error generating sell dialogue:', error.message);
            const fallback = shop.successSell?.[0] || "I'll take that off your hands.";
            return this.truncateDialogue(fallback);
        }
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
     * Truncate dialogue to maximum length
     */
    truncateDialogue(text) {
        if (!text) return '';
        // Remove quotes first if present
        text = text.replace(/^["']|["']$/g, '').trim();
        if (text.length <= this.MAX_DIALOGUE_LENGTH) return text;
        return text.substring(0, this.MAX_DIALOGUE_LENGTH - 3) + '...';
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
}

module.exports = AIShopDialogueGenerator;
