// when users are in this channel >
// they passively gain 1-3 coins based on randomness >
// 
const Money = require('../../models/currency'); // Adjust path as needed
const PlayerInventory = require('../../models/inventory'); // your inventory schema
const generateShop = require('../generateShop');
const { EmbedBuilder } = require('discord.js');
const InnKeeperSales = require('./innKeeping/innKeeperSales');
const InnSalesLog = require('./innKeeping/innSalesLog');
const getPlayerStats = require('../calculatePlayerStat');
const gachaServers = require('../../data/gachaServers.json');
const itemSheet = require('../../data/itemSheet.json');
const shops = require('../../data/shops.json');
const shopData = require('../../data/shops.json'); // Alias for compatibility
const npcs = require('../../data/npcs.json');
const ActiveVCs = require('../../models/activevcs');

// Rumor and event templates for fallback when AI isn't available
const RUMORS = [
    "the Antinium are planning something big in their Hive",
    "a Named Adventurer was spotted heading to Liscor's dungeon",
    "the door to Pallass has been acting strangely lately",
    "Wistram Academy is recruiting mages from Liscor",
    "strange monsters have been coming from the dungeon's new areas",
    "the Necromancer Az'kerash has been sighted in the region",
    "Magnolia Reinhart's [Maids] were asking questions in town",
    "the Gnoll tribes are gathering for an important Gnollmoot",
    "Drake cities are mobilizing their armies for something",
    "a new floor of the dungeon opened with incredible treasures",
    "the Titan of Baleros sent a message to someone in Liscor",
    "Flos, the King of Destruction, has awakened in Chandrar",
    "the Goblin Lord's army movements worry nearby cities",
    "something ancient stirs in the High Passes",
    "the Blighted Kingdom seeks adventurers for their eternal war",
    "the Wandering Inn's magical door network keeps expanding"
];

const BAR_FIGHT_STARTERS = [
    { npc1: "Relc Grasstongue", npc2: "Pisces Jealnet", reason: "an argument about who's the better fighter" },
    { npc1: "Numbtongue", npc2: "Olesm Swifttail", reason: "a chess game accusation of cheating" },
    { npc1: "Jelaqua Ivirith", npc2: "Grimalkin of Pallass", reason: "proper training methods" },
    { npc1: "Seborn Sailwinds", npc2: "Drassi", reason: "Seborn wanting privacy while Drassi wants an interview" },
    { npc1: "Ceria Springwalker", npc2: "Bezale", reason: "Wistram Academy politics" },
    { npc1: "Watch Captain Zevara", npc2: "Relc Grasstongue", reason: "Relc's latest property damage report" },
    { npc1: "Yvlon Byres", npc2: "Saliss of Lights", reason: "Saliss making jokes about metal arms" },
    { npc1: "Ulvama", npc2: "Lyonette du Marquin", reason: "proper inn management techniques" },
    { npc1: "Wilovan", npc2: "Ratici", reason: "a 'gentlemanly disagreement' about payment splits" },
    { npc1: "Bird", npc2: "Apista", reason: "Bird trying to shoot the flying bee" },
    { npc1: "Belgrade", npc2: "Hexel Quithail", reason: "optimal defensive architecture" },
    { npc1: "Ksmvr", npc2: "Klbkch the Slayer", reason: "proper Antinium behavior" }
];

const FLOOR_FINDS = [
    { amount: 5, description: "a few copper coins dropped by tired workers" },
    { amount: 10, description: "a small pouch lost during yesterday's bar fight" },
    { amount: 15, description: "silver coins that rolled under a gaming table" },
    { amount: 20, description: "a forgotten tip that fell off the bar" },
    { amount: 25, description: "an adventurer's loose change from their belt pouch" },
    { amount: 50, description: "coins hidden behind a loose floorboard", rare: true },
    { amount: 100, description: "a noble's purse dropped during last night's festivities", rare: true },
    { amount: 75, description: "gold pieces from a gambler's lucky streak", rare: true }
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

// Function to generate a rumor event
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
        
        // Generate or select rumor - sometimes include VC members or the innkeeper
        const rumorPrompt = `Generate a short rumor or gossip that ${npc1.name} (${npc1.description}) might share with ${npc2.name} (${npc2.description}) at ${innkeeperName}'s establishment. 
        ${npc1.aiPersonality ? `\n${npc1.name}'s personality: ${npc1.aiPersonality.substring(0, 200)}...` : ''}
        ${vcMembers.length > 0 ? `Current patrons include: ${vcMembers.slice(0, 3).map(m => m.user.username).join(', ')}` : ''}
        The rumor should be about events in this fantasy world - perhaps about adventurers, dungeons, politics, ${innkeeperName}, or other characters. Keep it under 20 words.`;
        const rumor = await generateAIDialogue(rumorPrompt, RUMORS);
        
        const embed = new EmbedBuilder()
            .setTitle('🗣️ Overheard Conversation')
            .setColor(0x9B59B6)
            .setDescription(`*You overhear ${npc1.name} whispering to ${npc2.name}:*\n\n"Have you heard? They say **${rumor}**..."`)
            .setFooter({ text: 'Rumors spread quickly in the inn...' })
            .setTimestamp();
            
        await channel.send({ embeds: [embed] });
        
        return { type: 'rumor', npc1: npc1.name, npc2: npc2.name, rumor };
        
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
        
        // Calculate damage/cost (higher wealth NPCs cause more damage)
        const damageCost = Math.floor((npc1.wealth + npc2.wealth) * 10 + Math.random() * 50);
        
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
        
        const embed = new EmbedBuilder()
            .setTitle('⚔️ Bar Fight!')
            .setColor(0xE74C3C)
            .setDescription(`**${npc1.name}** and **${npc2.name}** start fighting over ${fight.reason}!\n\n${outcome}`)
            .addFields(
                { name: 'Damage Cost', value: `${damageCost} coins`, inline: true },
                { name: 'Cause', value: fight.reason, inline: true }
            )
            .setFooter({ text: 'The cost will be deducted from today\'s profits!' })
            .setTimestamp();
            
        await channel.send({ embeds: [embed] });
        
        // Deduct from profits
        if (!dbEntry.gameData.events) dbEntry.gameData.events = [];
        dbEntry.gameData.events.push({
            type: 'barfight',
            cost: damageCost,
            timestamp: new Date()
        });
        
        return { type: 'barfight', cost: damageCost, npc1: npc1.name, npc2: npc2.name };
        
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
        
        // Apply luck bonus to amount
        const luckBonus = Math.floor(selectedFind.amount * (luckStat / 100));
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
        
        const embed = new EmbedBuilder()
            .setTitle('💰 Coins Found!')
            .setColor(0xF1C40F)
            .setDescription(`**${luckyMember.user.username}** found coins ${findDescription}!`)
            .addFields(
                { name: 'Base Amount', value: `${selectedFind.amount} coins`, inline: true }
            );
            
        if (luckBonus > 0) {
            embed.addFields({ name: 'Luck Bonus', value: `+${luckBonus} coins`, inline: true });
        }
        
        embed.addFields({ name: 'Total', value: `**${totalAmount} coins**`, inline: true })
            .setFooter({ text: `Luck Stat: ${luckStat}` })
            .setTimestamp();
            
        await channel.send({ embeds: [embed] });
        
        return { type: 'coinFind', amount: totalAmount, finder: luckyMember.id };
        
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
            
            // Increase weight for wealthy NPCs if channel power is high
            if (channelPower >= 4 && npc.wealth >= 6) {
                weight *= 2;
            } else if (channelPower >= 6 && npc.wealth >= 7) {
                weight *= 3;
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
        
        // Calculate tip based on NPC's tip modifier and wealth
        const baseTip = salePrice * 0.1; // 10% base
        const wealthMultiplier = 1 + (selectedNPC.wealth * 0.1); // Each wealth level adds 10%
        const finalTip = Math.floor(baseTip * selectedNPC.tipModifier * wealthMultiplier);
        
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
                        isHungry: Math.random() > 0.5
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
        
        const grandTotal = totalProfit + totalTips - eventCosts;
        
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
            itemSalesList += `Grand Total: ${grandTotal}c\n`;
            
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
            embed.addFields({
                name: '📜 Detailed Report',
                value: `\`\`\`\n${itemSalesList}\`\`\``,
                inline: false
            });

            await channel.send({ embeds: [embed] });
        }
        
        // Clear the sales log and events after distribution
        await InnSalesLog.clearSalesLog(channel);
        dbEntry.gameData.events = [];
        
        console.log(`[InnKeeper] Distributed ${grandTotal} coins among ${payouts.length} workers`);
        
    } catch (error) {
        console.error('[InnKeeper] Error distributing profits:', error);
    }
}

module.exports = async (channel, dbEntry, json) => {
    const now = Date.now(); // current timestamp in milliseconds

    // Initialize gameData with sales array and gamemode identifier if it doesn't exist
    if (!dbEntry.gameData) {
        dbEntry.gameData = {
            gamemode: 'innkeeper', // Identifier for this game mode
            sales: [], // Array to store sales records
            events: [], // Array to store events (bar fights, etc.)
            lastProfitDistribution: new Date(), // Track when profits were last distributed
            lastNPCSale: new Date(), // Track last NPC sale
            lastEvent: new Date() // Track last event
        };
    } else {
        // Ensure gamemode is set
        if (!dbEntry.gameData.gamemode) {
            dbEntry.gameData.gamemode = 'innkeeper';
        }
        // Ensure sales array exists
        if (!dbEntry.gameData.sales) {
            dbEntry.gameData.sales = [];
        }
        // Ensure events array exists
        if (!dbEntry.gameData.events) {
            dbEntry.gameData.events = [];
        }
        // Ensure lastProfitDistribution exists
        if (!dbEntry.gameData.lastProfitDistribution) {
            dbEntry.gameData.lastProfitDistribution = new Date();
        }
        // Initialize lastNPCSale if not exists
        if (!dbEntry.gameData.lastNPCSale) {
            dbEntry.gameData.lastNPCSale = new Date(now - 5 * 60 * 1000); // 5 minutes ago
        }
        // Initialize lastEvent if not exists
        if (!dbEntry.gameData.lastEvent) {
            dbEntry.gameData.lastEvent = new Date(now - 10 * 60 * 1000); // 10 minutes ago
        }
    }

    // Check for NPC customer sales (20% chance every minute after 3 minute cooldown)
    const lastNPCSale = new Date(dbEntry.gameData.lastNPCSale).getTime();
    const npcCooldown = 3 * 60 * 1000; // 3 minutes
    
    if (now - lastNPCSale >= npcCooldown && Math.random() < 0.20) {
        const npcSale = await generateNPCSale(channel, dbEntry);
        if (npcSale) {
            dbEntry.gameData.lastNPCSale = new Date();
            dbEntry.markModified('gameData');
            await dbEntry.save();
            
            // Update the sales log with NPC info
            await InnSalesLog.updateWithNPCPurchase(channel, dbEntry, npcSale);
        }
    }

    // Check for random events (10% chance every 2 minutes)
    const lastEvent = new Date(dbEntry.gameData.lastEvent).getTime();
    const eventCooldown = 2 * 60 * 1000; // 2 minutes
    
    if (now - lastEvent >= eventCooldown && Math.random() < 0.10) {
        const eventType = Math.random();
        let event = null;
        
        if (eventType < 0.3) {
            // 30% chance for bar fight
            event = await generateBarFightEvent(channel, dbEntry);
        } else if (eventType < 0.6) {
            // 30% chance for finding coins
            event = await generateCoinFindEvent(channel, dbEntry);
        } else {
            // 40% chance for overhearing rumor
            event = await generateRumorEvent(channel, dbEntry);
        }
        
        if (event) {
            dbEntry.gameData.lastEvent = new Date();
            dbEntry.markModified('gameData');
            await dbEntry.save();
        }
    }

    // Check if 20 minutes have passed since last profit distribution
    const lastDistribution = new Date(dbEntry.gameData.lastProfitDistribution).getTime();
    const twentyMinutesInMs = 20 * 60 * 1000; // 20 minutes
    
    if (now - lastDistribution >= twentyMinutesInMs && dbEntry.gameData.sales.length > 0) {
        // Time to distribute profits!
        await distributeProfits(channel, dbEntry);
        
        // Update last distribution time
        dbEntry.gameData.lastProfitDistribution = new Date();
        
        // Clear sales data and events after distribution
        dbEntry.gameData.sales = [];
        dbEntry.gameData.events = [];
    }

    dbEntry.nextTrigger = new Date(now + 60 * 1000);
    
    // Mark gameData as modified since it's a Mixed type
    dbEntry.markModified('gameData');
    
    await dbEntry.save();

    // Send the event message
    if (channel && channel.isTextBased()) {
        generateShop(channel);
        
        // Debug: Log current sales count (optional)
        console.log(`[InnKeeper] Channel ${dbEntry.channelId} - Sales: ${dbEntry.gameData.sales.length}, Events: ${dbEntry.gameData.events.length}`);
    }
   
};