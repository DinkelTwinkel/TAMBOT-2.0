// Innkeeper Mode - High-Activity Inn Simulation
// 
// EVENT TIMING:
// - GUARANTEED event every 20 seconds maximum
// - NPC Sales: Priority event (70%+ chance)
// - Random Events: 60% chance when triggered
//   - Bar Fights: 20% of events (costs coins)
//   - Coin Finds: 60% of events (awards coins)
//   - Rumors: 20% of events (atmosphere only)
// - Innkeeper Commentary: Fallback when no other events
// - Profit Distribution: Every 25 minutes
// - Break Period: 5 minutes after each work period
// 
const Money = require('../../models/currency'); // Adjust path as needed
const PlayerInventory = require('../../models/inventory'); // your inventory schema
const generateShop = require('../generateShop');
const { EmbedBuilder } = require('discord.js');
const InnKeeperSales = require('./innKeeping/innKeeperSales');
const InnEventLog = require('./innKeeping/innEventLog');
const getPlayerStats = require('../calculatePlayerStat');
const gachaServers = require('../../data/gachaServers.json');
const itemSheet = require('../../data/itemSheet.json');
const shops = require('../../data/shops.json');
const shopData = require('../../data/shops.json'); // Alias for compatibility
const npcs = require('../../data/npcs.json');
const ActiveVCs = require('../../models/activevcs');
const UniqueItem = require('../../models/uniqueItems');
const { UNIQUE_ITEMS } = require('../../data/uniqueItemsSheet');

// Rumor and event templates for fallback when AI isn't available
const RUMORS = [
    "a new portal opened near the eastern ridge, spewing strange creatures",
    "travelers from a world of eternal ice arrived yesterday",
    "the portal storms are getting worse this season",
    "someone found ancient ruins between the portal nexuses",
    "interdimensional merchants are selling impossible artifacts",
    "a warrior from a clockwork world seeks companions",
    "the reality tears near the old mine are expanding",
    "refugees from a dying world arrived through the northern portal",
    "strange energies are destabilizing the portal network",
    "a new faction of worldwalkers has formed in the wastes",
    "the Portal Authority is demanding higher taxes",
    "creatures of living shadow emerged from portal seven",
    "a technomancer from the steel realm is offering services",
    "the dimensional barriers are weakening",
    "prophets speak of a great convergence approaching",
    "The One Pick was glimpsed between dimensions last night",
    "miners claim The One Pick created the first portal to Hellungi",
    "The Miner King walks between worlds, still wielding The One Pick"
];

// Innkeeper commentary for slow periods
const INNKEEPER_COMMENTS = {
    slow: [
        "sighs and wipes down the bar for the third time",
        "reorganizes the bottles behind the bar",
        "checks the clock and mutters about slow days",
        "starts polishing glasses that are already clean",
        "flips through the ledger, counting yesterday's profits",
        "stares out the window, hoping for customers",
        "tastes the soup and adds more seasoning",
        "sweeps the already-clean floor",
        "adjusts the chairs for the fifth time",
        "counts the coins in the till again"
    ],
    moderate: [
        "nods approvingly at the steady flow of customers",
        "efficiently serves drinks while maintaining conversation",
        "calls out a greeting to a regular customer",
        "signals the kitchen to prepare more food",
        "quickly wipes down a table between customers",
        "expertly juggles multiple orders",
        "shares a quick joke with the patrons at the bar"
    ],
    busy: [
        "rushes between tables with practiced efficiency",
        "shouts orders to the kitchen over the din",
        "barely has time to count the coins being handed over",
        "wipes sweat from their brow between orders",
        "calls for backup from the other workers",
        "apologizes for the wait to new arrivals"
    ]
};

const BAR_FIGHT_STARTERS = [
    { npc1: "Grimjaw", npc2: "Tethys", reason: "which world had the stronger warriors" },
    { npc1: "Shadowbane", npc2: "Chrome", reason: "a dispute over portal territory rights" },
    { npc1: "Frost-Eye", npc2: "Ember", reason: "conflicting dimensional theories" },
    { npc1: "The Collector", npc2: "Voidwhisper", reason: "ownership of a mysterious artifact" },
    { npc1: "Steelclaw", npc2: "Mirage", reason: "accusations of interdimensional smuggling" },
    { npc1: "Portalkeeper Zax", npc2: "Grimjaw", reason: "unpaid portal passage fees" },
    { npc1: "Nexus", npc2: "Shard", reason: "conflicting claims about their home worlds" },
    { npc1: "Whisper", npc2: "Ironhide", reason: "a misunderstanding about currency exchange rates" },
    { npc1: "Vex", npc2: "Quantum", reason: "a rigged dice game using probability manipulation" },
    { npc1: "Driftwood", npc2: "Stasis", reason: "who arrived in Hellungi first" },
    { npc1: "Glitch", npc2: "Prism", reason: "incompatible technologies causing interference" },
    { npc1: "Echo", npc2: "Null", reason: "philosophical differences about the nature of Hellungi" }
];

// Lower amounts since coin finds are now 60% of events (was 20%)
const FLOOR_FINDS = [
    { amount: 1, description: "a single copper coin under a chair" },
    { amount: 2, description: "a few copper coins dropped by tired workers" },
    { amount: 3, description: "some coins that rolled under the bar" },
    { amount: 4, description: "a forgotten tip that fell off a table" },
    { amount: 5, description: "silver coins from a spilled pouch" },
    { amount: 7, description: "coins hidden in a crack in the floor", rare: true },
    { amount: 10, description: "a small purse dropped during the rush", rare: true },
    { amount: 15, description: "gold pieces from a gambler's lucky streak", rare: true }
];

// Function to calculate salary based on power level
function calculateBaseSalary(power) {
    // Power 1 = 100, exponential increase
    const baseSalary = 100 * Math.pow(2, power - 1);
    return Math.floor(baseSalary);
}

// Function to calculate effectiveness bonus
async function calculateEffectivenessBonus(memberId, baseSalary) {
    try {
        const playerData = await getPlayerStats(memberId);
        const speedStat = playerData.stats.speed || 0;
        const sightStat = playerData.stats.sight || 0;
        const luckStat = playerData.stats.luck || 0;
        const miningStat = playerData.stats.mining || 0;
        
        // Speed affects service efficiency (0.5% per point, max 50% bonus)
        // - Faster order taking and delivery
        // - Ability to handle rush hours
        // - Quick table turnaround
        const speedBonus = Math.min(speedStat * 0.005, 0.5);
        
        // Sight affects customer satisfaction (0.4% per point, max 40% bonus)
        // - Notice when customers need refills
        // - Spot big tippers and VIPs
        // - Remember regular customer preferences
        const sightBonus = Math.min(sightStat * 0.004, 0.4);
        
        // Luck affects tips and special events (0.2% per point, max 20% bonus)
        // - Chance for generous tips
        // - Attract wealthy customers
        const luckBonus = Math.min(luckStat * 0.002, 0.2);
        
        // Mining strength helps with heavy lifting (0.1% per point, max 10% bonus)
        // - Carrying multiple orders
        // - Moving kegs and supplies
        const strengthBonus = Math.min(miningStat * 0.001, 0.1);
        
        // Calculate total multiplier
        const effectivenessMultiplier = 1 + speedBonus + sightBonus + luckBonus + strengthBonus;
        const effectivenessBonus = Math.floor(baseSalary * (effectivenessMultiplier - 1));
        
        // Calculate performance tier for dialogue
        let performanceTier = 'average';
        const totalStats = speedStat + sightStat;
        if (totalStats >= 150) performanceTier = 'legendary';
        else if (totalStats >= 100) performanceTier = 'excellent';
        else if (totalStats >= 50) performanceTier = 'good';
        else if (totalStats >= 25) performanceTier = 'decent';
        else if (totalStats < 10) performanceTier = 'poor';
        
        return {
            bonus: effectivenessBonus,
            speedStat,
            sightStat,
            luckStat,
            miningStat,
            speedBonus: Math.floor(speedBonus * 100),
            sightBonus: Math.floor(sightBonus * 100),
            luckBonus: Math.floor(luckBonus * 100),
            strengthBonus: Math.floor(strengthBonus * 100),
            multiplier: effectivenessMultiplier,
            performanceTier
        };
    } catch (error) {
        console.error('[InnKeeper] Error calculating effectiveness:', error);
        return {
            bonus: 0,
            speedStat: 0,
            sightStat: 0,
            luckStat: 0,
            miningStat: 0,
            speedBonus: 0,
            sightBonus: 0,
            luckBonus: 0,
            strengthBonus: 0,
            multiplier: 1,
            performanceTier: 'average'
        };
    }
}

// Function to generate AI dialogue with fallback
async function generateAIDialogue(prompt, fallbackOptions) {
    try {
        // Check if AI generation is available through the dialogue generator
        const AIDialogueGenerator = require('./innKeeping/aiDialogueGenerator');
        const aiGen = new AIDialogueGenerator();
        
        if (aiGen.isAvailable()) {
            // Use OpenAI to generate dialogue
            const OpenAI = require('openai');
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
            
            // Add Wandering Inn world context to all prompts
            const worldPrompt = prompt + "\n\nIMPORTANT: This takes place in the world of The Wandering Inn, where levels and classes exist, multiple species interact (Drakes, Gnolls, Humans, Antinium, Goblins, etc.), and magic is real. Skills appear in [brackets].";
            
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
                messages: [{ role: "user", content: worldPrompt }],
                max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 60,
                temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.9,
            });
            
            return response.choices[0].message.content.trim();
        }
        
        // Fallback to predefined options
        if (fallbackOptions && fallbackOptions.length > 0) {
            return fallbackOptions[Math.floor(Math.random() * fallbackOptions.length)];
        }
        return null;
    } catch (error) {
        console.error('[InnKeeper] AI generation failed, using fallback:', error);
        if (fallbackOptions && fallbackOptions.length > 0) {
            return fallbackOptions[Math.floor(Math.random() * fallbackOptions.length)];
        }
        return null;
    }
}

// Function to generate innkeeper commentary during slow periods
async function generateInnkeeperComment(channel, dbEntry) {
    try {
        // Get the shop owner's name
        const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
        const shopInfo = shops.find(s => s.id === serverData?.shop);
        const innkeeperName = shopInfo?.shopkeeper?.name || "The innkeeper";
        
        // Determine business level
        const recentSales = (dbEntry.gameData.sales || []).filter(s => {
            const saleTime = new Date(s.timestamp).getTime();
            return (Date.now() - saleTime) < 60000; // Sales in last minute
        }).length;
        
        let businessLevel = 'slow';
        let comment;
        
        if (recentSales >= 5) {
            businessLevel = 'busy';
            comment = INNKEEPER_COMMENTS.busy[Math.floor(Math.random() * INNKEEPER_COMMENTS.busy.length)];
        } else if (recentSales >= 2) {
            businessLevel = 'moderate';
            comment = INNKEEPER_COMMENTS.moderate[Math.floor(Math.random() * INNKEEPER_COMMENTS.moderate.length)];
        } else {
            businessLevel = 'slow';
            comment = INNKEEPER_COMMENTS.slow[Math.floor(Math.random() * INNKEEPER_COMMENTS.slow.length)];
        }
        
        // Add to event log
        const event = { 
            type: 'innkeeperComment', 
            comment: `${innkeeperName} ${comment}`,
            businessLevel: businessLevel,
            timestamp: new Date() 
        };
        await InnEventLog.addEvent(channel, dbEntry, event);
        
        return event;
        
    } catch (error) {
        console.error('[InnKeeper] Error generating innkeeper comment:', error);
        return null;
    }
}

// Function to generate a rumor event with smart context
async function generateRumorEvent(channel, dbEntry) {
    try {
        // Get the shop owner's name
        const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
        const shopInfo = shops.find(s => s.id === serverData?.shop);
        const innkeeperName = shopInfo?.shopkeeper?.name || "the innkeeper";
        const innName = shopInfo?.name || "the inn";
        
        // Get current VC members
        const voiceChannel = channel.guild.channels.cache.get(channel.id);
        const vcMembers = voiceChannel && voiceChannel.isVoiceBased() ? 
            Array.from(voiceChannel.members.values()).filter(m => !m.user.bot) : [];
        
        // Select two random NPCs for the conversation
        const eligibleNpcs = npcs.filter(npc => {
            const channelPower = serverData?.power || 1;
            return (!npc.minChannelPower || npc.minChannelPower <= channelPower);
        });
        
        if (eligibleNpcs.length < 2) return null;
        
        const npc1 = eligibleNpcs[Math.floor(Math.random() * eligibleNpcs.length)];
        let npc2 = eligibleNpcs[Math.floor(Math.random() * eligibleNpcs.length)];
        while (npc2.id === npc1.id) {
            npc2 = eligibleNpcs[Math.floor(Math.random() * eligibleNpcs.length)];
        }
        
        // Get smart server context for rumors
        const serverContext = await InnEventLog.getServerContext(channel.guild, channel.id);
        
        // Generate smart rumor based on server context
        let rumor;
        const useSmartRumor = Math.random() < 0.7; // 70% chance for smart rumor
        
        if (useSmartRumor && (serverContext.richestPlayers.length > 0 || 
                              serverContext.legendaryOwners.length > 0 || 
                              serverContext.activeEstablishments.length > 0)) {
            rumor = InnEventLog.generateSmartRumor(serverContext, shopInfo);
        } else {
            // Generate or select generic rumor
            const rumorPrompt = `Generate a short rumor or gossip that ${npc1.name} (${npc1.description}) might share with ${npc2.name} (${npc2.description}) at ${innkeeperName}'s establishment in Hellungi. 
            ${npc1.aiPersonality ? `\n${npc1.name}'s personality: ${npc1.aiPersonality.substring(0, 200)}...` : ''}
            ${vcMembers.length > 0 ? `Current patrons include: ${vcMembers.slice(0, 3).map(m => m.user.username).join(', ')}` : ''}
            Context: Hellungi is a mysterious nexus where portals connect different worlds. The legendary One Pick is said to have carved the first portals.
            The rumor should be about portals, dimensional travelers, The One Pick, The Miner King, strange artifacts, or interdimensional politics. Keep it under 20 words.`;
            rumor = await generateAIDialogue(rumorPrompt, RUMORS);
        }
        
        // Rumor now only appears in event log, no separate embed message
        
        // Add to event log
        const event = { type: 'rumor', npc1: npc1.name, npc2: npc2.name, rumor, timestamp: new Date() };
        await InnEventLog.addEvent(channel, dbEntry, event);
        
        return event;
        
    } catch (error) {
        console.error('[InnKeeper] Error generating rumor event:', error);
        return null;
    }
}

// Function to generate a bar fight event
async function generateBarFightEvent(channel, dbEntry) {
    try {
        const fight = BAR_FIGHT_STARTERS[Math.floor(Math.random() * BAR_FIGHT_STARTERS.length)];
        
        // Find the actual NPCs
        const npc1 = npcs.find(n => n.name === fight.npc1);
        const npc2 = npcs.find(n => n.name === fight.npc2);
        
        if (!npc1 || !npc2) return null;
        
        // Check channel power requirements
        const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
        const channelPower = serverData?.power || 1;
        
        if ((npc1.minChannelPower && npc1.minChannelPower > channelPower) ||
            (npc2.minChannelPower && npc2.minChannelPower > channelPower)) {
            return null;
        }
        
        // Get the shop owner's name
        const shopInfo = shops.find(s => s.id === serverData?.shop);
        const innkeeperName = shopInfo?.shopkeeper?.name || "the innkeeper";
        
        // Get current VC members for dynamic outcomes
        const voiceChannel = channel.guild.channels.cache.get(channel.id);
        const vcMembers = voiceChannel && voiceChannel.isVoiceBased() ? 
            Array.from(voiceChannel.members.values()).filter(m => !m.user.bot) : [];
        const randomVCMember = vcMembers.length > 0 ? 
            vcMembers[Math.floor(Math.random() * vcMembers.length)] : null;
        
        // Calculate damage/cost (reduced due to higher frequency)
        const damageCost = Math.floor((npc1.wealth + npc2.wealth) * 2 + Math.random() * 10);
        
        // Generate contextual outcomes based on the characters and actual people
        const outcomes = [
            `${npc1.name} throws a punch but misses and hits a keg of ${innkeeperName}'s special brew!`,
            `${npc2.name} tackles ${npc1.name} into a table, breaking ${innkeeperName}'s carefully arranged settings!`,
            `Both fighters knock over chairs and spill drinks everywhere!`,
            `The fight ends when ${innkeeperName} threatens to ban them both!`,
            `Other patrons pull them apart before ${innkeeperName} calls the guards!`,
            randomVCMember ? `${randomVCMember.user.username} tries to calm things down but gets splashed with ale!` : `The bouncer steps in and tosses both outside!`,
            `They slip on spilled ale and knock themselves out, much to ${innkeeperName}'s relief!`,
            randomVCMember ? `${randomVCMember.user.username} plays peacemaker and buys both combatants a drink!` : `${innkeeperName} personally throws them both out!`
        ];
        
        const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        
        // Bar fight now only appears in event log, no separate embed message
        
        // Add to event log
        const event = { 
            type: 'barfight', 
            cost: damageCost, 
            npc1: npc1.name, 
            npc2: npc2.name,
            reason: fight.reason,
            outcome: outcome,
            timestamp: new Date()
        };
        
        // Also track for profit calculation
        if (!dbEntry.gameData.events) dbEntry.gameData.events = [];
        dbEntry.gameData.events.push(event);
        
        await InnEventLog.addEvent(channel, dbEntry, event);
        
        return event;
        
    } catch (error) {
        console.error('[InnKeeper] Error generating bar fight event:', error);
        return null;
    }
}

// Function to generate a coin finding event
async function generateCoinFindEvent(channel, dbEntry) {
    try {
        // Get voice channel members
        const voiceChannel = channel.guild.channels.cache.get(channel.id);
        if (!voiceChannel || !voiceChannel.isVoiceBased()) return null;
        
        const membersInVC = Array.from(voiceChannel.members.values())
            .filter(member => !member.user.bot);
            
        if (membersInVC.length === 0) return null;
        
        // Select random member to find coins
        const luckyMember = membersInVC[Math.floor(Math.random() * membersInVC.length)];
        
        // Get the shop owner's name
        const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
        const shopInfo = shops.find(s => s.id === serverData?.shop);
        const innkeeperName = shopInfo?.shopkeeper?.name || "the innkeeper";
        
        // Check their luck stat for bonus
        const playerData = await getPlayerStats(luckyMember.id);
        const luckStat = playerData.stats.luck || 0;
        
        // Select coin amount (luck increases chance of rare finds)
        let selectedFind;
        if (luckStat > 50 && Math.random() < 0.3) {
            // High luck, chance for rare find
            const rareFinds = FLOOR_FINDS.filter(f => f.rare);
            selectedFind = rareFinds[Math.floor(Math.random() * rareFinds.length)];
        } else {
            const commonFinds = FLOOR_FINDS.filter(f => !f.rare);
            selectedFind = commonFinds[Math.floor(Math.random() * commonFinds.length)];
        }
        
        // Apply luck bonus to amount (further reduced since coins are found more often)
        const luckBonus = Math.floor(selectedFind.amount * (luckStat / 300)); // Reduced bonus for balance
        const totalAmount = selectedFind.amount + luckBonus;
        
        // Try to generate AI reasoning for finding the coins
        let findDescription = selectedFind.description;
        try {
            const otherMembers = membersInVC.filter(m => m.id !== luckyMember.id);
            const contextPrompt = `Generate a brief, creative reason why ${luckyMember.user.username} found ${totalAmount} coins at ${innkeeperName}'s inn. 
            Context: ${otherMembers.length > 0 ? `Other patrons present: ${otherMembers.slice(0, 3).map(m => m.user.username).join(', ')}` : 'They are alone in the inn'}
            The inn is in a fantasy world with adventurers, magic, and various species.
            Keep it under 15 words and make it specific to the situation.`;
            
            const aiReason = await generateAIDialogue(contextPrompt, [
                `while helping ${innkeeperName} clean up`,
                `after ${otherMembers.length > 0 ? otherMembers[0].user.username : 'someone'} knocked over a coin pouch`,
                `beneath where a wealthy merchant was sitting`,
                `in a hidden compartment ${innkeeperName} forgot about`,
                `that rolled out when moving furniture`
            ]);
            
            if (aiReason) {
                findDescription = aiReason;
            }
        } catch (error) {
            console.log('[InnKeeper] Could not generate AI coin find reason, using default');
        }
        
        // Award the coins
        await Money.findOneAndUpdate(
            { userId: luckyMember.id },
            { 
                $inc: { money: totalAmount },
                $set: { usertag: luckyMember.user.tag }
            },
            { upsert: true, new: true }
        );
        
        // Coin find now only appears in event log, no separate embed message
        
        // Add to event log
        const event = { 
            type: 'coinFind', 
            amount: totalAmount, 
            finder: luckyMember.id,
            finderName: luckyMember.user.username,
            timestamp: new Date()
        };
        await InnEventLog.addEvent(channel, dbEntry, event);
        
        return event;
        
    } catch (error) {
        console.error('[InnKeeper] Error generating coin find event:', error);
        return null;
    }
}

// Function to generate NPC customer sales (updated with wealth filtering)
async function generateNPCSale(channel, dbEntry) {
    try {
        // Get current shop items
        const gachaInfo = gachaServers.find(g => g.id === dbEntry.typeId);
        if (!gachaInfo) return null;
        
        const shopInfo = shopData.find(s => s.id === gachaInfo.shop);
        if (!shopInfo) return null;
        
        // Get server power for NPC filtering
        const channelPower = gachaInfo.power || 1;
        
        // Get available items (static + rotational)
        const availableItems = [...shopInfo.staticItems];
        
        // Only add consumables from the available items
        const consumableItems = availableItems
            .map(id => itemSheet.find(item => String(item.id) === String(id)))
            .filter(item => item && (item.type === 'consumable' || item.subtype === 'food' || item.subtype === 'drink'));
        
        if (consumableItems.length === 0) return null;
        
        // Filter NPCs by channel power
        const eligibleNpcs = npcs.filter(npc => {
            return !npc.minChannelPower || npc.minChannelPower <= channelPower;
        });
        
        // Weight NPCs by frequency AND wealth (higher channel power = higher wealth NPCs more likely)
        const npcWeights = {
            'very_common': 5,
            'common': 3,
            'uncommon': 2,
            'rare': 1
        };
        
        const weightedNPCs = [];
        eligibleNpcs.forEach(npc => {
            let weight = npcWeights[npc.frequency] || 1;
            
            // HEAVILY adjust weights based on channel power and NPC wealth
            // Lower power = prefer poor NPCs, Higher power = prefer rich NPCs
            if (channelPower <= 2) {
                // Low power establishments: strongly prefer poor customers
                if (npc.wealth <= 3) {
                    weight *= 4; // 4x weight for poor customers
                } else if (npc.wealth <= 5) {
                    weight *= 2; // 2x weight for middle class
                } else {
                    weight = Math.max(1, Math.floor(weight / 2)); // Reduce weight for wealthy
                }
            } else if (channelPower <= 4) {
                // Mid power establishments: balanced customer base
                if (npc.wealth >= 4 && npc.wealth <= 6) {
                    weight *= 2; // Prefer middle to upper-middle class
                }
            } else {
                // High power establishments: strongly prefer wealthy customers
                if (npc.wealth >= 7) {
                    weight *= 5; // 5x weight for very wealthy
                } else if (npc.wealth >= 5) {
                    weight *= 3; // 3x weight for wealthy
                } else if (npc.wealth <= 3) {
                    weight = Math.max(1, Math.floor(weight / 3)); // Greatly reduce poor customers
                }
            }
            
            for (let i = 0; i < weight; i++) {
                weightedNPCs.push(npc);
            }
        });
        
        if (weightedNPCs.length === 0) return null;
        
        const selectedNPC = weightedNPCs[Math.floor(Math.random() * weightedNPCs.length)];
        
        // Select item based on NPC preferences
        let eligibleItems = consumableItems.filter(item => {
            // Check if item matches NPC preferences
            return selectedNPC.preferences.some(pref => 
                item.type === pref || 
                item.subtype === pref ||
                (pref === 'food' && item.subtype === 'food') ||
                (pref === 'drink' && item.subtype === 'drink')
            );
        });
        
        // Fall back to all consumables if no preferences match
        if (eligibleItems.length === 0) {
            eligibleItems = consumableItems;
        }
        
        // Filter by budget
        const budgetLimits = {
            'low': 50,
            'medium': 200,
            'high': 10000
        };
        const maxPrice = budgetLimits[selectedNPC.budget] || 100;
        eligibleItems = eligibleItems.filter(item => item.value <= maxPrice);
        
        if (eligibleItems.length === 0) return null;
        
        // Select random item
        const selectedItem = eligibleItems[Math.floor(Math.random() * eligibleItems.length)];
        
        // Calculate price with shop fluctuation (simplified)
        const basePrice = selectedItem.value;
        const fluctuation = 0.8 + Math.random() * 0.4; // ±20% price fluctuation
        const salePrice = Math.floor(basePrice * fluctuation);
        
        // Calculate tip based on NPC's tip modifier, wealth, establishment power, and teamwork
        const baseTip = salePrice * 0.1; // 10% base
        
        // Get number of workers for teamwork bonus
        const voiceChannel = channel.guild.channels.cache.get(channel.id);
        const workersInVC = voiceChannel && voiceChannel.isVoiceBased() ? 
            Array.from(voiceChannel.members.values()).filter(m => !m.user.bot).length : 1;
        
        // Power level multiplies the wealth effect on tips
        // Power 1: normal tips, Power 4: 2x tips, Power 7: 3x tips
        const powerMultiplier = 1 + ((channelPower - 1) * 0.33);
        
        // Each wealth level adds more to tips, amplified by power
        const wealthMultiplier = 1 + (selectedNPC.wealth * 0.15 * powerMultiplier);
        
        // TEAMWORK BONUS: Good service from multiple workers increases tips
        // 1 worker: 100% tips, 2 workers: 115%, 3: 125%, 4: 132%, etc.
        const teamworkTipBonus = 1 + (Math.log(workersInVC + 1) - Math.log(2)) * 0.15;
        
        // High-power establishments have minimum tip percentages
        let minTipPercent = 0.1; // 10% base
        if (channelPower >= 6) minTipPercent = 0.25; // 25% minimum at legendary inns
        else if (channelPower >= 4) minTipPercent = 0.15; // 15% minimum at noble establishments
        
        const calculatedTip = Math.max(
            salePrice * minTipPercent,
            baseTip * selectedNPC.tipModifier * wealthMultiplier * teamworkTipBonus
        );
        const finalTip = Math.floor(calculatedTip);
        
        // Calculate profit (95% margin)
        const costBasis = Math.floor(basePrice * 0.05);
        const profit = salePrice - costBasis;
        
        // Record the sale
        const saleRecord = {
            itemId: selectedItem.id,
            profit: profit,
            buyer: selectedNPC.id,
            buyerName: selectedNPC.name,
            price: salePrice,
            tip: finalTip,
            timestamp: new Date(),
            isNPC: true,
            npcWealth: selectedNPC.wealth
        };
        
        // Add to gameData sales
        if (!dbEntry.gameData.sales) {
            dbEntry.gameData.sales = [];
        }
        dbEntry.gameData.sales.push(saleRecord);
        
        // Generate or select dialogue for the NPC
        let dialogue = selectedNPC.dialogue[Math.floor(Math.random() * selectedNPC.dialogue.length)];
        
        // Try to use AI dialogue generator if available
        try {
            const AIDialogueGenerator = require('./innKeeping/aiDialogueGenerator');
            const aiGen = new AIDialogueGenerator(channel.id);
            
            if (aiGen.isAvailable() && selectedNPC.aiPersonality) {
                // Generate contextual dialogue for this purchase
                const generatedDialogue = await aiGen.generateNPCDialogue(
                selectedNPC,
                selectedItem,
                salePrice,
                {
                tip: finalTip,
                mood: 'neutral',
                isHungry: Math.random() > 0.5,
                    worldContext: 'Hellungi - a dimensional crossroads'
                    }
                            );
                
                if (generatedDialogue) {
                    dialogue = generatedDialogue;
                }
            }
        } catch (error) {
            console.log('[InnKeeper] Could not generate AI dialogue, using default');
        }
        
        saleRecord.npcDialogue = dialogue;
        saleRecord.npcData = selectedNPC;
        saleRecord.workerCount = workersInVC; // Track how many workers served this customer
        
        return saleRecord;
        
    } catch (error) {
        console.error('[InnKeeper] Error generating NPC sale:', error);
        return null;
    }
}

// Function to distribute profits among VC members (updated to account for events)
async function distributeProfits(channel, dbEntry) {
    try {
        // Get voice channel if it exists
        const voiceChannel = channel.guild.channels.cache.get(channel.id);
        if (!voiceChannel || !voiceChannel.isVoiceBased()) {
            console.log('[InnKeeper] No voice channel found for profit distribution');
            return;
        }

        // Get members currently in the voice channel
        const membersInVC = Array.from(voiceChannel.members.values())
            .filter(member => !member.user.bot); // Exclude bots

        if (membersInVC.length === 0) {
            console.log('[InnKeeper] No members in voice channel for profit distribution');
            return;
        }

        // Get server data for salary calculation
        let serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
        const serverPower = serverData?.power || 1;
        const baseSalary = calculateBaseSalary(serverPower);

        // Calculate total profit and tips (with null safety)
        const sales = dbEntry.gameData.sales || [];
        const totalSales = sales.reduce((sum, sale) => sum + (sale.price || 0), 0);
        const totalProfit = sales.reduce((sum, sale) => sum + (sale.profit || 0), 0);
        const totalTips = sales.reduce((sum, sale) => sum + (sale.tip || 0), 0);
        
        // Calculate event costs (bar fights, etc.)
        const events = dbEntry.gameData.events || [];
        const eventCosts = events.reduce((sum, event) => sum + (event.cost || 0), 0);
        
        // SYNERGY BONUS: Working together generates extra profit through efficiency
        // This ensures groups earn more total than individuals working separately
        let synergyBonus = 0;
        if (membersInVC.length > 1) {
            // Each worker combo adds synergy: 2 workers = 10% bonus, 3 = 18%, 4 = 24%, etc.
            const synergyMultiplier = 1 + (Math.log(membersInVC.length) * 0.15);
            synergyBonus = Math.floor((totalProfit + totalTips) * (synergyMultiplier - 1));
        }
        
        const grandTotal = totalProfit + totalTips + synergyBonus - eventCosts;
        
        // Track earnings for each member
        const earnings = {};
        const memberIds = membersInVC.map(m => m.id);
        
        // Initialize earnings and calculate salaries for all VC members
        for (const member of membersInVC) {
            const effectivenessData = await calculateEffectivenessBonus(member.id, baseSalary);
            earnings[member.id] = {
                base: 0,
                tips: 0,
                salary: baseSalary,
                effectivenessBonus: effectivenessData.bonus,
                speedStat: effectivenessData.speedStat,
                sightStat: effectivenessData.sightStat,
                luckStat: effectivenessData.luckStat,
                miningStat: effectivenessData.miningStat,
                speedBonus: effectivenessData.speedBonus,
                sightBonus: effectivenessData.sightBonus,
                luckBonus: effectivenessData.luckBonus,
                strengthBonus: effectivenessData.strengthBonus,
                performanceTier: effectivenessData.performanceTier,
                total: baseSalary + effectivenessData.bonus
            };
        }

        // Distribute profit and tips from each sale
        for (const sale of sales) {
            // Skip sales with invalid data
            if (!sale.profit && !sale.tip) continue;
            
            // For NPC sales, distribute to all workers
            // For player sales, exclude the buyer
            const eligibleMembers = sale.isNPC ? 
                memberIds : 
                memberIds.filter(id => id !== sale.buyer);
            
            if (eligibleMembers.length > 0) {
                // Split this sale's profit equally among eligible members
                const profitPerMember = Math.floor((sale.profit || 0) / eligibleMembers.length);
                const tipPerMember = sale.tip ? Math.floor(sale.tip / eligibleMembers.length) : 0;
                
                eligibleMembers.forEach(memberId => {
                    earnings[memberId].base += profitPerMember;
                    earnings[memberId].tips += tipPerMember;
                    earnings[memberId].total += profitPerMember + tipPerMember;
                });
            }
        }
        
        // Deduct event costs equally from all members
        if (eventCosts > 0 && memberIds.length > 0) {
            const costPerMember = Math.floor(eventCosts / memberIds.length);
            memberIds.forEach(memberId => {
                earnings[memberId].total = Math.max(0, earnings[memberId].total - costPerMember);
            });
        }

        // Select Employee of the Day only if there's more than one worker
        let employeeOfTheDay = null;
        if (membersInVC.length > 1) {
            employeeOfTheDay = membersInVC[Math.floor(Math.random() * membersInVC.length)];
            // Double the employee of the day's total payout
            earnings[employeeOfTheDay.id].total *= 2;
            earnings[employeeOfTheDay.id].isEmployeeOfDay = true;
        }

        // Award the earnings to each member
        const Currency = require('../../models/currency');
        const payouts = [];
        
        for (const [memberId, earningData] of Object.entries(earnings)) {
            const member = membersInVC.find(m => m.id === memberId);
            
            // Update currency
            await Currency.findOneAndUpdate(
                { userId: memberId },
                { 
                    $inc: { money: earningData.total },
                    $set: { usertag: member.user.tag }
                },
                { upsert: true, new: true }
            );
            
            payouts.push({
                member: member,
                ...earningData
            });
        }

        // Aggregate item sales data and map IDs to names
        const itemSalesMap = new Map();
        for (const sale of sales) {
            const key = sale.itemId;
            // Get item name from itemSheet
            const item = itemSheet.find(i => String(i.id) === String(sale.itemId));
            const itemName = item ? item.name : `Item #${sale.itemId}`;
            
            if (!itemSalesMap.has(key)) {
                itemSalesMap.set(key, { 
                    name: itemName,
                    count: 0, 
                    totalRevenue: 0 
                });
            }
            const itemData = itemSalesMap.get(key);
            itemData.count += 1;
            // Use sale.price if available, otherwise default to 0 to avoid NaN
            itemData.totalRevenue += (sale.price || 0);
            itemSalesMap.set(key, itemData);
        }

        // Get the shop owner's name for the report
        serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
        const shopInfo = shops.find(s => s.id === serverData?.shop);
        const innkeeperName = shopInfo?.shopkeeper?.name || "The innkeeper";
        const innName = shopInfo?.name || "the inn";
        
        // Create and send the summary embed
        if (payouts.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle(`🪵 ${innkeeperName}'s Daily Report`)
                .setColor(0x8B4513) // Wooden brown color
                .setTimestamp()
                .setFooter({ text: `${innName}` });

            // Add profile picture
            if (membersInVC.length === 1) {
                // Solo worker
                embed.setThumbnail(membersInVC[0].user.displayAvatarURL({ dynamic: true, size: 256 }));
            } else if (employeeOfTheDay) {
                // Employee of the day
                embed.setThumbnail(employeeOfTheDay.user.displayAvatarURL({ dynamic: true, size: 256 }));
            }

            // Prepare payout summary text
            let payoutSummary = '';
            
            // Sort workers by total earnings
            const sortedPayouts = payouts.sort((a, b) => b.total - a.total);
            
            // Handle employee of the day or solo shift at the top
            if (membersInVC.length === 1) {
                const soloPayout = sortedPayouts[0];
                payoutSummary = `✨ **${soloPayout.member.user.username}'s Shift** ✨\n`;
                payoutSummary += `\`\`\`\n`;
                payoutSummary += `Base Earnings: ${soloPayout.base}c | Tips: ${soloPayout.tips}c\n`;
                payoutSummary += `Salary: ${soloPayout.salary}c | Effectiveness: +${soloPayout.effectivenessBonus}c\n`;
                payoutSummary += `\nPerformance Breakdown:\n`;
                payoutSummary += `  Speed (${soloPayout.speedStat}): +${soloPayout.speedBonus}% service\n`;
                payoutSummary += `  Sight (${soloPayout.sightStat}): +${soloPayout.sightBonus}% attention\n`;
                if (soloPayout.luckBonus > 0) {
                    payoutSummary += `  Luck (${soloPayout.luckStat}): +${soloPayout.luckBonus}% fortune\n`;
                }
                if (soloPayout.strengthBonus > 0) {
                    payoutSummary += `  Mining (${soloPayout.miningStat}): +${soloPayout.strengthBonus}% strength\n`;
                }
                payoutSummary += `\nPerformance Rating: ${soloPayout.performanceTier.toUpperCase()}\n`;
                payoutSummary += `\`\`\`\n`;
                payoutSummary += `\n**Total Payout:**  『 **${soloPayout.total}c** 』\n`;
            } else if (employeeOfTheDay) {
                const employeePayout = sortedPayouts.find(p => p.isEmployeeOfDay);
                payoutSummary = `⭐ **Worker of the Day** ⭐\n`;
                payoutSummary += `**${employeePayout.member.user.username}** has been selected!\n\n`;
                payoutSummary += `\`\`\`\n`;
                payoutSummary += `Base Earnings: ${employeePayout.base}c | Tips: ${employeePayout.tips}c\n`;
                payoutSummary += `Salary: ${employeePayout.salary}c | Effectiveness: +${employeePayout.effectivenessBonus}c\n`;
                payoutSummary += `\nPerformance Breakdown:\n`;
                payoutSummary += `  Speed (${employeePayout.speedStat}): +${employeePayout.speedBonus}% service\n`;
                payoutSummary += `  Sight (${employeePayout.sightStat}): +${employeePayout.sightBonus}% attention\n`;
                if (employeePayout.luckBonus > 0) {
                    payoutSummary += `  Luck (${employeePayout.luckStat}): +${employeePayout.luckBonus}% fortune\n`;
                }
                if (employeePayout.strengthBonus > 0) {
                    payoutSummary += `  Mining (${employeePayout.miningStat}): +${employeePayout.strengthBonus}% strength\n`;
                }
                payoutSummary += `\nPerformance Rating: ${employeePayout.performanceTier.toUpperCase()}\n`;
                payoutSummary += `\`\`\`\n`;
                payoutSummary += `\n**Total Payout:**  『 **${employeePayout.total}c** 』 *(2x bonus!)*\n`;
            }
            
            // Add description with payout summary
            embed.setDescription(payoutSummary);

            // Create item sales list for code block
            let itemSalesList = 'ITEM SALES BREAKDOWN:\n';
            itemSalesList += '─'.repeat(40) + '\n';
            
            // Sort items by revenue
            const sortedItems = Array.from(itemSalesMap.entries())
                .sort((a, b) => b[1].totalRevenue - a[1].totalRevenue);
            
            for (const [itemId, data] of sortedItems) {
                // Only show items with actual revenue
                if (data.totalRevenue > 0) {
                    itemSalesList += `${data.name}: ${data.count}x sold | 💰 ${data.totalRevenue}c\n`;
                } else {
                    itemSalesList += `${data.name}: ${data.count}x sold | 💰 0c\n`;
                }
            }
            
            // Add events section if there were any
            if (events.length > 0) {
                itemSalesList += '\n';
                itemSalesList += 'EVENTS & INCIDENTS:\n';
                itemSalesList += '─'.repeat(40) + '\n';
                
                for (const event of events) {
                    if (event.type === 'barfight') {
                        itemSalesList += `⚔️ Bar Fight - Cost: ${event.cost}c\n`;
                    } else if (event.type === 'coinFind') {
                        itemSalesList += `💰 Coins Found - Amount: ${event.amount}c\n`;
                    } else if (event.type === 'rumor') {
                        itemSalesList += `🗣️ Rumor Overheard\n`;
                    }
                }
            }
            
            itemSalesList += '\n';
            itemSalesList += 'SALES REPORT:\n';
            itemSalesList += '─'.repeat(40) + '\n';
            itemSalesList += `Total Sales: ${sales.length}\n`;
            itemSalesList += `Revenue: ${totalSales}c\n`;
            itemSalesList += `Base Profit: ${totalProfit}c\n`;
            itemSalesList += `Tips Earned: ${totalTips}c\n`;
            if (eventCosts > 0) {
                itemSalesList += `Event Costs: -${eventCosts}c\n`;
            }
            if (synergyBonus > 0) {
                itemSalesList += `Synergy Bonus: +${synergyBonus}c\n`;
            }
            itemSalesList += `Grand Total: ${grandTotal + (synergyBonus || 0)}c\n`;
            
            // Add best sale to sales report
            if (sales.length > 0) {
                const topSale = sales.reduce((max, sale) => 
                    (sale.profit + (sale.tip || 0)) > (max.profit + (max.tip || 0)) ? sale : max, sales[0]);
                
                // Get item name for top sale
                const topItem = itemSheet.find(i => String(i.id) === String(topSale.itemId));
                const topItemName = topItem ? topItem.name : `Item #${topSale.itemId}`;
                itemSalesList += `\n🏆 Best Sale: ${topItemName}\n`;
                itemSalesList += `   Profit: ${topSale.profit}c | Tip: ${topSale.tip || 0}c\n`;
                if (topSale.isNPC) {
                    itemSalesList += `   Customer: ${topSale.buyerName} (Wealth: ${topSale.npcWealth || 'N/A'})\n`;
                }
            }
            
            itemSalesList += '\n';
            itemSalesList += 'WORKER PAYOUTS:\n';
            itemSalesList += '─'.repeat(40) + '\n';
            itemSalesList += `Base Salary: ${baseSalary}c (Power Level ${serverPower})\n`;
            itemSalesList += '─'.repeat(40) + '\n';
            
            // Add other workers (excluding employee of the day if shown above)
            for (const payout of sortedPayouts) {
                // Skip if this is the employee of the day or solo worker (already shown above)
                if ((membersInVC.length === 1) || (employeeOfTheDay && payout.isEmployeeOfDay)) {
                    continue;
                }
                
                itemSalesList += `${payout.member.user.username}:\n`;
                itemSalesList += `  Base: ${payout.base}c | Tips: ${payout.tips}c\n`;
                itemSalesList += `  Effectiveness Bonus: +${payout.effectivenessBonus}c\n`;
                itemSalesList += `    Speed (${payout.speedStat}): +${payout.speedBonus}% service\n`;
                itemSalesList += `    Sight (${payout.sightStat}): +${payout.sightBonus}% attention\n`;
                if (payout.luckBonus > 0) {
                    itemSalesList += `    Luck (${payout.luckStat}): +${payout.luckBonus}% fortune\n`;
                }
                if (payout.strengthBonus > 0) {
                    itemSalesList += `    Mining (${payout.miningStat}): +${payout.strengthBonus}% strength\n`;
                }
                itemSalesList += `  Performance: ${payout.performanceTier.toUpperCase()}\n`;
                itemSalesList += `  TOTAL: ${payout.total}c\n`;
                itemSalesList += '─────\n';
            }
            
            // Add fields with code block
            // Add teamwork summary if multiple workers
            if (membersInVC.length > 1) {
                const avgCustomersPerWorker = Math.floor(sales.length / membersInVC.length);
                const synergyPercent = Math.floor((Math.log(membersInVC.length) * 0.15) * 100);
                embed.addFields({
                    name: '🤝 Teamwork Report',
                    value: `**Workers:** ${membersInVC.length} | **Synergy Bonus:** +${synergyPercent}%\n` +
                           `**Customers Served:** ${sales.length} (${avgCustomersPerWorker}/worker avg)\n` +
                           `**Team Efficiency:** ${membersInVC.length <= 3 ? 'Optimal' : membersInVC.length <= 5 ? 'Good' : 'Overstaffed'}`,
                    inline: false
                });
            }
            
            embed.addFields({
                name: '📜 Detailed Report',
                value: `\`\`\`\n${itemSalesList}\`\`\``,
                inline: false
            });

            await channel.send({ embeds: [embed] });
        }
        
        // Clear the event log and events after distribution
        await InnEventLog.clearEventLog(channel);
        dbEntry.gameData.events = [];
        
        console.log(`[InnKeeper] Distributed ${grandTotal} coins among ${payouts.length} workers`);
        
    } catch (error) {
        console.error('[InnKeeper] Error distributing profits:', error);
    }
}

// Message throttling to prevent spam with rapid events
const messageThrottle = new Map();
const MESSAGE_COOLDOWN = 3000; // 3 seconds between messages to prevent spam

module.exports = async (channel, dbEntry, json) => {
    const now = Date.now(); // current timestamp in milliseconds
    
    console.log(`[InnKeeper] Starting cycle for channel ${dbEntry.channelId}`);
    
    // Check message throttle
    const lastMessage = messageThrottle.get(channel.id) || 0;
    const canSendMessage = (now - lastMessage) >= MESSAGE_COOLDOWN;
    
    // Work day constants
    const WORK_DURATION = 25 * 60 * 1000; // 25 minutes
    const BREAK_DURATION = 5 * 60 * 1000; // 5 minutes
    const ACTIVITY_GUARANTEE = 20 * 1000; // 20 seconds maximum between activities

    // Initialize gameData with sales array and gamemode identifier if it doesn't exist
    if (!dbEntry.gameData) {
        console.log('[InnKeeper] Initializing new gameData');
        dbEntry.gameData = {
            gamemode: 'innkeeper',
            sales: [],
            events: [],
            lastProfitDistribution: new Date(),
            lastNPCSale: new Date(now - 10 * 1000),
            lastEvent: new Date(now - 10 * 1000),
            lastShopGeneration: new Date(now - 5 * 60 * 1000),
            workState: 'working',
            workStartTime: new Date(),
            breakEndTime: null
        };
    } else {
        // Ensure all required fields exist
        if (!dbEntry.gameData.gamemode) dbEntry.gameData.gamemode = 'innkeeper';
        if (!dbEntry.gameData.sales) dbEntry.gameData.sales = [];
        if (!dbEntry.gameData.events) dbEntry.gameData.events = [];
        if (!dbEntry.gameData.lastNPCSale) dbEntry.gameData.lastNPCSale = new Date(now - 10 * 1000);
        if (!dbEntry.gameData.lastEvent) dbEntry.gameData.lastEvent = new Date(now - 10 * 1000);
        if (!dbEntry.gameData.lastShopGeneration) dbEntry.gameData.lastShopGeneration = new Date(now - 5 * 60 * 1000);
        if (!dbEntry.gameData.workState) dbEntry.gameData.workState = 'working';
        if (!dbEntry.gameData.workStartTime) dbEntry.gameData.workStartTime = new Date();
    }

    // Check work state and handle breaks/work periods
    if (dbEntry.gameData.workState === 'break') {
        // We're on break
        if (dbEntry.gameData.breakEndTime && now >= new Date(dbEntry.gameData.breakEndTime).getTime()) {
            // Break is over, start new work day
            console.log('[InnKeeper] Break ending, resuming work');
            dbEntry.gameData.workState = 'working';
            dbEntry.gameData.workStartTime = new Date();
            dbEntry.gameData.breakEndTime = null;
            dbEntry.gameData.sales = [];
            dbEntry.gameData.events = [];
            
            // Send work resuming message
            const embed = new EmbedBuilder()
                .setTitle('🔔 The Inn Reopens!')
                .setColor(0x2ECC71)
                .setDescription('Break time is over! The inn is now open for business again.')
                .setTimestamp();
            await channel.send({ embeds: [embed] });
            
            // Set next trigger and save
            dbEntry.nextTrigger = new Date(now + 10000); // 10 seconds
            dbEntry.markModified('gameData');
            await dbEntry.save();
            return;
        } else {
            // Still on break
            const breakTimeLeft = Math.ceil((new Date(dbEntry.gameData.breakEndTime).getTime() - now) / 60000);
            console.log(`[InnKeeper] On break for ${breakTimeLeft} more minutes`);
            
            // Set next trigger for end of break or 30 seconds, whichever is sooner
            const nextCheck = Math.min(30000, new Date(dbEntry.gameData.breakEndTime).getTime() - now);
            dbEntry.nextTrigger = new Date(now + nextCheck);
            dbEntry.markModified('gameData');
            await dbEntry.save();
            return;
        }
    }
    
    // Check if work day is complete (25 minutes)
    const workStartTime = new Date(dbEntry.gameData.workStartTime).getTime();
    const timeSinceWorkStart = now - workStartTime;
    
    if (timeSinceWorkStart >= WORK_DURATION && dbEntry.gameData.workState === 'working') {
        console.log('[InnKeeper] Work day complete, starting break');
        // Work day is complete, distribute profits and start break
        if (dbEntry.gameData.sales.length > 0 || dbEntry.gameData.events.length > 0) {
            await distributeProfits(channel, dbEntry);
        }
        
        // Start break
        dbEntry.gameData.workState = 'break';
        dbEntry.gameData.breakEndTime = new Date(now + BREAK_DURATION);
        dbEntry.gameData.sales = [];
        dbEntry.gameData.events = [];
        
        // Send break message
        const embed = new EmbedBuilder()
            .setTitle('☕ Break Time!')
            .setColor(0xF39C12)
            .setDescription('The inn is closing for a 5-minute break. Workers deserve some rest!')
            .addFields(
                { name: 'Break Duration', value: '5 minutes', inline: true },
                { name: 'Reopening At', value: `<t:${Math.floor((now + BREAK_DURATION) / 1000)}:R>`, inline: true }
            )
            .setTimestamp();
        await channel.send({ embeds: [embed] });
        
        // Set next trigger for end of break
        dbEntry.nextTrigger = new Date(now + BREAK_DURATION);
        dbEntry.markModified('gameData');
        await dbEntry.save();
        return;
    }

    // GUARANTEED ACTIVITY SYSTEM
    // Track last activity (any event or sale)
    const lastActivity = Math.max(
        new Date(dbEntry.gameData.lastNPCSale).getTime(),
        new Date(dbEntry.gameData.lastEvent).getTime()
    );
    const timeSinceLastActivity = now - lastActivity;
    const forceEvent = timeSinceLastActivity >= ACTIVITY_GUARANTEE;
    
    if (forceEvent) {
        console.log(`[InnKeeper] Forcing event - ${timeSinceLastActivity}ms since last activity`);
    }

    // Get server power and worker count
    const gachaInfo = gachaServers.find(g => g.id === dbEntry.typeId);
    const channelPower = gachaInfo?.power || 1;
    
    const voiceChannel = channel.guild.channels.cache.get(channel.id);
    const workersInVC = voiceChannel && voiceChannel.isVoiceBased() ? 
        Array.from(voiceChannel.members.values()).filter(m => !m.user.bot).length : 0;
    
    let eventOccurred = false;
    
    // Priority 1: Try NPC Sale (70% chance when forced, higher base chance)
    const lastNPCSale = new Date(dbEntry.gameData.lastNPCSale).getTime();
    const npcCooldown = forceEvent ? 0 : 5000; // No cooldown if forcing
    const npcSaleChance = forceEvent ? 0.85 : 0.70; // Higher chance for NPCs
    
    if (now - lastNPCSale >= npcCooldown && Math.random() < npcSaleChance) {
        const npcSale = await generateNPCSale(channel, dbEntry);
        if (npcSale) {
            dbEntry.gameData.lastNPCSale = new Date();
            dbEntry.markModified('gameData');
            await dbEntry.save();
            eventOccurred = true;
            
            console.log(`[InnKeeper] NPC sale: ${npcSale.buyerName} bought item for ${npcSale.price}c`);
            
            // Update the event log with NPC info (only if not throttled)
            if (canSendMessage) {
                await InnEventLog.updateWithNPCPurchase(channel, dbEntry, npcSale);
                messageThrottle.set(channel.id, now);
            }
        }
    }
    
    // Priority 2: Try Random Events if no NPC sale
    if (!eventOccurred) {
        const lastEvent = new Date(dbEntry.gameData.lastEvent).getTime();
        const eventCooldown = forceEvent ? 0 : 5000;
        const eventChance = forceEvent ? 0.80 : 0.60;
        
        if (now - lastEvent >= eventCooldown && Math.random() < eventChance) {
            const eventType = Math.random();
            let event = null;
            
            if (eventType < 0.20) {
                // 20% chance for bar fight
                event = await generateBarFightEvent(channel, dbEntry);
                if (event) console.log(`[InnKeeper] Bar fight between ${event.npc1} and ${event.npc2}`);
            } else if (eventType < 0.40) {
                // 20% chance for rumor
                event = await generateRumorEvent(channel, dbEntry);
                if (event) console.log(`[InnKeeper] Rumor overheard`);
            } else {
                // 60% chance for coin find
                event = await generateCoinFindEvent(channel, dbEntry);
                if (event) console.log(`[InnKeeper] ${event.finderName} found ${event.amount} coins`);
            }
            
            if (event) {
                dbEntry.gameData.lastEvent = new Date();
                dbEntry.markModified('gameData');
                await dbEntry.save();
                eventOccurred = true;
                
                if (canSendMessage) {
                    messageThrottle.set(channel.id, now);
                }
            }
        }
    }
    
    // Priority 3: Fallback to innkeeper commentary if nothing else happened and we're forcing
    if (!eventOccurred && forceEvent && canSendMessage) {
        const comment = await generateInnkeeperComment(channel, dbEntry);
        if (comment) {
            dbEntry.gameData.lastEvent = new Date();
            dbEntry.markModified('gameData');
            await dbEntry.save();
            eventOccurred = true;
            messageThrottle.set(channel.id, now);
            console.log(`[InnKeeper] Innkeeper comment: ${comment.businessLevel} day`);
        }
    }

    // Check if we should generate shop (only every 5 minutes during quiet periods)
    if (channel && channel.isTextBased()) {
        const lastShopGen = new Date(dbEntry.gameData.lastShopGeneration).getTime();
        const timeSinceLastShop = now - lastShopGen;
        const SHOP_COOLDOWN = 5 * 60 * 1000; // 5 minutes
        
        const timeSinceLastEventCheck = now - new Date(dbEntry.gameData.lastEvent).getTime();
        const timeSinceLastSaleCheck = now - new Date(dbEntry.gameData.lastNPCSale).getTime();
        const nothingHappening = timeSinceLastEventCheck > 30000 && timeSinceLastSaleCheck > 30000;
        
        if (timeSinceLastShop >= SHOP_COOLDOWN && nothingHappening) {
            generateShop(channel);
            dbEntry.gameData.lastShopGeneration = new Date();
            dbEntry.markModified('gameData');
            await dbEntry.save();
            console.log(`[InnKeeper] Generated shop for channel ${dbEntry.channelId} (quiet period)`);
        }
    }

    // Set next trigger - shorter if we need to guarantee activity soon
    const timeSinceLastActivityNow = Math.max(
        now - new Date(dbEntry.gameData.lastNPCSale).getTime(),
        now - new Date(dbEntry.gameData.lastEvent).getTime()
    );
    
    let nextTriggerDelay;
    if (timeSinceLastActivityNow >= ACTIVITY_GUARANTEE - 5000) {
        // If we're close to the guarantee time, check sooner
        nextTriggerDelay = 5000; // 5 seconds
    } else {
        // Normal random delay
        nextTriggerDelay = (5 + Math.random() * 10) * 1000; // 5-15 seconds
    }
    
    dbEntry.nextTrigger = new Date(now + nextTriggerDelay);
    
    // Mark gameData as modified and save
    dbEntry.markModified('gameData');
    await dbEntry.save();
    
    // Debug logging
    console.log(`[InnKeeper] Channel ${dbEntry.channelId} - Sales: ${dbEntry.gameData.sales.length}, Events: ${dbEntry.gameData.events.length}, Next trigger in ${Math.round(nextTriggerDelay/1000)}s`);
};