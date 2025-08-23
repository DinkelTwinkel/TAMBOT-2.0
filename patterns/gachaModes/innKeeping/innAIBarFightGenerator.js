// innKeeping/innAIBarFightGenerator.js
// AI-powered dynamic bar fight generation system with inn-specific context

const OpenAI = require('openai');
const gachaServers = require('../../../data/gachaServers.json');
const shops = require('../../../data/shops.json');

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
    }
    
    /**
     * Get inn context from typeId
     */
    getInnContext(typeId) {
        // Find the server data
        const serverData = gachaServers.find(s => String(s.id) === String(typeId));
        if (!serverData) {
            console.log(`[AIBarFight] No server data found for typeId: ${typeId}`);
            return this.getDefaultContext();
        }
        
        // Find the shop data
        const shopData = shops.find(s => s.id === serverData.shop);
        if (!shopData) {
            console.log(`[AIBarFight] No shop data found for shopId: ${serverData.shop}`);
            return this.getDefaultContext();
        }
        
        // Build specific context based on the inn
        const context = {
            innName: serverData.name,
            innDescription: serverData.description,
            innPower: serverData.power,
            shopName: shopData.name,
            innkeeper: shopData.shopkeeper,
            idleDialogue: shopData.idleDialogue,
            atmosphere: this.determineAtmosphere(serverData, shopData),
            establishmentType: this.getEstablishmentType(serverData.power),
            specificTensions: this.getSpecificTensions(serverData.id)
        };
        
        console.log(`[AIBarFight] Using context for: ${context.innName}`);
        return context;
    }
    
    /**
     * Get default context for fallback
     */
    getDefaultContext() {
        return {
            innName: "The Wandering Inn",
            innDescription: "A mysterious tavern existing between dimensions",
            innPower: 1,
            shopName: "The Wandering Inn",
            innkeeper: {
                name: "The Innkeeper",
                bio: "A mysterious figure who maintains order",
                personality: "Enigmatic and watchful"
            },
            atmosphere: "A pocket of normalcy in an endless void",
            establishmentType: "mysterious tavern",
            specificTensions: [
                "disputes over resources",
                "conflicting memories",
                "philosophical differences"
            ]
        };
    }
    
    /**
     * Determine atmosphere based on inn type
     */
    determineAtmosphere(serverData, shopData) {
        const innId = parseInt(serverData.id);
        
        switch(innId) {
            case 13: // Miner's Inn
                return "A rowdy underground tavern thick with coal dust and the smell of hearty stew. Pickaxes hang on the walls, and miners swap stories of dangerous depths and lost companions.";
            
            case 14: // Hunter's Lodge
                return "A rustic lodge adorned with mounted trophies and pelts. The scent of roasting venison fills the air while rangers trade tracking tips by the crackling fireplace.";
            
            case 15: // Noble's Rest
                return "An opulent establishment with crystal chandeliers and silk-draped rooms. The wealthy dine on exotic delicacies while discrete staff attend to every whim.";
            
            default:
                return serverData.description || "A mysterious establishment between worlds";
        }
    }
    
    /**
     * Get inn-specific tensions
     */
    getSpecificTensions(innId) {
        const id = parseInt(innId);
        
        switch(id) {
            case 13: // Miner's Inn
                return [
                    "disputed mining claims",
                    "who found the richest vein",
                    "stolen mining equipment",
                    "cave-in blame assignment",
                    "The One Pick rumors",
                    "who's the better digger",
                    "hoarding ore samples",
                    "breaking mining superstitions",
                    "shift assignment disputes",
                    "safety regulation arguments"
                ];
            
            case 14: // Hunter's Lodge
                return [
                    "disputed hunting grounds",
                    "who bagged the bigger trophy",
                    "stolen tracking techniques",
                    "poaching accusations",
                    "best hunting stories",
                    "ranger territory disputes",
                    "animal cruelty debates",
                    "wilderness survival methods",
                    "trap placement conflicts",
                    "guide fee disagreements"
                ];
            
            case 15: // Noble's Rest
                return [
                    "family honor insults",
                    "political allegiances",
                    "inheritance disputes",
                    "social status comparisons",
                    "business deal betrayals",
                    "romantic rivalries",
                    "fashion critiques",
                    "ancestral claims",
                    "etiquette violations",
                    "diplomatic incidents"
                ];
            
            default:
                return [
                    "general disagreements",
                    "resource disputes",
                    "philosophical differences",
                    "territorial conflicts",
                    "old grudges"
                ];
        }
    }
    
    /**
     * Generate a contextual fight reason using AI with inn context
     */
    async generateAIFightReason(npc1, npc2, channelPower, typeId) {
        if (!this.aiEnabled) return null;
        
        // Get inn-specific context
        const innContext = this.getInnContext(typeId);
        
        // Check cache first
        const cacheKey = `${npc1.name}-${npc2.name}-${typeId}`;
        const cached = this.recentFights.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            console.log('[AIBarFight] Using cached fight reason');
            return cached.reason;
        }
        
        try {
            // Select a random tension appropriate to this inn
            const randomTension = innContext.specificTensions[
                Math.floor(Math.random() * innContext.specificTensions.length)
            ];
            
            const prompt = `You are generating a bar fight scenario for ${innContext.innName}.

SETTING: ${innContext.atmosphere}
INNKEEPER: ${innContext.innkeeper.name} - ${innContext.innkeeper.personality}
ESTABLISHMENT TYPE: ${innContext.establishmentType}

CHARACTER 1 - ${npc1.name}:
${npc1.aiPersonality || npc1.description}
Wealth Level: ${npc1.wealth}/10

CHARACTER 2 - ${npc2.name}:
${npc2.aiPersonality || npc2.description}
Wealth Level: ${npc2.wealth}/10

COMMON TENSIONS HERE: ${randomTension}

TASK: Generate a VERY SHORT reason why these two would fight in this specific establishment.

RULES:
1. MAXIMUM 50 CHARACTERS (very important!)
2. Make it specific to ${innContext.innName}'s atmosphere
3. Consider the establishment's theme
4. Be darkly humorous if appropriate
5. No quotes, just the reason

Examples for this location:
${this.getLocationExamples(typeId)}

Return ONLY the reason, UNDER 50 CHARACTERS.`;

            const completion = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: `You are a creative writer for ${innContext.innName}. Generate brief, specific conflict reasons that fit the establishment's unique atmosphere and clientele.`
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
            this.recentFights.set(`${npc2.name}-${npc1.name}-${typeId}`, {
                reason: reason,
                timestamp: Date.now()
            });
            
            console.log(`[AIBarFight] Generated reason for ${innContext.innName}: "${reason}"`);
            return reason;
            
        } catch (error) {
            console.error('[AIBarFight] AI generation failed:', error.message);
            return this.getInnSpecificFallback(typeId, npc1, npc2);
        }
    }
    
    /**
     * Get location-specific examples
     */
    getLocationExamples(typeId) {
        const id = parseInt(typeId);
        
        switch(id) {
            case 13: // Miner's Inn
                return `- "who struck gold first"
- "stolen pickaxe accusation"
- "cave-in cowardice claims"
- "ore sample theft"
- "shift jumping allegations"`;
            
            case 14: // Hunter's Lodge
                return `- "poaching on my territory"
- "that trophy is fake"
- "stole my tracking method"
- "scared away the prey"
- "guide fee dispute"`;
            
            case 15: // Noble's Rest
                return `- "insulted family crest"
- "inferior bloodline comment"
- "business betrayal revealed"
- "improper table manners"
- "stolen romantic interest"`;
            
            default:
                return `- "general disagreement"
- "resource dispute"
- "old grudge resurfacing"
- "territorial conflict"
- "philosophical difference"`;
        }
    }
    
    /**
     * Generate fight outcome description with AI and inn context
     */
    async generateAIFightOutcome(npc1, npc2, reason, mitigation, cost, typeId) {
        if (!this.aiEnabled) return this.getInnSpecificFallbackOutcome(typeId, mitigation);
        
        const innContext = this.getInnContext(typeId);
        
        try {
            let prompt = `Generate a brief description of a bar fight outcome in ${innContext.innName}.

SETTING: ${innContext.atmosphere}
INNKEEPER: ${innContext.innkeeper.name} watches ${innContext.innkeeper.personality}
FIGHTERS: ${npc1} vs ${npc2}
REASON: ${reason}
DAMAGE COST: ${cost} coins worth of property damage

`;

            if (mitigation && mitigation.mitigationType !== 'failed') {
                prompt += `INTERVENTION: ${mitigation.responder} tried to stop the fight with ${mitigation.mitigationType} success.
${mitigation.flavorText}

Include how ${mitigation.responder}'s intervention affected the outcome and how ${innContext.innkeeper.name} reacted.
`;
            } else {
                prompt += `Include ${innContext.innkeeper.name}'s reaction to the damage.
`;
            }

            prompt += `
Write a 2-3 sentence description that:
1. Describes damage specific to ${innContext.innName} (mining equipment, trophies, fine china, etc.)
2. Shows the innkeeper's reaction fitting their personality
3. Captures the establishment's unique atmosphere
4. If someone intervened, shows how that changed things

Keep it concise (under 200 chars) but atmospheric.`;

            const completion = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: `You are a narrator for ${innContext.innName}. Describe bar fight outcomes that fit the establishment's unique character and the innkeeper's personality.`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.8,
                max_tokens: 120
            });
            
            const outcome = completion.choices[0].message.content.trim();
            return this.truncateText(outcome, this.MAX_OUTCOME_LENGTH);
            
        } catch (error) {
            console.error('[AIBarFight] Failed to generate outcome:', error.message);
            return this.getInnSpecificFallbackOutcome(typeId, mitigation);
        }
    }
    
    /**
     * Get establishment type based on power level
     */
    getEstablishmentType(power) {
        if (power >= 6) return "legendary establishment of mythical renown";
        if (power >= 4) return "upscale tavern for distinguished clientele";
        if (power >= 2) return "respectable inn for honest folk";
        return "humble tavern for working class patrons";
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
     * Get inn-specific fallback reasons
     */
    getInnSpecificFallback(typeId, npc1, npc2) {
        const id = parseInt(typeId);
        let fallbackReasons;
        
        switch(id) {
            case 13: // Miner's Inn
                fallbackReasons = [
                    "claim jumping accusations",
                    "who found the vein first",
                    "stolen pickaxe claims",
                    "cave-in cowardice",
                    "shift schedule dispute",
                    "ore quality argument",
                    "safety violation blame",
                    "tool theft suspicion"
                ];
                break;
                
            case 14: // Hunter's Lodge
                fallbackReasons = [
                    "hunting ground dispute",
                    "fake trophy accusation",
                    "poaching allegations",
                    "scared the game away",
                    "tracking secret theft",
                    "guide payment conflict",
                    "trap tampering claims",
                    "best hunter debate"
                ];
                break;
                
            case 15: // Noble's Rest
                fallbackReasons = [
                    "family honor insult",
                    "bloodline superiority",
                    "etiquette violation",
                    "business betrayal",
                    "romantic rivalry",
                    "political allegiance",
                    "fashion criticism",
                    "social rank dispute"
                ];
                break;
                
            default:
                fallbackReasons = [
                    "whose world was better",
                    "the last bottle of ale",
                    "hiding escape plans",
                    "stealing rations",
                    "hope vs despair",
                    "who's been here longest",
                    "conflicting memories",
                    "survival philosophy"
                ];
        }
        
        // Use NPC names as seed for consistent randomness
        const seed = (npc1.name.length * npc2.name.length) % fallbackReasons.length;
        return this.truncateText(fallbackReasons[seed], this.MAX_REASON_LENGTH);
    }
    
    /**
     * Get inn-specific fallback outcomes
     */
    getInnSpecificFallbackOutcome(typeId, mitigation) {
        const id = parseInt(typeId);
        const hasIntervention = mitigation && mitigation.mitigationType !== 'failed';
        let outcomes;
        
        switch(id) {
            case 13: // Miner's Inn
                outcomes = hasIntervention ? [
                    "Big Martha cracked skulls with her ladle. 'Not in my inn!' she bellowed.",
                    "Mining helmets flew. Martha's bear hug ended it. Both gasped for air.",
                    "Pickaxes clattered down. The intervention worked. Martha charged for damages.",
                    "Ore samples scattered. Quick thinking prevented worse. Martha wasn't amused."
                ] : [
                    "Mining equipment crashed down. Big Martha's stew pot overturned. She was NOT happy.",
                    "Pickaxes embedded in walls. Coal dust everywhere. Martha presented the bill.",
                    "The miners' table collapsed into the cellar. Martha's cursing echoed through tunnels.",
                    "Lanterns shattered, darkness fell. Martha lit emergency torches, tallying damages."
                ];
                break;
                
            case 14: // Hunter's Lodge
                outcomes = hasIntervention ? [
                    "Selis drew her crossbow. The fight ended instantly. 'Outside. Now.'",
                    "Quick reflexes saved the trophy wall. Selis nodded approval, once.",
                    "The intervention worked. Selis's [Hunter's Eye] had already calculated damages.",
                    "Mounted heads stayed intact. Selis's one-armed grip separated them efficiently."
                ] : [
                    "Trophy heads crashed down. Selis's remaining hand reached for her crossbow.",
                    "The elk mount impaled the wall. Selis's silence was deadlier than shouting.",
                    "Pelts torn, tables overturned. Selis mentally added each coin to their tabs.",
                    "The fireplace screen toppled. Selis calmly extinguished embers, planning revenge."
                ];
                break;
                
            case 15: // Noble's Rest
                outcomes = hasIntervention ? [
                    "Lord Percival's [Noble's Presence] froze them mid-swing. 'Gentlemen, please.'",
                    "Crystal intact, dignity saved. Percival's skill prevented scandal. Barely.",
                    "The intervention preserved decorum. Percival added a 'discretion fee.'",
                    "Fine china survived. Percival's diplomatic smile never wavered. The bill doubled."
                ] : [
                    "Crystal chandelier crashed spectacularly. Lord Percival's smile tightened dangerously.",
                    "Silk curtains torn, wine spilled on imported rugs. Percival calculated interest.",
                    "The antique mirror shattered. Seven years bad luck, plus Percival's invoice.",
                    "Gold-leaf decorations crumbled. Percival's [Noble's Grace] couldn't hide his fury."
                ];
                break;
                
            default:
                outcomes = hasIntervention ? [
                    "The fight ended when someone shouted a warning. Damage was minimal.",
                    "Quick intervention saved most furniture. The innkeeper sighed with relief.",
                    "They were separated before real damage. Lucky timing for everyone's wallets.",
                    "The peacemaker's efforts worked. Only minor repairs needed this time."
                ] : [
                    "Tables splintered, chairs flew. The innkeeper started a running tally.",
                    "Windows shattered, bottles exploded. Cleaning this would take hours.",
                    "The bar mirror cracked down the middle. Seven years of bar tabs.",
                    "Everything that could break, did. The innkeeper considered retirement."
                ];
        }
        
        const index = Math.floor(Math.random() * outcomes.length);
        return outcomes[index];
    }
}

module.exports = AIBarFightGenerator;