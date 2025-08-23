// innKeeping/innEventManager.js
// Centralized event generation for the inn system

const InnConfig = require('./innConfig');
const InnAIManager = require('./innAIManager');
const Money = require('../../../models/currency');
const getPlayerStats = require('../../calculatePlayerStat');
const gachaServers = require('../../../data/gachaServers.json');
const shops = require('../../../data/shops.json');
const itemSheet = require('../../../data/itemSheet.json');
const npcs = require('../../../data/npcs.json');

class InnEventManager {
    constructor() {
        this.config = InnConfig;
        this.aiManager = new InnAIManager();
    }

    /**
     * Main event generation method
     */
    async generateEvent(channel, dbEntry) {
        const now = Date.now();
        const gameData = dbEntry.gameData;
        
        // Determine if we're forcing an event
        const lastActivity = new Date(gameData.lastActivity || 0).getTime();
        const timeSinceLastActivity = now - lastActivity;
        const forceEvent = timeSinceLastActivity >= this.config.TIMING.ACTIVITY_GUARANTEE;
        
        // Try NPC sale first (highest priority)
        const npcSaleChance = forceEvent ? 
            this.config.EVENTS.NPC_SALE.FORCED_CHANCE : 
            this.config.EVENTS.NPC_SALE.BASE_CHANCE;
            
        if (Math.random() < npcSaleChance) {
            const npcSale = await this.generateNPCSale(channel, dbEntry);
            if (npcSale) return npcSale;
        }
        
        // Try random events
        const eventChance = forceEvent ? 
            this.config.EVENTS.RANDOM_EVENT.FORCED_CHANCE : 
            this.config.EVENTS.RANDOM_EVENT.BASE_CHANCE;
            
        if (Math.random() < eventChance) {
            const eventType = this.selectEventType();
            
            switch (eventType) {
                case 'barFight':
                    return await this.generateBarFight(channel, dbEntry);
                case 'rumor':
                    return await this.generateRumor(channel, dbEntry);
                case 'coinFind':
                    return await this.generateCoinFind(channel, dbEntry);
            }
        }
        
        // Fallback to innkeeper comment if forcing
        if (forceEvent && this.config.EVENTS.INNKEEPER_COMMENT.ENABLED) {
            return await this.generateInnkeeperComment(channel, dbEntry);
        }
        
        return null;
    }

    /**
     * Select event type based on distribution
     */
    selectEventType() {
        const rand = Math.random();
        const dist = this.config.EVENTS.RANDOM_EVENT.DISTRIBUTION;
        
        if (rand < dist.BAR_FIGHT) return 'barFight';
        if (rand < dist.BAR_FIGHT + dist.RUMOR) return 'rumor';
        return 'coinFind';
    }

    /**
     * Generate NPC sale
     */
    async generateNPCSale(channel, dbEntry) {
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
            
            // Generate dialogue
            const dialogue = await this.aiManager.generateNPCDialogue(
                selectedNPC,
                selectedItem,
                salePrice,
                { tip, mood: this.aiManager.determineMood(selectedNPC) }
            );
            
            // Create sale record
            const saleData = {
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
                saleData
            };
            
        } catch (error) {
            console.error('[InnEvents] Error generating NPC sale:', error);
            return null;
        }
    }

    /**
     * Select NPC based on channel power
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
                // NEW: Boost wealthy NPCs for power 4 establishments like Noble's Rest
                if (npc.wealth >= 6) weight *= 3;  // 3x weight for wealthy customers
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
        return weightedNPCs[Math.floor(Math.random() * weightedNPCs.length)];
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
        
        // Filter by budget (adjusted for Noble's Rest)
        let maxPrice;
        if (npc.budget === 'low') {
            maxPrice = 100;  // Increased from default
        } else if (npc.budget === 'medium') {
            maxPrice = 400;  // Increased from default
        } else {
            maxPrice = 10000;  // High budget
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
     * Generate bar fight event
     */
    async generateBarFight(channel, dbEntry) {
        try {
            const fights = this.config.BAR_FIGHTS;
            const fight = fights[Math.floor(Math.random() * fights.length)];
            
            // Verify NPCs exist and meet power requirements
            const npc1 = npcs.find(n => n.name === fight.npc1);
            const npc2 = npcs.find(n => n.name === fight.npc2);
            
            if (!npc1 || !npc2) return null;
            
            const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
            const channelPower = serverData?.power || 1;
            
            if ((npc1.minChannelPower && npc1.minChannelPower > channelPower) ||
                (npc2.minChannelPower && npc2.minChannelPower > channelPower)) {
                return null;
            }
            
            // Calculate damage cost
            const damageCost = Math.floor((npc1.wealth + npc2.wealth) * 2 + Math.random() * 10);
            
            // Generate outcome
            const outcome = await this.aiManager.generateEventDialogue('barFight', {
                npc1: npc1.name,
                npc2: npc2.name,
                reason: fight.reason
            });
            
            return {
                type: 'barfight',
                cost: damageCost,
                npc1: npc1.name,
                npc2: npc2.name,
                reason: fight.reason,
                outcome,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('[InnEvents] Error generating bar fight:', error);
            return null;
        }
    }

    /**
     * Generate rumor event
     */
    async generateRumor(channel, dbEntry) {
        try {
            // Select two random NPCs
            const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
            const channelPower = serverData?.power || 1;
            
            const eligibleNpcs = npcs.filter(npc => 
                !npc.minChannelPower || npc.minChannelPower <= channelPower
            );
            
            if (eligibleNpcs.length < 2) return null;
            
            const npc1 = eligibleNpcs[Math.floor(Math.random() * eligibleNpcs.length)];
            let npc2 = eligibleNpcs[Math.floor(Math.random() * eligibleNpcs.length)];
            while (npc2.id === npc1.id) {
                npc2 = eligibleNpcs[Math.floor(Math.random() * eligibleNpcs.length)];
            }
            
            // Generate rumor
            const rumor = await this.aiManager.generateEventDialogue('rumor', {
                npc1: npc1.name,
                npc2: npc2.name
            });
            
            return {
                type: 'rumor',
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
     * Generate coin find event
     */
    async generateCoinFind(channel, dbEntry) {
        try {
            const voiceChannel = channel.guild.channels.cache.get(channel.id);
            if (!voiceChannel || !voiceChannel.isVoiceBased()) return null;
            
            const membersInVC = Array.from(voiceChannel.members.values())
                .filter(member => !member.user.bot);
                
            if (membersInVC.length === 0) return null;
            
            // Select random member
            const luckyMember = membersInVC[Math.floor(Math.random() * membersInVC.length)];
            
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
            
            // Award coins
            await Money.findOneAndUpdate(
                { userId: luckyMember.id },
                { 
                    $inc: { money: totalAmount },
                    $set: { usertag: luckyMember.user.tag }
                },
                { upsert: true, new: true }
            );
            
            // Generate enhanced AI description with context
            let description;
            try {
                // Build context for AI generation
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
                    // Noble establishments
                    coinContext.locations = ['beneath a velvet cushion', 'in the chandelier', 'behind the wine rack', 
                                            'under the marble floor tile', 'in the coat check room'];
                } else if (channelPower >= 2) {
                    // Mid-tier establishments
                    coinContext.locations = ['under the barstool', 'in the fireplace ash', 'behind the beer kegs',
                                            'in a booth cushion', 'near the dartboard'];
                } else {
                    // Basic establishments
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
                    description = selectedFind.description;
                }
            }
            
            // Log the find for debugging
            console.log(`[InnEvents] Coin find at ${innName} (Power ${channelPower}): ${luckyMember.user.username} found ${totalAmount} coins (base: ${baseAmount}, luck bonus: ${luckBonus})`);
            
            return {
                type: 'coinFind',
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
     * Generate innkeeper comment
     */
    async generateInnkeeperComment(channel, dbEntry) {
        try {
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
            
            // Generate comment
            const comment = await this.aiManager.generateEventDialogue('innkeeperComment', {
                businessLevel,
                innkeeperName
            });
            
            return {
                type: 'innkeeperComment',
                comment: `${innkeeperName} ${comment}`,
                businessLevel,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('[InnEvents] Error generating innkeeper comment:', error);
            return null;
        }
    }
}

module.exports = InnEventManager;
