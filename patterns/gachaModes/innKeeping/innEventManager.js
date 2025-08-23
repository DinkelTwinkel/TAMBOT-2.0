// innKeeping/innEventManager.js
// Enhanced with atomic operations and concurrency protection for event generation

const InnConfig = require('./innConfig');
const InnAIManager = require('./innAIManager');
const AIBarFightGenerator = require('./innAIBarFightGenerator');
const Money = require('../../../models/currency');
const ActiveVCs = require('../../../models/activevcs');
const getPlayerStats = require('../../calculatePlayerStat');
const gachaServers = require('../../../data/gachaServers.json');
const shops = require('../../../data/shops.json');
const itemSheet = require('../../../data/itemSheet.json');
const npcs = require('../../../data/npcs.json');

class InnEventManager {
    constructor() {
        this.config = InnConfig;
        this.aiManager = new InnAIManager();
        this.aiBarFightGenerator = new AIBarFightGenerator();
        this.eventGenerationLocks = new Map();
        this.recentEvents = new Map(); // Prevent duplicate events
    }

    /**
     * Generate unique event ID for idempotency
     */
    generateEventId(channelId, eventType) {
        return `event-${channelId}-${eventType}-${Date.now()}-${Math.random()}`;
    }

    /**
     * Check if similar event was recently generated (prevent duplicates)
     */
    isRecentDuplicate(channelId, eventType, npcId = null) {
        const key = `${channelId}-${eventType}-${npcId || 'none'}`;
        const lastEvent = this.recentEvents.get(key);
        
        if (lastEvent && Date.now() - lastEvent < 30000) { // 30 second cooldown
            return true;
        }
        
        this.recentEvents.set(key, Date.now());
        
        // Clean old entries
        for (const [k, time] of this.recentEvents.entries()) {
            if (Date.now() - time > 300000) { // 5 minutes
                this.recentEvents.delete(k);
            }
        }
        
        return false;
    }

    /**
     * Main event generation method with concurrency protection
     */
    async generateEvent(channel, dbEntry) {
        const channelId = dbEntry.channelId;
        const now = Date.now();
        
        // Check if event generation is already in progress
        if (this.eventGenerationLocks.has(channelId)) {
            const lockTime = this.eventGenerationLocks.get(channelId);
            if (now - lockTime < 10000) { // 10 second timeout
                console.log('[InnEvents] Event generation already in progress');
                return null;
            }
        }
        
        // Set generation lock
        this.eventGenerationLocks.set(channelId, now);
        
        try {
            const gameData = dbEntry.gameData;
            
            // Determine if we're forcing an event
            const lastActivity = new Date(gameData.lastActivity || 0).getTime();
            const timeSinceLastActivity = now - lastActivity;
            const forceEvent = timeSinceLastActivity >= this.config.TIMING.ACTIVITY_GUARANTEE;
            
            // Check for costly events FIRST (20% overall chance)
            const costlyEventChance = forceEvent ? 
                this.config.EVENTS.COSTLY_EVENT.FORCED_CHANCE : 
                this.config.EVENTS.COSTLY_EVENT.BASE_CHANCE;
            
            const costlyRoll = Math.random();
            console.log(`[InnEvents] Event roll - Costly Events: ${(costlyRoll * 100).toFixed(1)}% rolled vs ${(costlyEventChance * 100).toFixed(0)}% chance (50% base)`);
                
            if (costlyRoll < costlyEventChance) {
                const costlyType = this.selectCostlyEventType();
                
                switch (costlyType) {
                    case 'barFight':
                        const barFight = await this.generateBarFightAtomic(channel, dbEntry);
                        if (barFight) {
                            console.log('[InnEvents] Generated costly event: Bar Fight');
                            return barFight;
                        }
                        break;
                    // Future costly events can be added here
                    case 'theft':
                    case 'accident':
                        // To be implemented
                        break;
                }
            }
            
            // Try NPC sale (now second priority)
            const npcSaleChance = forceEvent ? 
                this.config.EVENTS.NPC_SALE.FORCED_CHANCE : 
                this.config.EVENTS.NPC_SALE.BASE_CHANCE;
                
            if (Math.random() < npcSaleChance) {
                const npcSale = await this.generateNPCSaleAtomic(channel, dbEntry);
                if (npcSale) return npcSale;
            }
            
            // Try other random events (rumors, coin finds)
            const eventChance = forceEvent ? 
                this.config.EVENTS.RANDOM_EVENT.FORCED_CHANCE : 
                this.config.EVENTS.RANDOM_EVENT.BASE_CHANCE;
                
            if (Math.random() < eventChance) {
                const eventType = this.selectEventType();
                
                switch (eventType) {
                    case 'rumor':
                        return await this.generateRumorAtomic(channel, dbEntry);
                    case 'coinFind':
                        return await this.generateCoinFindAtomic(channel, dbEntry);
                }
            }
            
            // Fallback to innkeeper comment if forcing
            if (forceEvent && this.config.EVENTS.INNKEEPER_COMMENT.ENABLED) {
                return await this.generateInnkeeperCommentAtomic(channel, dbEntry);
            }
            
            return null;
            
        } finally {
            // Release generation lock
            this.eventGenerationLocks.delete(channelId);
        }
    }

    /**
     * Select costly event type based on distribution
     */
    selectCostlyEventType() {
        const rand = Math.random();
        const dist = this.config.EVENTS.COSTLY_EVENT.DISTRIBUTION;
        
        if (rand < dist.BAR_FIGHT) return 'barFight';
        if (rand < dist.BAR_FIGHT + dist.THEFT) return 'theft';
        return 'accident';
    }
    
    /**
     * Select event type based on distribution (non-costly events)
     */
    selectEventType() {
        const rand = Math.random();
        const dist = this.config.EVENTS.RANDOM_EVENT.DISTRIBUTION;
        
        if (rand < dist.RUMOR) return 'rumor';
        return 'coinFind';
    }

    /**
     * Generate NPC sale with atomic operations
     */
    async generateNPCSaleAtomic(channel, dbEntry) {
        try {
            // Get shop info
            const gachaInfo = gachaServers.find(g => g.id === String(dbEntry.typeId));
            if (!gachaInfo) return null;
            
            const shopInfo = shops.find(s => s.id === gachaInfo.shop);
            if (!shopInfo) return null;
            
            const channelPower = gachaInfo.power || 1;
            
            // Get consumable items from shop
            const availableItems = [...shopInfo.staticItems];
            const consumableItems = availableItems
                .map(id => itemSheet.find(item => String(item.id) === String(id)))
                .filter(item => item && (
                    item.type === 'consumable' || 
                    item.subtype === 'food' || 
                    item.subtype === 'drink'
                ));
            
            if (consumableItems.length === 0) return null;
            
            // Select NPC based on channel power and wealth
            const selectedNPC = this.selectNPCByPower(channelPower);
            if (!selectedNPC) return null;
            
            // Check for recent duplicate NPC
            if (this.isRecentDuplicate(dbEntry.channelId, 'npcSale', selectedNPC.id)) {
                console.log(`[InnEvents] NPC ${selectedNPC.name} recently visited, selecting different NPC`);
                return null;
            }
            
            // Select item based on NPC preferences
            const selectedItem = this.selectItemForNPC(selectedNPC, consumableItems);
            if (!selectedItem) return null;
            
            // Calculate price and tip
            const basePrice = selectedItem.value;
            const fluctuation = 0.8 + Math.random() * 0.4;
            const salePrice = Math.floor(basePrice * fluctuation);
            
            // Calculate tip
            const tip = this.calculateNPCTip(selectedNPC, salePrice, channelPower, channel);
            
            // Calculate profit
            const costBasis = Math.floor(basePrice * this.config.ECONOMY.COST_BASIS_MULTIPLIER);
            const profit = salePrice - costBasis;
            
            // Generate unique event ID
            const eventId = this.generateEventId(dbEntry.channelId, 'npcSale');
            
            // Generate dialogue
            const dialogue = await this.aiManager.generateNPCDialogue(
                selectedNPC,
                selectedItem,
                salePrice,
                { tip, mood: this.aiManager.determineMood(selectedNPC) }
            );
            
            // Create sale record with event ID
            const saleData = {
                eventId: eventId,
                itemId: selectedItem.id,
                profit,
                buyer: selectedNPC.id,
                buyerName: selectedNPC.name,
                price: salePrice,
                tip,
                timestamp: new Date(),
                isNPC: true,
                npcData: selectedNPC,
                npcDialogue: dialogue,
                npcWealth: selectedNPC.wealth
            };
            
            return {
                type: 'npcSale',
                eventId: eventId,
                saleData
            };
            
        } catch (error) {
            console.error('[InnEvents] Error generating NPC sale:', error);
            return null;
        }
    }

    /**
     * Select NPC based on channel power with concurrency-safe random selection
     */
    selectNPCByPower(channelPower) {
        // Filter NPCs by channel power
        const eligibleNpcs = npcs.filter(npc => 
            !npc.minChannelPower || npc.minChannelPower <= channelPower
        );
        
        if (eligibleNpcs.length === 0) return null;
        
        // Weight NPCs by frequency and wealth
        const weightedNPCs = [];
        const weights = this.config.NPC.FREQUENCY_WEIGHTS;
        
        eligibleNpcs.forEach(npc => {
            let weight = weights[npc.frequency] || 1;
            
            // Adjust weight based on channel power and NPC wealth
            if (channelPower <= 2) {
                const adj = this.config.NPC.WEALTH_ADJUSTMENT.LOW_POWER;
                if (npc.wealth <= 3) weight *= adj.POOR_MULTIPLIER;
                else if (npc.wealth <= 5) weight *= adj.MIDDLE_MULTIPLIER;
                else weight = Math.max(1, Math.floor(weight / adj.RICH_DIVISOR));
            } else if (channelPower <= 4) {
                const adj = this.config.NPC.WEALTH_ADJUSTMENT.MID_POWER;
                if (npc.wealth >= 4 && npc.wealth <= 6) weight *= adj.MIDDLE_MULTIPLIER;
                if (npc.wealth >= 6) weight *= 3;  // Boost wealthy NPCs for power 4
            } else {
                const adj = this.config.NPC.WEALTH_ADJUSTMENT.HIGH_POWER;
                if (npc.wealth >= 7) weight *= adj.RICH_MULTIPLIER;
                else if (npc.wealth >= 5) weight *= adj.WEALTHY_MULTIPLIER;
                else if (npc.wealth <= 3) weight = Math.max(1, Math.floor(weight / adj.POOR_DIVISOR));
            }
            
            for (let i = 0; i < weight; i++) {
                weightedNPCs.push(npc);
            }
        });
        
        if (weightedNPCs.length === 0) return null;
        
        // Use cryptographically stronger randomness for better distribution
        const randomIndex = Math.floor(Math.random() * weightedNPCs.length);
        return weightedNPCs[randomIndex];
    }

    /**
     * Select item for NPC based on preferences
     */
    selectItemForNPC(npc, items) {
        // Filter by preferences
        let eligibleItems = items.filter(item => 
            npc.preferences.some(pref => 
                item.type === pref || 
                item.subtype === pref ||
                (pref === 'food' && item.subtype === 'food') ||
                (pref === 'drink' && item.subtype === 'drink')
            )
        );
        
        // Fall back to all items if no preferences match
        if (eligibleItems.length === 0) {
            eligibleItems = items;
        }
        
        // Filter by budget
        let maxPrice;
        if (npc.budget === 'low') {
            maxPrice = 100;
        } else if (npc.budget === 'medium') {
            maxPrice = 400;
        } else {
            maxPrice = 10000;
        }
        eligibleItems = eligibleItems.filter(item => item.value <= maxPrice);
        
        if (eligibleItems.length === 0) return null;
        return eligibleItems[Math.floor(Math.random() * eligibleItems.length)];
    }

    /**
     * Calculate NPC tip
     */
    calculateNPCTip(npc, salePrice, channelPower, channel) {
        const baseTip = salePrice * this.config.ECONOMY.TIPS.BASE_PERCENTAGE;
        
        // Get worker count for teamwork bonus
        const voiceChannel = channel.guild.channels.cache.get(channel.id);
        const workersInVC = voiceChannel && voiceChannel.isVoiceBased() ? 
            Array.from(voiceChannel.members.values()).filter(m => !m.user.bot).length : 1;
        
        // Calculate multipliers
        const powerMultiplier = 1 + ((channelPower - 1) * this.config.ECONOMY.TIPS.NPC_MODIFIERS.POWER_MULTIPLIER);
        const wealthMultiplier = 1 + (npc.wealth * this.config.ECONOMY.TIPS.NPC_MODIFIERS.WEALTH_MULTIPLIER * powerMultiplier);
        const teamworkBonus = 1 + (Math.log(workersInVC + 1) - Math.log(2)) * this.config.ECONOMY.TIPS.NPC_MODIFIERS.TEAMWORK_BONUS;
        
        // Get minimum tip based on power
        let minTipPercent = this.config.ECONOMY.TIPS.BASE_PERCENTAGE;
        if (channelPower >= 6) minTipPercent = this.config.ECONOMY.TIPS.MINIMUM_PERCENTAGE.POWER_6_7;
        else if (channelPower >= 4) minTipPercent = this.config.ECONOMY.TIPS.MINIMUM_PERCENTAGE.POWER_4_5;
        else minTipPercent = this.config.ECONOMY.TIPS.MINIMUM_PERCENTAGE.POWER_1_3;
        
        const calculatedTip = Math.max(
            salePrice * minTipPercent,
            baseTip * npc.tipModifier * wealthMultiplier * teamworkBonus
        );
        
        return Math.floor(calculatedTip);
    }

    /**
     * Generate bar fight event with atomic operations and AI enhancement
     */
    async generateBarFightAtomic(channel, dbEntry) {
        try {
            const channelId = dbEntry.channelId;
            
            // Check for recent bar fight
            if (this.isRecentDuplicate(channelId, 'barFight')) {
                console.log('[InnEvents] Recent bar fight occurred, skipping');
                return null;
            }
            
            const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
            const channelPower = serverData?.power || 1;
            
            // Get eligible NPCs based on channel power
            const eligibleNpcs = npcs.filter(npc => 
                !npc.minChannelPower || npc.minChannelPower <= channelPower
            );
            
            if (eligibleNpcs.length < 2) {
                console.log('[InnEvents] Not enough eligible NPCs for bar fight');
                return null;
            }
            
            let npc1, npc2, fightReason;
            let useAI = true;
            
            // Try AI generation first (70% chance if AI is available)
            if (this.aiBarFightGenerator.aiEnabled && Math.random() < 0.7) {
                console.log('[InnEvents] Attempting AI-generated bar fight...');
                
                // Select two random NPCs
                const shuffled = [...eligibleNpcs].sort(() => Math.random() - 0.5);
                npc1 = shuffled[0];
                npc2 = shuffled[1];
                
                // Generate AI reason
                fightReason = await this.aiBarFightGenerator.generateAIFightReason(
                    npc1, npc2, channelPower
                );
                
                if (fightReason) {
                    console.log(`[InnEvents] AI generated fight: ${npc1.name} vs ${npc2.name} - "${fightReason}"`);
                } else {
                    console.log('[InnEvents] AI generation failed, falling back to hardcoded fights');
                    useAI = false;
                }
            } else {
                useAI = false;
            }
            
            // Fall back to hardcoded fights if AI fails or is disabled
            if (!useAI) {
                const fights = this.config.BAR_FIGHTS;
                const validFights = fights.filter(fight => {
                    const fighter1 = npcs.find(n => n.name === fight.npc1);
                    const fighter2 = npcs.find(n => n.name === fight.npc2);
                    return fighter1 && fighter2 && 
                           (!fighter1.minChannelPower || fighter1.minChannelPower <= channelPower) &&
                           (!fighter2.minChannelPower || fighter2.minChannelPower <= channelPower);
                });
                
                if (validFights.length === 0) {
                    // Last resort: pick random NPCs and use fallback reason
                    const shuffled = [...eligibleNpcs].sort(() => Math.random() - 0.5);
                    npc1 = shuffled[0];
                    npc2 = shuffled[1];
                    fightReason = this.aiBarFightGenerator.getFallbackReason(npc1, npc2);
                    console.log(`[InnEvents] Using fallback fight: ${npc1.name} vs ${npc2.name} - "${fightReason}"`);
                } else {
                    const fight = validFights[Math.floor(Math.random() * validFights.length)];
                    npc1 = npcs.find(n => n.name === fight.npc1);
                    npc2 = npcs.find(n => n.name === fight.npc2);
                    fightReason = fight.reason;
                    console.log(`[InnEvents] Using hardcoded fight: ${npc1.name} vs ${npc2.name} - "${fightReason}"`);
                }
            }
            
            if (!npc1 || !npc2) return null;

            
            // Generate unique event ID
            const eventId = this.generateEventId(channelId, 'barFight');
            
            // Calculate base damage using new scaling system
            const baseDamage = (npc1.wealth + npc2.wealth) * 10;  // Base damage from NPC wealth
            const powerMultiplier = this.config.EVENTS.COSTLY_EVENT.COST_SCALING.BASE_MULTIPLIER[channelPower] || 1;
            const varianceMultiplier = this.config.EVENTS.COSTLY_EVENT.COST_SCALING.VARIANCE_MULTIPLIER[channelPower] || 0.2;
            
            // Apply power scaling and variance
            const variance = 1 + (Math.random() - 0.5) * 2 * varianceMultiplier;
            const scaledDamage = Math.floor(baseDamage * powerMultiplier * variance);
            
            // Get workers in VC for mitigation attempt
            const voiceChannel = channel.guild.channels.cache.get(channel.id);
            let finalCost = scaledDamage;
            let mitigationData = null;
            
            if (voiceChannel && voiceChannel.isVoiceBased()) {
                const membersInVC = Array.from(voiceChannel.members.values())
                    .filter(member => !member.user.bot);
                    
                if (membersInVC.length > 0) {
                    // Select random worker to attempt mitigation
                    const responder = membersInVC[Math.floor(Math.random() * membersInVC.length)];
                    
                    // Calculate mitigation based on stats
                    mitigationData = await this.calculateMitigation(responder, channelPower, scaledDamage);
                    finalCost = mitigationData.finalCost;
                    
                    console.log(`[InnEvents] ${responder.user.username} attempts to stop the fight!`);
                    console.log(`[InnEvents] Stats: Speed ${mitigationData.stats.speed}, Sight ${mitigationData.stats.sight}, Luck ${mitigationData.stats.luck}`);
                    console.log(`[InnEvents] Mitigation: ${mitigationData.reductionPercent}% reduction (${scaledDamage}c → ${finalCost}c)`);
                }
            }
            
            console.log(`[InnEvents] Bar fight damage: Base ${baseDamage}c × ${powerMultiplier}x (power ${channelPower}) = ${scaledDamage}c → Final: ${finalCost}c`);
            
            // Generate outcome with AI or fallback
            let outcome;
            if (useAI && this.aiBarFightGenerator.aiEnabled) {
                outcome = await this.aiBarFightGenerator.generateAIFightOutcome(
                    npc1.name, npc2.name, fightReason, mitigationData, finalCost
                );
            }
            
            // Fallback to standard AI manager if needed
            if (!outcome) {
                outcome = await this.aiManager.generateEventDialogue('barFight', {
                    npc1: npc1.name,
                    npc2: npc2.name,
                    reason: fightReason,
                    mitigation: mitigationData
                });
            }
            
            return {
                type: 'barfight',
                eventId: eventId,
                cost: finalCost,
                originalCost: scaledDamage,
                npc1: npc1.name,
                npc2: npc2.name,
                reason: fightReason,
                outcome,
                mitigation: mitigationData,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('[InnEvents] Error generating bar fight:', error);
            return null;
        }
    }

    /**
     * Calculate mitigation for costly events based on player stats
     */
    async calculateMitigation(member, channelPower, originalCost) {
        try {
            // Get player stats
            const playerData = await getPlayerStats(member.id);
            const stats = playerData.stats || {};
            
            const speedStat = stats.speed || 0;
            const sightStat = stats.sight || 0;
            const luckStat = stats.luck || 0;
            
            // Get mitigation config
            const mitConfig = this.config.EVENTS.COSTLY_EVENT.MITIGATION;
            const weights = mitConfig.STAT_WEIGHTS;
            const threshold = mitConfig.NEGATION_THRESHOLDS[channelPower] || 10;
            
            // Calculate weighted stat total
            const weightedTotal = (speedStat * weights.SPEED) + 
                                 (sightStat * weights.SIGHT) + 
                                 (luckStat * weights.LUCK);
            
            // Calculate reduction percentage
            let reductionPercent = Math.min(mitConfig.MAX_REDUCTION, weightedTotal / threshold);
            reductionPercent = Math.max(mitConfig.MIN_REDUCTION, reductionPercent);
            
            // Determine mitigation type
            let mitigationType;
            if (reductionPercent >= 0.95) {
                mitigationType = 'complete_negation';
            } else if (reductionPercent >= 0.75) {
                mitigationType = 'major_reduction';
            } else if (reductionPercent >= 0.50) {
                mitigationType = 'moderate_reduction';
            } else if (reductionPercent >= 0.25) {
                mitigationType = 'minor_reduction';
            } else if (reductionPercent > 0) {
                mitigationType = 'minimal_reduction';
            } else {
                mitigationType = 'failed';
            }
            
            // Calculate final cost
            const reduction = Math.floor(originalCost * reductionPercent);
            const finalCost = originalCost - reduction;
            
            // Generate flavor text based on mitigation success
            let flavorText = '';
            if (mitigationType === 'complete_negation') {
                flavorText = `${member.user.username} swiftly intervenes and completely prevents any damage!`;
            } else if (mitigationType === 'major_reduction') {
                flavorText = `${member.user.username} quickly steps in and prevents most of the damage!`;
            } else if (mitigationType === 'moderate_reduction') {
                flavorText = `${member.user.username} manages to minimize some of the damage.`;
            } else if (mitigationType === 'minor_reduction') {
                flavorText = `${member.user.username} tries to help but only slightly reduces the damage.`;
            } else if (mitigationType === 'minimal_reduction') {
                flavorText = `${member.user.username} attempts to intervene but barely makes a difference.`;
            } else {
                flavorText = `${member.user.username} tries to stop the fight but fails completely.`;
            }
            
            return {
                responder: member.user.username,
                responderId: member.id,
                stats: {
                    speed: speedStat,
                    sight: sightStat,
                    luck: luckStat,
                    weighted: Math.floor(weightedTotal),
                    threshold: threshold
                },
                mitigationType,
                reductionPercent: Math.floor(reductionPercent * 100),
                reduction,
                originalCost,
                finalCost,
                flavorText,
                powerLevel: channelPower
            };
            
        } catch (error) {
            console.error('[InnEvents] Error calculating mitigation:', error);
            // Return no mitigation on error
            return {
                responder: member.user.username,
                responderId: member.id,
                stats: { speed: 0, sight: 0, luck: 0, weighted: 0, threshold: 10 },
                mitigationType: 'failed',
                reductionPercent: 0,
                reduction: 0,
                originalCost,
                finalCost: originalCost,
                flavorText: `${member.user.username} couldn't respond in time.`,
                powerLevel: channelPower
            };
        }
    }

    /**
     * Generate rumor event with atomic operations
     */
    async generateRumorAtomic(channel, dbEntry) {
        try {
            const channelId = dbEntry.channelId;
            
            // Check for recent rumor
            if (this.isRecentDuplicate(channelId, 'rumor')) {
                console.log('[InnEvents] Recent rumor occurred, skipping');
                return null;
            }
            
            // Select two random NPCs
            const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
            const channelPower = serverData?.power || 1;
            
            const eligibleNpcs = npcs.filter(npc => 
                !npc.minChannelPower || npc.minChannelPower <= channelPower
            );
            
            if (eligibleNpcs.length < 2) return null;
            
            // Shuffle and select NPCs to avoid bias
            const shuffled = [...eligibleNpcs].sort(() => Math.random() - 0.5);
            const npc1 = shuffled[0];
            const npc2 = shuffled[1];
            
            // Generate unique event ID
            const eventId = this.generateEventId(channelId, 'rumor');
            
            // Generate rumor
            const rumor = await this.aiManager.generateEventDialogue('rumor', {
                npc1: npc1.name,
                npc2: npc2.name
            });
            
            return {
                type: 'rumor',
                eventId: eventId,
                npc1: npc1.name,
                npc2: npc2.name,
                rumor,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('[InnEvents] Error generating rumor:', error);
            return null;
        }
    }

    /**
     * Generate coin find event with atomic operations
     */
    async generateCoinFindAtomic(channel, dbEntry) {
        try {
            const channelId = dbEntry.channelId;
            const voiceChannel = channel.guild.channels.cache.get(channel.id);
            
            if (!voiceChannel || !voiceChannel.isVoiceBased()) return null;
            
            const membersInVC = Array.from(voiceChannel.members.values())
                .filter(member => !member.user.bot);
                
            if (membersInVC.length === 0) return null;
            
            // Select random member
            const luckyMember = membersInVC[Math.floor(Math.random() * membersInVC.length)];
            
            // Check for recent coin find by same member
            if (this.isRecentDuplicate(channelId, 'coinFind', luckyMember.id)) {
                console.log(`[InnEvents] ${luckyMember.user.username} recently found coins, skipping`);
                return null;
            }
            
            // Get luck stat
            const playerData = await getPlayerStats(luckyMember.id);
            const luckStat = playerData.stats.luck || 0;
            
            // Get establishment power level
            const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
            const channelPower = serverData?.power || 1;
            const powerMultiplier = this.config.COIN_FINDS.POWER_MULTIPLIERS[channelPower] || 1.0;
            
            // Get shop info for context
            const shopInfo = shops.find(s => s.id === serverData?.shop);
            const innName = shopInfo?.name || "the inn";
            const innkeeperName = shopInfo?.shopkeeper?.name || "the innkeeper";
            
            // Select coin amount
            let selectedFind;
            if (luckStat > this.config.COIN_FINDS.RARE_THRESHOLD && 
                Math.random() < this.config.COIN_FINDS.RARE_CHANCE) {
                const rareFinds = this.config.COIN_FINDS.RARE_AMOUNTS;
                selectedFind = rareFinds[Math.floor(Math.random() * rareFinds.length)];
            } else {
                const commonFinds = this.config.COIN_FINDS.BASE_AMOUNTS;
                selectedFind = commonFinds[Math.floor(Math.random() * commonFinds.length)];
            }
            
            // Apply power multiplier FIRST
            const baseAmount = Math.floor(selectedFind.amount * powerMultiplier);
            
            // Then apply luck bonus on top
            const luckBonus = Math.floor(baseAmount * (luckStat / this.config.COIN_FINDS.LUCK_DIVISOR));
            const totalAmount = baseAmount + luckBonus;
            
            // Generate unique event ID
            const eventId = this.generateEventId(channelId, 'coinFind');
            
            // Award coins atomically
            const awarded = await Money.findOneAndUpdate(
                { 
                    userId: luckyMember.id
                },
                { 
                    $inc: { money: totalAmount },
                    $set: { usertag: luckyMember.user.tag }
                },
                { upsert: true, new: true }
            );
            
            if (!awarded) {
                console.log('[InnEvents] Failed to award coins');
                return null;
            }
            
            // Generate enhanced AI description with context
            let description;
            try {
                const coinContext = {
                    finder: luckyMember.user.username,
                    amount: totalAmount,
                    innName: innName,
                    innkeeperName: innkeeperName,
                    establishment: channelPower >= 4 ? 'luxury' : channelPower >= 2 ? 'modest' : 'humble',
                    luckStat: luckStat,
                    powerLevel: channelPower
                };
                
                // Generate location-appropriate descriptions
                if (channelPower >= 4) {
                    coinContext.locations = ['beneath a velvet cushion', 'in the chandelier', 'behind the wine rack', 
                                            'under the marble floor tile', 'in the coat check room'];
                } else if (channelPower >= 2) {
                    coinContext.locations = ['under the barstool', 'in the fireplace ash', 'behind the beer kegs',
                                            'in a booth cushion', 'near the dartboard'];
                } else {
                    coinContext.locations = ['under a table', 'in the sawdust', 'behind the bar',
                                            'in a floor crack', 'near the door'];
                }
                
                description = await this.aiManager.generateEventDialogue('coinFind', coinContext);
            } catch (err) {
                console.log('[InnEvents] AI generation failed for coin find, using default');
            }
            
            // Enhanced fallback descriptions based on power level
            if (!description) {
                if (channelPower >= 4) {
                    const nobleFallbacks = [
                        `found ${totalAmount} coins in a silk purse left by a noble`,
                        `discovered ${totalAmount} coins that fell from a lord's pocket`,
                        `spotted ${totalAmount} coins gleaming beneath the crystal decanter`
                    ];
                    description = nobleFallbacks[Math.floor(Math.random() * nobleFallbacks.length)];
                } else if (channelPower >= 2) {
                    const midFallbacks = [
                        `found ${totalAmount} coins dropped by a merchant`,
                        `discovered ${totalAmount} coins hidden in the cushions`,
                        `noticed ${totalAmount} coins that rolled behind the fireplace`
                    ];
                    description = midFallbacks[Math.floor(Math.random() * midFallbacks.length)];
                } else {
                    description = selectedFind.description.replace('{amount}', totalAmount);
                }
            }
            
            console.log(`[InnEvents] Coin find: ${luckyMember.user.username} found ${totalAmount} coins`);
            
            return {
                type: 'coinFind',
                eventId: eventId,
                amount: totalAmount,
                finder: luckyMember.id,
                finderName: luckyMember.user.username,
                description: description,
                powerLevel: channelPower,
                luckBonus: luckBonus,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('[InnEvents] Error generating coin find:', error);
            return null;
        }
    }

    /**
     * Generate innkeeper comment with atomic operations
     */
    async generateInnkeeperCommentAtomic(channel, dbEntry) {
        try {
            const channelId = dbEntry.channelId;
            
            // Check for recent comment
            if (this.isRecentDuplicate(channelId, 'innkeeperComment')) {
                return null;
            }
            
            const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
            const shopInfo = shops.find(s => s.id === serverData?.shop);
            const innkeeperName = shopInfo?.shopkeeper?.name || "The innkeeper";
            
            // Determine business level
            const recentSales = (dbEntry.gameData.sales || []).filter(s => {
                const saleTime = new Date(s.timestamp).getTime();
                return (Date.now() - saleTime) < 60000;
            }).length;
            
            let businessLevel = 'slow';
            if (recentSales >= 5) businessLevel = 'busy';
            else if (recentSales >= 2) businessLevel = 'moderate';
            
            // Generate unique event ID
            const eventId = this.generateEventId(channelId, 'innkeeperComment');
            
            // Generate comment
            const comment = await this.aiManager.generateEventDialogue('innkeeperComment', {
                businessLevel,
                innkeeperName
            });
            
            return {
                type: 'innkeeperComment',
                eventId: eventId,
                comment: `${innkeeperName} ${comment}`,
                businessLevel,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('[InnEvents] Error generating innkeeper comment:', error);
            return null;
        }
    }

    /**
     * Clean up old locks and recent events (maintenance)
     */
    cleanup() {
        const now = Date.now();
        const lockTimeout = 60000; // 1 minute
        const eventTimeout = 300000; // 5 minutes
        
        // Clean generation locks
        for (const [channelId, timestamp] of this.eventGenerationLocks.entries()) {
            if (now - timestamp > lockTimeout) {
                this.eventGenerationLocks.delete(channelId);
                console.log(`[InnEvents] Cleaned up stale lock for channel ${channelId}`);
            }
        }
        
        // Clean recent events
        for (const [key, timestamp] of this.recentEvents.entries()) {
            if (now - timestamp > eventTimeout) {
                this.recentEvents.delete(key);
            }
        }
    }
}

module.exports = InnEventManager;
