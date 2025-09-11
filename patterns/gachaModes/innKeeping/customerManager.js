// Customer Management System for Inn Keeper V4
const npcsData = require('../../../data/npcs.json');
const gachaServersData = require('../../../data/gachaServers.json');
const ActiveVCs = require('../../../models/activevcs');

class CustomerManager {
    /**
     * Get maximum customers for inn based on chair count + 5
     * This is now calculated dynamically based on actual chair count in the inn layout
     */
    static getInnMaxCustomers(chairCount = 0) {
        // Customer limit is chair count + 5 (some customers can stand or wait)
        return Math.max(5, chairCount + 5); // Minimum of 5 customers even with no chairs
    }

    /**
     * Create a new customer from NPC data
     */
    static createCustomer(channelId, now, innReputation = 50, innLevel = 1, baseEarnings = 5) {
        // Select random NPC with seeded randomness
        const channelSeed = parseInt(channelId.replace(/\D/g, '').slice(-8) || '12345678', 10);
        const timeSeed = Math.floor(now / 300000); // Change every 5 minutes
        const combinedSeed = channelSeed + timeSeed + Math.floor(Math.random() * 1000);
        
        const seededRandom = (seed) => {
            const x = Math.sin(seed) * 10000;
            return x - Math.floor(x);
        };
        
        const npcIndex = Math.floor(seededRandom(combinedSeed) * npcsData.length);
        const selectedNPC = npcsData[npcIndex];
        
        // Create customer with dynamic properties
        const customer = {
            id: `customer_${now}_${Math.floor(seededRandom(combinedSeed + 1) * 10000)}`,
            npcId: selectedNPC.id,
            name: selectedNPC.name,
            description: selectedNPC.description,
            avatar: selectedNPC.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png',
            preferences: selectedNPC.preferences || ['food', 'drink'],
            
            // Dynamic properties  
            happiness: Math.floor(seededRandom(combinedSeed + 2) * 40) + 30, // 30-70 starting happiness
            wealth: this.calculateCustomerWealth(selectedNPC.wealth || 3, innReputation, seededRandom(combinedSeed + 3), innLevel, baseEarnings),
            maxWealth: this.calculateCustomerWealth(selectedNPC.wealth || 3, innReputation, seededRandom(combinedSeed + 3), innLevel, baseEarnings),
            
            // Timing properties
            arrivedAt: now,
            lastOrderTime: 0,
            ordersPlaced: 0,
            ordersReceived: 0,
            
            // Current state
            hasActiveOrder: false,
            orderPlacedAt: null,
            orderItem: null,
            
            // Position in inn (will be set when rendering)
            position: null
        };
        
        console.log(`[CustomerManager] Created customer: ${customer.name} (Happiness: ${customer.happiness}, Wealth: ${customer.wealth})`);
        return customer;
    }

    /**
     * Calculate customer wealth based on inn reputation and level
     */
    static calculateCustomerWealth(baseWealth, innReputation, randomSeed, innLevel = 1, baseEarnings = 5) {
        // Higher reputation attracts wealthier customers
        // Reputation 0-20: 0.5x to 0.8x base wealth
        // Reputation 21-50: 0.8x to 1.0x base wealth  
        // Reputation 51-80: 1.0x to 1.5x base wealth
        // Reputation 81-100: 1.5x to 2.0x base wealth
        
        let wealthMultiplier;
        if (innReputation <= 20) {
            wealthMultiplier = 0.5 + (innReputation / 20) * 0.3; // 0.5 to 0.8
        } else if (innReputation <= 50) {
            wealthMultiplier = 0.8 + ((innReputation - 20) / 30) * 0.2; // 0.8 to 1.0
        } else if (innReputation <= 80) {
            wealthMultiplier = 1.0 + ((innReputation - 50) / 30) * 0.5; // 1.0 to 1.5
        } else {
            wealthMultiplier = 1.5 + ((innReputation - 80) / 20) * 0.5; // 1.5 to 2.0
        }
        
        // Add inn level bonus (each level increases wealth)
        const levelMultiplier = 1 + ((innLevel - 1) * 0.3); // +30% wealth per level above 1
        
        // Add some randomness to wealth within the reputation range
        const randomVariation = (randomSeed - 0.5) * 0.4; // ±0.2 variation
        wealthMultiplier = Math.max(0.3, wealthMultiplier + randomVariation);
        
        // Apply both reputation and level multipliers
        const finalMultiplier = wealthMultiplier * levelMultiplier;
        const finalWealth = Math.max(1, Math.floor(baseWealth * finalMultiplier));
        
        console.log(`[CustomerManager] Customer wealth: base ${baseWealth} × ${wealthMultiplier.toFixed(2)} (rep) × ${levelMultiplier.toFixed(2)} (L${innLevel}) = ${finalWealth} coins`);
        return finalWealth;
    }

    /**
     * Process customer arrivals and departures
     */
    static async processCustomers(channel, dbEntry, now) {
        const v4State = dbEntry.gameData?.v4State;
        if (!v4State) return { remainingCustomers: [], departureEvents: [] };
        
        const customers = v4State.customers || [];
        const maxCustomers = v4State.maxCustomers || 15;
        const departureEvents = [];
        const arrivalEvents = [];
        
        // Remove customers who have left (wealth = 0 or very unhappy)
        const remainingCustomers = customers.filter(customer => {
            if (customer.wealth <= 0) {
                // Customer leaves due to no money
                if (customer.happiness >= 50) {
                    v4State.innReputation = Math.min(100, (v4State.innReputation || 50) + 2);
                    departureEvents.push(`${customer.name} left satisfied after spending all their money (reputation +2)`);
                    console.log(`[CustomerManager] Happy customer ${customer.name} left, reputation +2`);
                } else {
                    v4State.innReputation = Math.max(0, (v4State.innReputation || 50) - 1);
                    departureEvents.push(`${customer.name} left disappointed with no money (reputation -1)`);
                    console.log(`[CustomerManager] Unhappy customer ${customer.name} left, reputation -1`);
                }
                return false;
            }
            
            if (customer.happiness <= 0) {
                // Customer leaves due to unhappiness
                v4State.innReputation = Math.max(0, (v4State.innReputation || 50) - 3);
                departureEvents.push(`${customer.name} stormed out in anger! (reputation -3)`);
                console.log(`[CustomerManager] Very unhappy customer ${customer.name} stormed out, reputation -3`);
                return false;
            }
            
            return true;
        });
        
        // Add new customers if there's space (influenced by reputation)
        if (remainingCustomers.length < maxCustomers) {
            let arrivalChance;
            const reputation = v4State.innReputation || 50;
            
            if (remainingCustomers.length === 0) {
                // Special case: if no customers, 30% chance to generate at least one
                arrivalChance = 0.3; // 30% chance when empty
                console.log(`[CustomerManager] Inn is empty, using guaranteed arrival chance: 30%`);
            } else {
                // Normal reputation-based arrival
                const baseArrivalChance = 0.2; // 20% base chance
                const reputationBonus = (reputation - 50) / 100; // -0.5 to +0.5 based on reputation
                arrivalChance = Math.max(0.05, Math.min(0.6, baseArrivalChance + reputationBonus));
            }
            
            if (Math.random() < arrivalChance) {
                const innLevel = v4State.innLevel || 1;
                const baseEarnings = v4State.baseEarnings || 5;
                const newCustomer = this.createCustomer(channel.id, now, reputation, innLevel, baseEarnings);
                remainingCustomers.push(newCustomer);
                arrivalEvents.push(`${newCustomer.name} arrived at the inn (happiness: ${newCustomer.happiness}, wealth: ${newCustomer.wealth}c)`);
                console.log(`[CustomerManager] New customer ${newCustomer.name} arrived (reputation: ${reputation}, L${innLevel} inn, chance: ${Math.round(arrivalChance * 100)}%)`);
            } else {
                console.log(`[CustomerManager] No new customer arrived (${Math.round(arrivalChance * 100)}% chance)`);
            }
        }
        
        // Update customers in database
        await ActiveVCs.findOneAndUpdate(
            { channelId: channel.id },
            { 
                $set: { 
                    'gameData.v4State.customers': remainingCustomers,
                    'gameData.v4State.innReputation': v4State.innReputation
                }
            }
        );
        
        return { remainingCustomers, departureEvents, arrivalEvents };
    }

    /**
     * Process customer orders and service
     */
    static async processCustomerOrders(channel, dbEntry, now, members) {
        const v4State = dbEntry.gameData?.v4State;
        if (!v4State || !v4State.customers) return { profit: 0, eventDescription: 'No customers in the inn' };
        
        const customers = v4State.customers;
        let totalProfit = 0;
        let orderEvents = [];
        
        // Calculate service capacity based on VC members and employees
        const employeeCount = v4State.employeeCount || 0;
        const serviceCapacity = await this.calculateServiceCapacity(members, employeeCount);
        let ordersToProcess = [];
        
        // Process existing orders and new order attempts
        for (const customer of customers) {
            // Check if customer wants to place an order
            if (!customer.hasActiveOrder && (now - customer.lastOrderTime) > 30000) { // 30 second minimum between orders
                const orderChance = Math.max(0.1, customer.happiness / 100); // Happier customers order more
                
                if (Math.random() < orderChance) {
                    // Customer places an order (cost based on inn's base earnings)
                    const baseEarnings = v4State.baseEarnings || 5;
                    const orderCost = Math.floor(Math.random() * 3) + baseEarnings; // baseEarnings to baseEarnings+2 coins
                    customer.hasActiveOrder = true;
                    customer.orderPlacedAt = now;
                    customer.orderItem = this.getRandomOrderItem(customer.preferences);
                    customer.lastOrderTime = now;
                    customer.ordersPlaced++;
                    
                    ordersToProcess.push(customer);
                    
                    console.log(`[CustomerManager] ${customer.name} ordered ${customer.orderItem} for ${orderCost} coins`);
                }
            }
            
            // Check if customer has an active order that needs processing
            if (customer.hasActiveOrder && customer.orderPlacedAt) {
                ordersToProcess.push(customer);
            }
        }
        
        // Process orders based on service capacity
        const processedOrders = Math.min(ordersToProcess.length, serviceCapacity);
        const avgServiceTime = ordersToProcess.length > 0 ? ordersToProcess.length / Math.max(1, serviceCapacity) : 0;
        
        let serviceQuality = 'on_time';
        if (avgServiceTime < 0.8) serviceQuality = 'fast';
        else if (avgServiceTime > 1.5) serviceQuality = 'slow';
        
        // Apply service results
        for (let i = 0; i < ordersToProcess.length; i++) {
            const customer = ordersToProcess[i];
            const baseEarnings = v4State.baseEarnings || 5;
            const orderCost = Math.floor(Math.random() * 3) + baseEarnings; // baseEarnings to baseEarnings+2 coins
            
            if (i < processedOrders) {
                // Order was processed
                customer.hasActiveOrder = false;
                customer.orderPlacedAt = null;
                customer.ordersReceived++;
                customer.wealth = Math.max(0, customer.wealth - orderCost);
                totalProfit += orderCost;
                
                // Adjust happiness based on service quality
                if (serviceQuality === 'fast') {
                    customer.happiness = Math.min(100, customer.happiness + 5);
                    orderEvents.push(`${customer.name} was delighted with fast service (+5 happiness)`);
                } else if (serviceQuality === 'slow') {
                    customer.happiness = Math.max(0, customer.happiness - 3);
                    orderEvents.push(`${customer.name} was frustrated with slow service (-3 happiness)`);
                } else {
                    customer.happiness = Math.min(100, customer.happiness + 1);
                    orderEvents.push(`${customer.name} was satisfied with their ${customer.orderItem}`);
                }
                
                // Check for tipping (happiness > 60)
                if (customer.happiness > 60 && customer.wealth > 0) {
                    const tipChance = (customer.happiness - 60) / 40; // 0 to 1 based on happiness above 60
                    if (Math.random() < tipChance) {
                        const tipAmount = Math.floor(Math.random() * 2) + 1; // 1-2 coins tip
                        if (customer.wealth >= tipAmount) {
                            customer.wealth -= tipAmount;
                            totalProfit += tipAmount;
                            orderEvents.push(`${customer.name} left a ${tipAmount} coin tip! (happiness: ${customer.happiness})`);
                            console.log(`[CustomerManager] ${customer.name} tipped ${tipAmount} coins (happiness: ${customer.happiness})`);
                        }
                    }
                }
                
                customer.orderItem = null;
            }
        }
        
        // Update customers in database
        await ActiveVCs.findOneAndUpdate(
            { channelId: channel.id },
            { $set: { 'gameData.v4State.customers': customers } }
        );
        
        const eventDescription = orderEvents.length > 0 
            ? `Served ${processedOrders} customers (${serviceQuality} service): ${orderEvents.slice(0, 2).join(', ')}${orderEvents.length > 2 ? '...' : ''}`
            : `${customers.length} customers present, no orders this cycle`;
        
        return { profit: totalProfit, eventDescription, serviceQuality, customersServed: processedOrders };
    }

    /**
     * Calculate service capacity based on VC members' actual stats plus employee bonuses
     */
    static async calculateServiceCapacity(members, employeeCount = 0) {
        if (!members || members.length === 0) return Math.max(1, this.calculateEmployeeServiceCapacity(employeeCount)); // Minimum service capacity with employee bonus
        
        let totalServiceCapacity = 0;
        
        // Import player stats function
        const getPlayerStats = require('../../calculatePlayerStat');
        
        for (const member of members) {
            try {
                const playerData = await getPlayerStats(member.user.id);
                const playerStats = playerData?.stats || {};
                
                const sight = playerStats.sight || 0;
                const speed = playerStats.speed || 0;
                
                // Both sight and speed are needed for effective service
                // 5 speed allows serving 1 customer, but only if there's sight to spot them
                // 5 sight allows spotting 2 customers, but only if there's speed to serve them
                
                const speedUnits = Math.floor(speed / 5); // How many customers can be served with speed
                const sightUnits = Math.floor(sight / 5); // How many "sight groups" of 2 customers each
                
                // Effective capacity is limited by the bottleneck
                // Each sight unit can handle 2 customers, but needs speed units to serve them
                const effectiveCapacity = Math.min(speedUnits, sightUnits * 2);
                
                totalServiceCapacity += effectiveCapacity;
                
                console.log(`[CustomerManager] ${member.user.username}: Speed ${speed} (${speedUnits} units) + Sight ${sight} (${sightUnits} units) = ${effectiveCapacity} effective capacity`);
                
            } catch (error) {
                console.warn(`[CustomerManager] Error getting stats for ${member.user.username}:`, error.message);
                // Fallback: 1 capacity per member if stats unavailable
                totalServiceCapacity += 1;
            }
        }
        
        // Add employee service capacity bonus
        const employeeCapacity = this.calculateEmployeeServiceCapacity(employeeCount);
        totalServiceCapacity += employeeCapacity;
        
        if (employeeCount > 0) {
            console.log(`[CustomerManager] Employee bonus: ${employeeCount} employees = +${employeeCapacity} service capacity`);
        }
        
        return Math.max(1, totalServiceCapacity); // Always at least 1 capacity
    }

    /**
     * Calculate service capacity provided by employees
     * Each employee provides 4 sight + 4 speed
     */
    static calculateEmployeeServiceCapacity(employeeCount) {
        if (employeeCount <= 0) return 0;
        
        const employeeSight = employeeCount * 4;
        const employeeSpeed = employeeCount * 4;
        
        const speedUnits = Math.floor(employeeSpeed / 5);
        const sightUnits = Math.floor(employeeSight / 5);
        
        // Same calculation as player stats
        return Math.min(speedUnits, sightUnits * 2);
    }

    /**
     * Get random order item based on customer preferences
     */
    static getRandomOrderItem(preferences) {
        const foodItems = ['Hearty Stew', 'Roasted Meat', 'Fresh Bread', 'Vegetable Soup', 'Grilled Fish'];
        const drinkItems = ['Ale', 'Wine', 'Mead', 'Hot Tea', 'Fresh Water'];
        const consumableItems = ['Energy Potion', 'Health Tonic', 'Trail Rations'];
        
        let availableItems = [];
        
        if (preferences.includes('food')) availableItems.push(...foodItems);
        if (preferences.includes('drink')) availableItems.push(...drinkItems);
        if (preferences.includes('consumable')) availableItems.push(...consumableItems);
        
        if (availableItems.length === 0) availableItems = [...foodItems, ...drinkItems];
        
        return availableItems[Math.floor(Math.random() * availableItems.length)];
    }

    /**
     * Inject player as artificial customer when they buy from shop
     */
    static async injectPlayerAsCustomer(channelId, playerId, playerTag, amountSpent, guild) {
        try {
            console.log(`[CustomerManager] Injecting ${playerTag} as customer in channel ${channelId} with ${amountSpent} wealth`);
            
            // Get the inn data
            const dbEntry = await ActiveVCs.findOne({ channelId });
            if (!dbEntry || !dbEntry.gameData?.v4State || dbEntry.gameData?.gamemode !== 'innkeeper_v4') {
                console.log(`[CustomerManager] Channel ${channelId} is not an active inn, skipping customer injection`);
                return;
            }
            
            const v4State = dbEntry.gameData.v4State;
            const customers = v4State.customers || [];
            
            // Check if player is already a customer
            const existingCustomerIndex = customers.findIndex(c => c.playerId === playerId);
            
            if (existingCustomerIndex >= 0) {
                // Player is already a customer, increase their wealth
                const existingCustomer = customers[existingCustomerIndex];
                existingCustomer.wealth += amountSpent;
                existingCustomer.maxWealth = Math.max(existingCustomer.maxWealth, existingCustomer.wealth);
                existingCustomer.happiness = Math.min(100, existingCustomer.happiness + 5); // Happy about shopping
                
                console.log(`[CustomerManager] Updated existing customer ${playerTag}: wealth +${amountSpent} (now ${existingCustomer.wealth}), happiness +5`);
            } else {
                // Create new artificial customer for the player
                const now = Date.now();
                const member = guild.members.cache.get(playerId);
                
                const artificialCustomer = {
                    id: `player_customer_${playerId}_${now}`,
                    playerId: playerId, // Mark as player customer
                    npcId: null, // No NPC base
                    name: playerTag,
                    description: `A regular customer who frequently shops here`,
                    avatar: member ? member.user.displayAvatarURL({ extension: 'png', size: 128 }) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                    preferences: ['food', 'drink', 'consumable'], // Players like everything
                    
                    // Dynamic properties
                    happiness: 70, // Start happy (they just bought something)
                    wealth: amountSpent, // Wealth equals what they spent
                    maxWealth: amountSpent,
                    
                    // Timing properties
                    arrivedAt: now,
                    lastOrderTime: 0,
                    ordersPlaced: 0,
                    ordersReceived: 0,
                    
                    // Current state
                    hasActiveOrder: false,
                    orderPlacedAt: null,
                    orderItem: null,
                    
                    // Position in inn (will be set when rendering)
                    position: null,
                    
                    // Player-specific properties
                    isPlayerCustomer: true,
                    discordMember: member
                };
                
                customers.push(artificialCustomer);
                console.log(`[CustomerManager] Created new player customer ${playerTag} with ${amountSpent} wealth`);
            }
            
            // Update database
            await ActiveVCs.findOneAndUpdate(
                { channelId },
                { $set: { 'gameData.v4State.customers': customers } }
            );

            // Trigger immediate work log event for player customer injection
            try {
                await this.triggerPlayerCustomerEvent(channelId, playerId, playerTag, amountSpent, existingCustomerIndex >= 0);
            } catch (eventError) {
                console.warn('[CustomerManager] Error triggering player customer event:', eventError.message);
            }
            
        } catch (error) {
            console.error('[CustomerManager] Error injecting player as customer:', error);
        }
    }

    /**
     * Trigger immediate work log event for player customer injection
     */
    static async triggerPlayerCustomerEvent(channelId, playerId, playerTag, amountSpent, wasExisting) {
        try {
            // Get the channel from guild
            const ActiveVCs = require('../../models/activevcs');
            const dbEntry = await ActiveVCs.findOne({ channelId });
            if (!dbEntry || dbEntry.gameData?.gamemode !== 'innkeeper_v4') {
                return; // Not an inn channel
            }

            // Find the channel object (we need this for the work log update)
            // We'll need to get this from the guild - for now, create a mock channel-like object
            const mockChannel = {
                id: channelId,
                guild: null, // Will be set by the calling context
                send: () => {}, // Mock send function
                messages: {
                    fetch: () => Promise.resolve(new Map()) // Mock messages fetch
                }
            };

            // Create player arrival event
            const v4State = dbEntry.gameData.v4State;
            const currentCount = (v4State?.workEventCount || 0) + 1;
            
            const eventDescription = wasExisting 
                ? `${playerTag} returned to the inn with ${amountSpent} more coins to spend!`
                : `${playerTag} arrived at the inn as a customer with ${amountSpent} coins to spend!`;

            const playerCustomerEvent = {
                timestamp: Date.now(),
                eventNumber: currentCount,
                description: `Event #${currentCount} - ${eventDescription}`,
                type: 'player_customer_arrival',
                profit: 0,
                isPlayerArrival: true
            };

            // Update work event count
            await ActiveVCs.findOneAndUpdate(
                { channelId },
                { 
                    $set: { 
                        'gameData.v4State.workEventCount': currentCount
                    }
                }
            );

            // Get the inn keeper controller to update work log
            const InnKeeperV4Controller = require('../innKeeper_v4').InnKeeperV4Controller;
            const innKeeperInstance = new InnKeeperV4Controller();
            
            // Get fresh database entry
            const freshDbEntry = await ActiveVCs.findOne({ channelId }).lean();
            
            // We need the actual channel object for the work log update
            // This will be handled by the shop handler which has access to the channel
            console.log(`[CustomerManager] Player customer event ready for ${playerTag} in channel ${channelId}`);
            
            return { event: playerCustomerEvent, dbEntry: freshDbEntry };
            
        } catch (error) {
            console.error('[CustomerManager] Error triggering player customer event:', error);
            return null;
        }
    }

    /**
     * Process customers during break time (overnight stays)
     */
    static async processBreakTimeCustomers(channel, dbEntry, now) {
        const v4State = dbEntry.gameData?.v4State;
        if (!v4State || !v4State.customers) return { overnightProfit: 0, customersLeft: 0, customersStayed: 0 };

        const customers = v4State.customers;
        const baseEarnings = v4State.baseEarnings || 5;
        let overnightProfit = 0;
        let customersLeft = 0;
        let customersStayed = 0;

        // Process each customer's decision to stay overnight or leave
        const remainingCustomers = customers.filter(customer => {
            if (customer.happiness >= 60 && customer.wealth >= baseEarnings * 5) {
                // Happy customers with money may pay to stay overnight
                const stayChance = (customer.happiness - 60) / 40; // 0 to 1 based on happiness above 60
                
                if (Math.random() < stayChance) {
                    const overnightFee = baseEarnings * 5; // 5x baseEarnings for overnight stay
                    
                    if (customer.wealth >= overnightFee) {
                        customer.wealth -= overnightFee;
                        customer.happiness = Math.min(100, customer.happiness + 3); // Staying overnight makes them happier
                        
                        // Refresh customer wealth for next day (only for NPC customers, not players)
                        if (!customer.isPlayerCustomer) {
                            customer.wealth = customer.maxWealth; // Restore to full wealth
                        }
                        
                        overnightProfit += overnightFee;
                        customersStayed++;
                        
                        // Add reputation bonus for customers staying overnight
                        v4State.innReputation = Math.min(100, (v4State.innReputation || 50) + 2);
                        
                        console.log(`[CustomerManager] ${customer.name} paid ${overnightFee} coins to stay overnight (+3 happiness, +2 reputation, wealth refreshed to ${customer.wealth})`);
                        return true; // Customer stays
                    }
                }
            }
            
            // Customer leaves during break
            if (customer.happiness >= 50) {
                // Happy customer leaving normally
                v4State.innReputation = Math.min(100, (v4State.innReputation || 50) + 1);
                console.log(`[CustomerManager] Happy customer ${customer.name} left during break, reputation +1`);
            } else {
                // Unhappy customer leaving
                v4State.innReputation = Math.max(0, (v4State.innReputation || 50) - 2);
                console.log(`[CustomerManager] Unhappy customer ${customer.name} left during break, reputation -2`);
            }
            
            customersLeft++;
            return false; // Customer leaves
        });

        // Update customers and reputation in database
        await ActiveVCs.findOneAndUpdate(
            { channelId: channel.id },
            { 
                $set: { 
                    'gameData.v4State.customers': remainingCustomers,
                    'gameData.v4State.innReputation': v4State.innReputation
                }
            }
        );

        return { 
            overnightProfit, 
            customersLeft, 
            customersStayed,
            reputation: v4State.innReputation
        };
    }
}

module.exports = CustomerManager;
