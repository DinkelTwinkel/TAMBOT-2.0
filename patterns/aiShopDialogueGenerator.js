// AI Shop Dialogue Generator - Generates contextual shopkeeper dialogue using OpenAI
// This module creates dynamic dialogue for shop interactions with personality and lore

const OpenAI = require('openai');
require('dotenv').config();

class AIShopDialogueGenerator {
    constructor() {
        // Initialize OpenAI client from .env
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        // Hellungi world details - a dimensional nexus
        this.worldContext = {
            location: "Hellungi - The Dimensional Crossroads",
            currentTime: this.getTimeOfDay(),
            currentWeather: this.getRandomWeather(),
            district: "Portal District Trading Quarter",
            
            // The One Pick lore (legendary artifact found in Hellungi's depths)
            theOnePickLore: {
                description: "A mythical pickaxe said to crack through dimensions themselves",
                powers: "Could supposedly mine through reality, opening portals or sealing rifts",
                location: "Lost between dimensions in Hellungi's deepest mining shafts",
                believers: ["desperate miners", "portal scholars", "dimension walkers", "void prophets"],
                skeptics: ["Portal Authority", "practical merchants", "scientists", "the wealthy"]
            },
            
            recentEvents: [
                "A new portal opened near the eastern market, bringing silicon-based lifeforms",
                "The Portal Authority raised transit taxes again",
                "Reality storms have been intensifying near the old mining district",
                "Interdimensional currency exchange rates are fluctuating wildly",
                "A traveler claims to have found a stable route to a paradise dimension",
                "The void between portals has been expanding mysteriously",
                "Refugees from a collapsing universe seek asylum in Hellungi",
                "Strange energy readings detected from Portal Seven",
                "A merchant from the Clockwork Realm offers impossible technologies"
            ]
        };
        
        // Shop keeper opinions on The One Pick (5% chance to mention)
        // Note: THE ONE PICK is the ultimate artifact that can mine through dimensions
        this.onePickOpinions = {
            believer: [
                "I'd stake my entire shop on The One Pick being real... it created these portals.",
                "The One Pick exists, mark my words. It mined the first rift to Hellungi.",
                "A traveler from the Mirror Realm swore they saw The Miner King wielding it."
            ],
            skeptic: [
                "The One Pick? Bah! Just tales to keep refugees hoping they can mine home.",
                "If The One Pick existed, the Portal Authority would have seized it by now.",
                "Dimensional fairy tales, that's all The One Pick ever was or will be."
            ],
            mysterious: [
                "The One Pick... it mines between existence, neither here nor there.",
                "Those who seek The One Pick often vanish between dimensions...",
                "The One Pick doesn't exist in one place... it exists in all places."
            ],
            reverent: [
                "The One Pick is sacred... it carved Hellungi from the void itself.",
                "If The Miner King's tool exists, it transcends dimensional understanding.",
                "The One Pick isn't just a tool... it's the key to all realities."
            ]
        };
    }

    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 6) return "void-touched hours";
        if (hour < 12) return "portal surge morning";
        if (hour < 17) return "dimensional noon";
        if (hour < 21) return "rift-fall evening";
        return "nexus midnight";
    }

    getRandomWeather() {
        const weather = [
            "shimmering with portal energies",
            "heavy with dimensional static",
            "unstable from reality fluctuations",
            "thick with void mist",
            "crackling with interdimensional storms",
            "eerily calm between portal surges",
            "vibrating with otherworldly frequencies",
            "rippling with spatial distortions"
        ];
        return weather[Math.floor(Math.random() * weather.length)];
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

            const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in Hellungi.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}
Context: Hellungi is a dimensional crossroads where beings from different worlds meet and trade.

A customer is trying to sell ${quantity} x ${item ? item.name : 'an item'} but they only have ${available}.
${available === 0 ? "They don't have any to sell!" : `They only have ${available}.`}

Generate a brief response (1 sentence) that:
- Points out they don't have the item (or enough of it)
- Reflects your personality
- Stays in character
- Is about them not having the item, NOT about money
- Might reference their home dimension or portal travel

Respond with ONLY the dialogue, no quotation marks.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 40,
                temperature: 0.8,
            });

            return response.choices[0].message.content.trim();
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

            // Decide what to mention in dialogue
            const mentionTheOnePick = Math.random() < 0.05;
            const mentionPrices = Math.random() < 0.3 && options.shopContext;
            const mentionRotationalItem = Math.random() < 0.25 && options.shopContext?.rotationalItems?.length > 0;
            
            const worldContext = this.getWorldContext(shop);
            const recentEvent = worldContext.recentEvents[
                Math.floor(Math.random() * worldContext.recentEvents.length)
            ];

            let prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in Hellungi.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}
Setting: Hellungi - ${worldContext.location}, during ${worldContext.currentTime}
Current conditions: ${worldContext.currentWeather}
Recent event: ${recentEvent}
World Context: Hellungi is a dimensional nexus where portals connect countless worlds. Beings from different realities meet and trade here.
${options.playerClass ? `Customer type: ${options.playerClass}` : 'Waiting for interdimensional customers'}
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

            // Mention The One Pick occasionally (relevant in Hellungi's mining districts)
            if (mentionTheOnePick) {
                const stance = this.getOnePickStance(shopkeeper);
                const opinion = this.onePickOpinions[stance][
                    Math.floor(Math.random() * this.onePickOpinions[stance].length)
                ];
                
                prompt += `\nIMPORTANT: You must naturally work in this opinion about The One Pick (${this.worldContext.theOnePickLore.description}): "${opinion}"
Make it feel organic to your personality and current conversation.`;
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
- Reflects your personality and background
- Might reference your wares, the weather, recent events, portals, dimensional travel, or other worlds
${dialogueInstructions.length > 0 ? '- Should ' + dialogueInstructions.join(' OR ') : ''}
- Sounds natural for someone standing in their interdimensional shop
${mentionTheOnePick ? '- Naturally incorporates your opinion about The One Pick' : ''}
- Stays completely in character
- Remember you're in Hellungi, a dimensional crossroads

You can EITHER:
1. Say something (just write the dialogue with quotes like "Another quiet day between portals.")
2. Perform an action (start with * for actions like *yawns* or *adjusts dimensional stabilizer*)
3. Make a sound/gesture (start with ~ for sounds like ~sighs or ~hums otherworldly tune)
4. Combine both if needed (like: *looks up from ledger* "Another worldwalker arrives.")

Respond with ONLY the dialogue or action, no quotation marks or attribution.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 80,
                temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.9,
            });

            return response.choices[0].message.content.trim();
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
            
            const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in Hellungi.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}
Context: This is Hellungi, a dimensional crossroads where beings from different worlds meet and trade.
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

Generate a brief success dialogue (1 sentence) that:
- Reflects your personality
- MUST react to the quantity (${quantity} items) - mention if it's a lot, bulk order, etc.
${buyer?.displayName ? `- You MAY address the customer by name ("${buyer.displayName}") when it feels natural` : ''}
${playerContext?.hasLegendary ? '- BE IN AWE of their legendary item(s) - show respect, fear, or greed based on personality' : ''}
${playerContext?.hasMidasBurden ? '- Reference their cursed/blessed Midas item if appropriate' : ''}
${playerContext?.hasMultipleLegendaries ? '- Express amazement at their legendary collection' : ''}
${playerContext?.isRichest ? '- Acknowledge their wealth status or VIP treatment' : ''}
${playerContext?.customerType === 'vip' ? '- Show appreciation for their loyalty' : ''}
${playerContext?.wealthTier === 'poor' && quantity > 1 ? '- Maybe comment on them spending beyond their means' : ''}
- Might reference their home dimension or portal travel
- Sounds natural and conversational - use their name sparingly, not every time
- Remember you're in Hellungi, where interdimensional trade is common

Respond with ONLY the dialogue with quotation marks`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 50,
                temperature: 0.85,
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('[AIShopDialogue] Error generating purchase dialogue:', error.message);
            return shop.successBuy?.[0] || "A pleasure doing business!";
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

            const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in Hellungi.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}

A customer cannot afford ${item ? item.name : 'an item'}${shortBy > 0 ? `, they're ${shortBy} coins short` : ''}.

Context: This is Hellungi, where interdimensional currency is accepted.

Generate a brief rejection dialogue (1 sentence) that:
- Reflects your personality (${shopkeeper.personality.includes('friendly') ? 'be sympathetic' : shopkeeper.personality.includes('ruthless') ? 'be harsh' : 'be firm but fair'})
- Tells them they need more money
- Stays in character
- Might reference interdimensional currency or their home world's money

Respond with ONLY the dialogue, with quotation marks.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 40,
                temperature: 0.8,
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('[AIShopDialogue] Error generating poor dialogue:', error.message);
            return shop.failureTooPoor?.[0] || "You need more coins!";
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
            
            const prompt = `You are ${shopkeeper.name}, proprietor of ${shop.name} in Hellungi.
            
Your establishment: ${shop.description || this.getShopSpecialty(shop)}
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}
Context: This is Hellungi, where goods from countless dimensions are traded.
${customerProfile}

A customer just sold you: ${quantity}x ${item.name} for ${price} coins total (${pricePerItem} each)
${seller?.displayName ? `Seller name: "${seller.displayName}"` : ''}
${seller?.username && seller?.username !== seller?.displayName ? `(username: ${seller.username})` : ''}
${playerContext ? `Customer current wealth: ${playerContext.money} coins` : ''}
${this.isGoodBuy(item, pricePerItem) ? 'This was a great deal for your shop!' : 'This was a fair price.'}
${isBulkSale ? 'This is a BULK SALE - they are offloading a lot of items!' : ''}
${isSingleItem ? 'Just a single item.' : ''}
${isModerateQuantity ? 'A moderate quantity.' : ''}

Generate a brief dialogue (1 sentence) for accepting this sale that:
- Reflects your personality
- MUST react to the quantity (${quantity} items) being sold
${seller?.displayName ? `- You MAY address the seller by name ("${seller.displayName}") when it feels natural` : ''}
${playerContext?.hasLegendary ? '- REACT to a legendary hero selling items - show awe, suspicion, or opportunism' : ''}
${playerContext?.hasMultipleLegendaries ? '- Express shock that someone with multiple legendaries needs to sell' : ''}
${playerContext?.hasMidasBurden && playerContext?.midasBlessing === 0 ? '- Maybe reference their cursed luck' : ''}
${playerContext?.isRichest ? '- Wonder why the richest player needs to sell items' : ''}
${playerContext?.wealthTier === 'poor' ? '- Might show sympathy or take advantage based on personality' : ''}
${playerContext?.customerType === 'vip' ? '- Acknowledge their loyalty even when buying from them' : ''}
- Might comment on which dimension these goods came from
- Use their name sparingly for natural conversation
- Remember you're in Hellungi, a dimensional trading hub

Respond with ONLY the dialogue, with quotation marks.`;

            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 40,
                temperature: 0.85,
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('[AIShopDialogue] Error generating sell dialogue:', error.message);
            return shop.successSell?.[0] || "I'll take that off your hands.";
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
