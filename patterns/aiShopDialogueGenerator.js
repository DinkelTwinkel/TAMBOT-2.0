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
    async generatePurchaseDialogue(shop, item, price, buyer = {}, quantity = 1) {
        try {
            const shopkeeper = shop.shopkeeper;
            if (!shopkeeper) {
                throw new Error('Shop missing shopkeeper data');
            }

            const pricePerItem = Math.floor(price / quantity);
            const isBulkPurchase = quantity > 5;
            const isSmallPurchase = quantity === 1;
            const isModerateQuantity = quantity > 1 && quantity <= 5;
            
            const prompt = `You are ${shopkeeper.name}, shopkeeper of ${shop.name}.
            
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}

A customer just purchased: ${quantity}x ${item.name} for ${price} coins total (${pricePerItem} each)
${buyer.username ? `Customer name: ${buyer.username}` : ''}
${this.isPriceGood(item, pricePerItem) ? 'This was a good deal for you!' : 'This was at a discount.'}
${isBulkPurchase ? 'This is a BULK PURCHASE - react accordingly!' : ''}
${isSmallPurchase ? 'Just a single item.' : ''}
${isModerateQuantity ? 'A moderate quantity purchase.' : ''}

Generate a brief success dialogue (1 sentence) that:
- Reflects your personality
- MUST react to the quantity (${quantity} items) - mention if it's a lot, bulk order, etc.
- Might comment on the bulk deal or total price
- Sounds natural and conversational
- Shows appropriate reaction to the purchase size

Examples of reacting to quantity:
- Bulk: "That's quite the haul!" or "Buying in bulk, smart move!" or "${quantity} of them? You're cleaning me out!"
- Single: "Just the one?" or "A fine choice!"
- Moderate: "${quantity} should last you a while!" or "Good stock for your adventures!"

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
    async generateSellDialogue(shop, item, price, quantity = 1) {
        try {
            const shopkeeper = shop.shopkeeper;
            if (!shopkeeper) {
                throw new Error('Shop missing shopkeeper data');
            }

            const pricePerItem = Math.floor(price / quantity);
            const isBulkSale = quantity > 5;
            const isSingleItem = quantity === 1;
            const isModerateQuantity = quantity > 1 && quantity <= 5;
            
            const prompt = `You are ${shopkeeper.name}, shopkeeper of ${shop.name}.
            
Background: ${shopkeeper.bio}
Personality: ${shopkeeper.personality}

A customer just sold you: ${quantity}x ${item.name} for ${price} coins total (${pricePerItem} each)
${this.isGoodBuy(item, pricePerItem) ? 'This was a great deal for your shop!' : 'This was a fair price.'}
${isBulkSale ? 'This is a BULK SALE - they are offloading a lot of items!' : ''}
${isSingleItem ? 'Just a single item.' : ''}
${isModerateQuantity ? 'A moderate quantity.' : ''}

Generate a brief dialogue (1 sentence) for accepting this sale that:
- Reflects your personality
- MUST react to the quantity (${quantity} items) being sold
- Might comment on why they're selling so many/few
- Shows your business sense and reaction to bulk sales

Examples of reacting to quantity:
- Bulk sale: "${quantity} of them? Business must be good!" or "I'll take all ${quantity} off your hands!" or "That's a lot of ${item.name}, you clearing out?"
- Single: "Just the one? I'll take it." or "I can work with that."
- Moderate: "${quantity} pieces, reasonable amount." or "I can move ${quantity} of these."

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