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

TASK: Generate a single, specific reason why these two characters would start fighting in the inn. The reason should:
1. Be based on their personalities and backgrounds
2. Feel natural given the setting (trapped in a void dimension)
3. Be concise (10-20 words)
4. Be somewhat absurd or darkly humorous given the existential situation
5. Reference specific details from their descriptions when possible

Examples of good reasons:
- "whose home dimension had better gravity"
- "accusations of hiding portal coordinates"
- "a misunderstanding about the proper way to forget"
- "who saw The One Pick in a dream last night"
- "whether hope or despair is more rational"

Return ONLY the fight reason, no additional text or explanation.`;

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
            
            const reason = completion.choices[0].message.content.trim()
                .replace(/^["']|["']$/g, '') // Remove quotes if present
                .toLowerCase(); // Normalize to lowercase
            
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
1. Describes what got broken/damaged
2. References the void or dimensional nature of the setting
3. Has dark humor about their trapped situation
4. If someone intervened, shows how that changed things

Keep it concise and atmospheric.`;

            const completion = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a narrator for a darkly comic interdimensional inn where reality is broken. Describe bar fight outcomes with existential humor."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.8,
                max_tokens: 80
            });
            
            return completion.choices[0].message.content.trim();
            
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
     * Get fallback reasons based on NPC combinations
     */
    getFallbackReason(npc1, npc2) {
        const fallbackReasons = [
            "arguing about whose world was better before the void",
            "disagreement over the last bottle of real alcohol",
            "conflicting theories about The One Pick's location",
            "accusations of stealing rations",
            "philosophical differences about accepting their fate",
            "dispute over who's been here longest",
            "conflicting escape plans",
            "disagreement about whether they're dead or alive",
            "arguing about whose memories are real",
            "fighting over the warmest spot in the inn",
            "disagreement about portal navigation techniques",
            "accusations of hoarding void-resistant supplies",
            "dispute over gambling debts that may not exist",
            "conflicting claims about seeing the outside",
            "argument about whether time still has meaning"
        ];
        
        // Use NPC names as seed for consistent randomness
        const seed = (npc1.name.length * npc2.name.length) % fallbackReasons.length;
        return fallbackReasons[seed];
    }
}

module.exports = AIBarFightGenerator;