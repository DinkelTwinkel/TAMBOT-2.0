// innKeeping/innAIBarFightGenerator.js
// AI-powered dynamic bar fight generation system

const OpenAI = require('openai');

class AIBarFightGenerator {
    constructor() {
        // Initialize OpenAI if API key exists
        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
            this.aiEnabled = true;
        } else {
            this.aiEnabled = false;
            console.log('[AIBarFight] OpenAI API key not found, using fallback system');
        }
        
        // Maximum lengths for different content types
        this.MAX_REASON_LENGTH = 50;      // Fight reasons stay short
        this.MAX_OUTCOME_LENGTH = 200;    // Fight descriptions can be longer
        
        // Cache for recent AI-generated fights to avoid repetition
        this.recentFights = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
        
        // World context for the AI
        this.worldContext = {
            setting: "The Wandering Inn in HELLUNGI, a void dimension where beings from many worlds are trapped",
            atmosphere: "A pocket of normalcy in an endless, memory-consuming void",
            themes: [
                "Existential dread masked by routine",
                "Lost memories and fading identities",
                "Different species forced to coexist",
                "The search for The One Pick - a legendary artifact that might provide escape",
                "Alcohol as a coping mechanism for cosmic horror"
            ],
            commonTensions: [
                "Disputes over dwindling resources",
                "Conflicting memories of home worlds",
                "Philosophical differences about their situation",
                "Accusations of hoarding information about escape",
                "Cultural misunderstandings between species",
                "Arguments about The One Pick's existence",
                "Territorial disputes in ever-changing tunnels",
                "Disagreements about survival strategies"
            ]
        };
    }
    
    /**
     * Generate a contextual fight reason using AI
     */
    async generateAIFightReason(npc1, npc2, channelPower) {
        if (!this.aiEnabled) return null;
        
        // Check cache first
        const cacheKey = `${npc1.name}-${npc2.name}`;
        const cached = this.recentFights.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            console.log('[AIBarFight] Using cached fight reason');
            return cached.reason;
        }
        
        try {
            // Build character context
            const establishmentType = this.getEstablishmentType(channelPower);
            
            const prompt = `You are generating a bar fight scenario for an inn in HELLUNGI, a void dimension where beings from different worlds are trapped. The inn is a ${establishmentType} establishment.

SETTING: ${this.worldContext.setting}
ATMOSPHERE: ${this.worldContext.atmosphere}

CHARACTER 1 - ${npc1.name}:
${npc1.aiPersonality || npc1.description}
Wealth Level: ${npc1.wealth}/10
Personality traits: ${this.getPersonalityTraits(npc1)}

CHARACTER 2 - ${npc2.name}:
${npc2.aiPersonality || npc2.description}
Wealth Level: ${npc2.wealth}/10
Personality traits: ${this.getPersonalityTraits(npc2)}

TASK: Generate a VERY SHORT reason why these two characters would fight. 

RULES:
1. MAXIMUM 50 CHARACTERS (very important!)
2. Be specific and fitting to their personalities
3. Be darkly humorous about being trapped
4. No quotes, just the reason

Examples (all under 50 chars):
- "whose world had better gravity"
- "hiding portal coordinates"
- "who saw The One Pick last night"
- "hope vs despair philosophy"
- "stolen rations accusation"

Return ONLY the reason, UNDER 50 CHARACTERS.`;

            const completion = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a creative writer for a dark comedy game set in an interdimensional inn. Generate brief, specific conflict reasons that are both amusing and fitting for the existential horror setting."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.9,
                max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 40,
                presence_penalty: 0.6,
                frequency_penalty: 0.3
            });
            
            let reason = completion.choices[0].message.content.trim()
                .replace(/^["']|["']$/g, '') // Remove quotes if present
                .toLowerCase(); // Normalize to lowercase
            
            // Ensure reason is under 50 characters
            reason = this.truncateText(reason, this.MAX_REASON_LENGTH);
            
            // Cache the result
            this.recentFights.set(cacheKey, {
                reason: reason,
                timestamp: Date.now()
            });
            
            // Also cache the reverse pairing
            this.recentFights.set(`${npc2.name}-${npc1.name}`, {
                reason: reason,
                timestamp: Date.now()
            });
            
            console.log(`[AIBarFight] Generated reason: "${reason}"`);
            return reason;
            
        } catch (error) {
            console.error('[AIBarFight] AI generation failed:', error.message);
            return null;
        }
    }
    
    /**
     * Generate fight outcome description with AI
     */
    async generateAIFightOutcome(npc1, npc2, reason, mitigation, cost) {
        if (!this.aiEnabled) return null;
        
        try {
            let prompt = `Generate a brief, darkly humorous description of a bar fight outcome in an interdimensional inn.

FIGHTERS: ${npc1} vs ${npc2}
REASON: ${reason}
DAMAGE COST: ${cost} coins worth of property damage

`;

            if (mitigation && mitigation.mitigationType !== 'failed') {
                prompt += `INTERVENTION: ${mitigation.responder} tried to stop the fight with ${mitigation.mitigationType} success.
${mitigation.flavorText}

Include how ${mitigation.responder}'s intervention affected the outcome.
`;
            }

            prompt += `
Write a 2-3 sentence description that:
1. Describes what got broken/damaged.
2. References the inn and surrounding patrons.
3. Has Dark humor about their situation.
4. If someone intervened, shows how that changed things.

Keep it concise (under 200 chars) but complete the story.`;

            const completion = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are a narrator for a darkly comical inn where reality is broken. They are in the middle of a dark void. Describe bar fight outcomes with humor. But keep it concise"
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.8,
                max_tokens: 120  // Increased for complete descriptions
            });
            
            const outcome = completion.choices[0].message.content.trim();
            // Allow longer outcomes but still truncate if needed
            return this.truncateText(outcome, this.MAX_OUTCOME_LENGTH);
            
        } catch (error) {
            console.error('[AIBarFight] Failed to generate outcome:', error.message);
            return null;
        }
    }
    
    /**
     * Get establishment type based on power level
     */
    getEstablishmentType(power) {
        if (power >= 6) return "luxury establishment for wealthy interdimensional travelers";
        if (power >= 4) return "upscale tavern serving noble refugees from collapsed dimensions";
        if (power >= 2) return "modest inn for middle-class survivors";
        return "humble tavern for desperate souls";
    }
    
    /**
     * Extract personality traits from NPC data
     */
    getPersonalityTraits(npc) {
        const traits = [];
        
        // Wealth-based traits
        if (npc.wealth >= 7) traits.push("wealthy", "privileged");
        else if (npc.wealth >= 4) traits.push("comfortable", "middle-class");
        else traits.push("poor", "desperate");
        
        // Tip-based traits
        if (npc.tipModifier >= 2) traits.push("generous", "free-spending");
        else if (npc.tipModifier <= 0.5) traits.push("stingy", "miserly");
        
        // Frequency-based traits
        if (npc.frequency === "very_common") traits.push("regular patron", "always here");
        else if (npc.frequency === "rare") traits.push("mysterious", "seldom seen");
        
        // Budget-based traits
        if (npc.budget === "high") traits.push("big spender");
        else if (npc.budget === "low") traits.push("counting coins");
        
        return traits.join(", ");
    }
    
    /**
     * Clean up old cache entries
     */
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.recentFights.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.recentFights.delete(key);
            }
        }
    }
    
    /**
     * Truncate text to maximum length intelligently
     */
    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        
        // For longer text, try to end at a complete sentence
        const truncated = text.substring(0, maxLength - 3);
        const lastPeriod = truncated.lastIndexOf('.');
        const lastExclaim = truncated.lastIndexOf('!');
        const lastQuestion = truncated.lastIndexOf('?');
        const lastComplete = Math.max(lastPeriod, lastExclaim, lastQuestion);
        
        if (lastComplete > maxLength * 0.6) {
            // If we have a complete sentence that's at least 60% of max length, use it
            return text.substring(0, lastComplete + 1);
        }
        // Otherwise truncate with ellipsis
        return truncated + '...';
    }
    
    /**
     * Get fallback reasons based on NPC combinations
     */
    getFallbackReason(npc1, npc2) {
        const fallbackReasons = [
            "whose world was better",  // 22 chars
            "the last bottle of ale",  // 23 chars
            "hiding The One Pick",     // 20 chars
            "stealing rations",        // 16 chars
            "hope vs despair",         // 15 chars
            "who's been here longest", // 23 chars
            "conflicting escape plans",// 24 chars
            "are we dead or alive",    // 20 chars
            "whose memories are real", // 23 chars
            "the warmest spot",        // 16 chars
            "portal navigation",       // 17 chars
            "hoarding supplies",       // 17 chars
            "gambling debts",          // 14 chars
            "seeing the outside",      // 18 chars
            "does time still exist"   // 21 chars
        ];
        
        // Use NPC names as seed for consistent randomness
        const seed = (npc1.name.length * npc2.name.length) % fallbackReasons.length;
        return this.truncateText(fallbackReasons[seed], this.MAX_REASON_LENGTH);
    }
    
    /**
     * Get fallback fight outcomes when AI is unavailable
     */
    getFallbackOutcome(hasIntervention = false) {
        const outcomes = [
            "Tables shattered into void particles. The innkeeper sighs at the cleanup.",
            "Chairs flew through rifts. They'll return tomorrow, maybe different colors.",
            "The mirror cracked, showing home worlds. Everyone paused, remembering.",
            "Bottles exploded in rainbow mist. The void-touched alcohol sparkled oddly.",
            "Windows broke, revealing endless nothing. They quickly boarded them up.",
            "The floor cracked, exposing void beneath. Everyone stepped back nervously."
        ];
        
        const interventionOutcomes = [
            "The fight ended when void whispers spoke true names. Both froze in dread.",
            "A rift opened between them. They decided survival mattered more than pride.",
            "The innkeeper's anchor activated. Both fighters reconsidered mid-punch.",
            "Someone mentioned The One Pick. Everyone stopped to debate its existence.",
            "The creature rumbled below. The fight seemed pointless after that."
        ];
        
        if (hasIntervention) {
            return interventionOutcomes[Math.floor(Math.random() * interventionOutcomes.length)];
        }
        return outcomes[Math.floor(Math.random() * outcomes.length)];
    }
}

module.exports = AIBarFightGenerator;