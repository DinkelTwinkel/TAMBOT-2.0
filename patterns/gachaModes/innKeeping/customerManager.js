// Customer Management System for Inn Keeper V4
const npcsData = require('../../../data/npcs.json');
const gachaServersData = require('../../../data/gachaServers.json');
const ActiveVCs = require('../../../models/activevcs');

class CustomerManager {
    /**
     * Get maximum customers for inn based on gachaServers.json configuration
     */
    static getInnMaxCustomers(typeId) {
        const serverConfig = gachaServersData.find(s => s.id === String(typeId));
        if (serverConfig && serverConfig.type === 'innkeeper') {
            // Base max customers on inn power level and available floor tiles
            const baseTiles = 27; // From 10x7 inn with walls, tables, chairs
            const powerMultiplier = serverConfig.power || 1;
            return Math.min(baseTiles, Math.floor(baseTiles * 0.6 * powerMultiplier)); // 60% of tiles max, scaled by power
        }
        return 15; // Default fallback
    }

    /**
     * Create a new customer from NPC data
     */
    static createCustomer(channelId, now) {
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
            wealth: selectedNPC.wealth || 3, // Use NPC base wealth
            maxWealth: selectedNPC.wealth || 3,
            
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
     * Process customer arrivals and departures
     */
    static async processCustomers(channel, dbEntry, now) {
        const v4State = dbEntry.gameData?.v4State;
        if (!v4State) return [];
        
        const customers = v4State.customers || [];
        const maxCustomers = v4State.maxCustomers || 15;
        
        // Remove customers who have left (wealth = 0 or very unhappy)
        const remainingCustomers = customers.filter(customer => {
            if (customer.wealth <= 0) {
                // Customer leaves due to no money
                if (customer.happiness >= 50) {
                    v4State.innReputation = Math.min(100, (v4State.innReputation || 50) + 2);
                    console.log(`[CustomerManager] Happy customer ${customer.name} left, reputation +2`);
                } else {
                    v4State.innReputation = Math.max(0, (v4State.innReputation || 50) - 1);
                    console.log(`[CustomerManager] Unhappy customer ${customer.name} left, reputation -1`);
                }
                return false;
            }
            
            if (customer.happiness <= 10) {
                // Customer leaves due to unhappiness
                v4State.innReputation = Math.max(0, (v4State.innReputation || 50) - 3);
                console.log(`[CustomerManager] Very unhappy customer ${customer.name} stormed out, reputation -3`);
                return false;
            }
            
            return true;
        });
        
        // Add new customers if there's space (influenced by reputation)
        if (remainingCustomers.length < maxCustomers) {
            const reputation = v4State.innReputation || 50;
            const baseArrivalChance = 0.2; // 20% base chance
            const reputationBonus = (reputation - 50) / 100; // -0.5 to +0.5 based on reputation
            const arrivalChance = Math.max(0.05, Math.min(0.6, baseArrivalChance + reputationBonus));
            
            if (Math.random() < arrivalChance) {
                const newCustomer = this.createCustomer(channel.id, now);
                remainingCustomers.push(newCustomer);
                console.log(`[CustomerManager] New customer ${newCustomer.name} arrived (reputation: ${reputation}, chance: ${Math.round(arrivalChance * 100)}%)`);
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
        
        return remainingCustomers;
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
        
        // Calculate service capacity based on VC members
        const serviceCapacity = this.calculateServiceCapacity(members);
        let ordersToProcess = [];
        
        // Process existing orders and new order attempts
        for (const customer of customers) {
            // Check if customer wants to place an order
            if (!customer.hasActiveOrder && (now - customer.lastOrderTime) > 30000) { // 30 second minimum between orders
                const orderChance = Math.max(0.1, customer.happiness / 100); // Happier customers order more
                
                if (Math.random() < orderChance) {
                    // Customer places an order
                    const orderCost = Math.floor(Math.random() * 3) + 2; // 2-4 coins
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
            const orderCost = Math.floor(Math.random() * 3) + 2; // 2-4 coins
            
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
     * Calculate service capacity based on VC members
     */
    static calculateServiceCapacity(members) {
        if (!members || members.length === 0) return 1; // Minimum service capacity
        
        // Base capacity on number of members and their theoretical stats
        const baseCapacity = members.length;
        const sightBonus = Math.floor(members.length * 0.5); // Sight helps spot customer needs
        const speedBonus = Math.floor(members.length * 0.3); // Speed helps deliver orders
        
        return Math.max(1, baseCapacity + sightBonus + speedBonus);
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
     * Process customers during break time (overnight stays)
     */
    static async processBreakTimeCustomers(channel, dbEntry, now) {
        const v4State = dbEntry.gameData?.v4State;
        if (!v4State || !v4State.customers) return { overnightProfit: 0, customersLeft: 0, customersStayed: 0 };

        const customers = v4State.customers;
        let overnightProfit = 0;
        let customersLeft = 0;
        let customersStayed = 0;

        // Process each customer's decision to stay overnight or leave
        const remainingCustomers = customers.filter(customer => {
            if (customer.happiness >= 60 && customer.wealth >= 3) {
                // Happy customers with money may pay to stay overnight
                const stayChance = (customer.happiness - 60) / 40; // 0 to 1 based on happiness above 60
                
                if (Math.random() < stayChance) {
                    const overnightFee = Math.floor(Math.random() * 3) + 3; // 3-5 coins for overnight stay
                    
                    if (customer.wealth >= overnightFee) {
                        customer.wealth -= overnightFee;
                        customer.happiness = Math.min(100, customer.happiness + 3); // Staying overnight makes them happier
                        overnightProfit += overnightFee;
                        customersStayed++;
                        
                        console.log(`[CustomerManager] ${customer.name} paid ${overnightFee} coins to stay overnight (+3 happiness)`);
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
