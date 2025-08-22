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
        
        // Mining world details
        this.worldContext = {
            location: "The Great Mining Complex",
            currentTime: this.getTimeOfDay(),
            currentWeather: this.getRandomWeather(),
            miningDistrict: "Lower Depths Trading Quarter",
            
            // The One Pick lore
            theOnePickLore: {
                description: "A mythical pickaxe said to be wielded by the legendary Miner King",
                powers: "Could supposedly crack through any material, even reality itself",
                location: "Lost to time, hidden in depths no living soul has reached",
                believers: ["desperate miners", "drunk storytellers", "ancient texts", "crystal seers"],
                skeptics: ["practical merchants", "veteran miners", "scholars", "the wealthy"]
            },
            
            recentEvents: [
                "A new vein of silver was discovered in shaft 7",
                "The mining guild announced new safety regulations",
                "Strange tremors have been felt in the lower levels",
                "Gem prices are fluctuating wildly this season",
                "A miner claims to have seen ancient markings in a forgotten tunnel"
            ]
        };
        
        // Shop keeper opinions on The One Pick (5% chance to mention)
// Note: THE ONE PICK is the ultimate mythic item that may not even exist
        this.onePickOpinions = {
            believer: [
                "I'd stake my entire shop on The One Pick being real... seen too much to doubt.",
                "The One Pick exists, mark my words. The stones themselves whisper of it.",
                "My grandfather's grandfather swore he glimpsed The Miner King... I believe him."
            ],
            skeptic: [
                "The One Pick? Bah! Just tales to keep apprentices dreaming instead of working.",
                "If The One Pick existed, someone would've found it by now. It's just marketing.",
                "Fairy tales and fool's gold, that's all The One Pick ever was or will be."
            ],
            mysterious: [
                "The One Pick... some truths are better left buried in the deep.",
                "Those who seek The One Pick rarely return to tell what they found...",
                "The One Pick chooses its wielder, not the other way around."
            ],
            reverent: [
                "The One Pick is sacred... to speak of it casually invites misfortune.",
                "If The Miner King's tool exists, it's beyond our mortal understanding.",
                "The One Pick isn't just a tool... it's a key to something greater."
            ]
        };
    }

    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 6) return "deep night shift";
        if (hour < 12) return "morning shift";
        if (hour < 17) return "afternoon shift";
        if (hour < 21) return "evening shift";
        return "night shift";
    }

    getRandomWeather() {
        const weather = [
            "dusty from recent drilling",
            "damp from underground springs",
            "unusually warm from volcanic activity",
            "cold and echoing",
            "thick with mineral fog",
            "charged with static from crystal formations"
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

            const prompt = `You are ${shopkeeper.name}, shopkeeper of ${shop.name}.
            
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}

A customer is trying to sell ${quantity} x ${item ? item.name : 'an item'} but they only have ${available}.
${available === 0 ? "They don't have any to sell!" : `They only have ${available}.`}

Generate a brief response (1 sentence) that:
- Points out they don't have the item (or enough of it)
- Reflects your personality
- Stays in character
- Is about them not having the item, NOT about money

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
            
            const recentEvent = this.worldContext.recentEvents[
                Math.floor(Math.random() * this.worldContext.recentEvents.length)
            ];

            let prompt = `You are ${shopkeeper.name}, shopkeeper of ${shop.name}.
            
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}
Setting: ${this.worldContext.location}, during ${this.worldContext.currentTime}
Current conditions: ${this.worldContext.currentWeather}
Recent event: ${recentEvent}

Shop specialty: ${this.getShopSpecialty(shop)}
${options.playerClass ? `Customer type: ${options.playerClass}` : 'Waiting for customers'}
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
- Might reference your wares, the weather, recent events, or mining life
${dialogueInstructions.length > 0 ? '- Should ' + dialogueInstructions.join(' OR ') : ''}
- Sounds natural for someone standing in their shop
${mentionTheOnePick ? '- Naturally incorporates your opinion about The One Pick' : ''}
- Stays completely in character

You can EITHER:
1. Say something (just write the dialogue with quotes like "Another slow day in the mines.")
2. Perform an action (start with * for actions like *yawns* or *scratches beard*)
3. Make a sound/gesture (start with ~ for sounds like ~sighs or ~hums)
4. Combine both if needed (like: *looks up from ledger* "Another slow day in the mines.")

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
            return "Welcome to my shop!";
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
                    customerProfile += '\n💪 Very powerful miner with exceptional stats.';
                } else if (playerContext.hasHighStats) {
                    customerProfile += '\n💪 Experienced miner with good equipment.';
                }
                
                if (playerContext.stats.luck > 50 && !playerContext.hasMidasBurden) {
                    customerProfile += '\n🍀 Extremely lucky individual!';
                }
                if (playerContext.stats.mining > 50) {
                    customerProfile += '\n⛏️ Master miner!';
                }
            }
            
            const prompt = `You are ${shopkeeper.name}, shopkeeper of ${shop.name}.
            
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}
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
- Might comment on the bulk deal, their legendary status, or total price
- Sounds natural and conversational - use their name sparingly, not every time
- Shows appropriate reaction to legendary owners (awe, respect, jealousy, or suspicion based on your personality)

Examples of reacting to quantity:
- Bulk: "That's quite the haul!" or "Buying in bulk, smart move!" or "${quantity} of them? You're cleaning me out!"
- Single: "Just the one?" or "A fine choice!"
- Moderate: "${quantity} should last you a while!" or "Good stock for your adventures!"

Examples of using customer names naturally:
- VIP: "Welcome back, DragonSlayer! Your usual bulk order?"
- Legendary: "Lord Thunder, with Earthshaker in hand, buying more supplies?"
- Wealthy: "Ah, GoldKing returns! My finest wares await!"
- Poor: "Careful with your coins, young Miner..."
- First time: "Haven't seen you before... what brings you to my shop?"

Examples of reacting to legendary status:
- Awe: "By the stones! Is that really Blue Breeze? An honor to serve you, WindMaster!"
- Respect: "Lord Titan, wielder of Earthshaker, my shop is honored!"
- Greed: "With Greed's Embrace on your chest, GoldHeart, surely you can afford everything!"
- Suspicion: "How did you acquire the Whisper of the Void, stranger? That was lost centuries ago!"
- Fear: "Y-yes, Your Majesty! The Crown speaks, I obey!"
- Midas: "So YOU'RE the one, RichKing! Midas chose you as the wealthiest!"
- Multiple: "THREE legendaries, MythKeeper? You're more museum than miner!"

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

            const prompt = `You are ${shopkeeper.name}, shopkeeper of ${shop.name}.
            
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}

A customer cannot afford ${item ? item.name : 'an item'}${shortBy > 0 ? `, they're ${shortBy} coins short` : ''}.

Generate a brief rejection dialogue (1 sentence) that:
- Reflects your personality (${shopkeeper.personality.includes('friendly') ? 'be sympathetic' : shopkeeper.personality.includes('ruthless') ? 'be harsh' : 'be firm but fair'})
- Tells them they need more money
- Stays in character

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
                    customerProfile += '\n⛏️ Master miner - probably has quality goods.';
                }
                if (playerContext.customerType === 'vip') {
                    customerProfile += '\n⭐ Your best customer is selling back to you.';
                }
            }
            
            const prompt = `You are ${shopkeeper.name}, shopkeeper of ${shop.name}.
            
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}
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
- Might comment on why a legendary hero is selling, their financial situation, or the irony
- Use their name sparingly for natural conversation
- Shows your business sense and reaction to legendary owners selling items

Examples of reacting to quantity:
- Bulk sale: "${quantity} of them? Business must be good!" or "I'll take all ${quantity} off your hands!"
- Single: "Just the one? I'll take it." or "I can work with that."

Examples of using seller names naturally:
- Legendary: "ShadowLord, why would you need to sell with all those legendaries?"
- Poor: "Times tough, MinerBob? I'll give you a fair price."
- VIP: "Even my best customer needs coin sometimes, eh GemQueen?"
- Suspicious: "Interesting goods you're selling, DarkMiner..."

Examples of reacting to legendary owners selling:
- Suspicious: "Why would the bearer of Blue Breeze need my coins, StormCaller?"
- Opportunistic: "Ore mined by Earthshaker? I'll sell it for triple, thank you IronFist!"
- Sympathetic: "Even with Phoenix Feather, times are tough FireBird? Fair price, friend."
- Awestruck: "The legendary ShadowWalker is selling to ME?"
- Mocking: "The mighty CrownBearer reduced to peddling scraps?"
- Midas Cursed: "Ah GoldenOne, Midas' curse strikes again! Bad luck today?"
- Multiple legendaries: "LegendKeeper, with all those legendaries, why sell common ore?"

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
     * Get shop specialty based on items
     */
    getShopSpecialty(shop) {
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
        if (shop.name.includes('Inn')) return "food, drink, and warm beds";
        return "various mining goods";
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