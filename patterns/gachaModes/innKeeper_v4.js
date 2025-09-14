// InnKeeper V4 - Simplified Basic Break/Work Cycle with Dummy Events
// Features: 20min work shifts -> 5min breaks, every 4th cycle 20min break

const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ActiveVCs = require('../../models/activevcs');
const Money = require('../../models/currency');
const InnConstants = require('./innKeeping/innConstants');
const { generateInnMapImage } = require('./imageProcessing/inn-layered-render');
const generateShop = require('../generateShop');
const CustomerManager = require('./innKeeping/customerManager');
const GameStatTracker = require('../gameStatTracker');

class InnKeeperV4Controller {
    constructor() {
        // Use centralized constants
        this.config = InnConstants;
        
        this.processingLocks = new Map();
        this.messageCache = new Map();
        
        // Initialize game stat tracker
        this.gameStatTracker = new GameStatTracker();
    }

    /**
     * Main processing loop for InnKeeper V4
     */
    async processInn(channel, dbEntry, now) {
        const channelId = channel.id;
        console.log(`[InnKeeperV4] processInn called for ${channelId}`);
        
        try {
            // Acquire processing lock
            if (!await this.acquireLock(channelId)) {
                console.log(`[InnKeeperV4] Could not acquire lock for ${channelId}, skipping cycle`);
                return;
            }

            try {
                
                // Initialize game data if needed
                const wasInitialized = await this.initializeGameData(channelId, now);
                
                // Get fresh data after initialization
                const freshEntry = await ActiveVCs.findOne({ channelId }).lean();
                if (!freshEntry) {
                    console.error(`[InnKeeperV4] No database entry found for channel ${channelId}`);
                    return;
                }

                // If this was a new initialization, create initial work log and send inn map
                if (wasInitialized) {
                    const initialWorkEvent = {
                        timestamp: now,
                        eventNumber: 0,
                        description: 'Inn initialized - Ready to serve customers!',
                        type: 'inn_init'
                    };
                    await this.updateWorkEventLog(channel, freshEntry, initialWorkEvent);
                    
                    // Track initial inn level for all voice channel members
                    const v4State = freshEntry.gameData?.v4State;
                    if (v4State && v4State.innLevel) {
                        const voiceChannel = channel.guild.channels.cache.find(c => 
                            c.type === 2 && c.members.size > 0
                        );
                        if (voiceChannel) {
                            const members = Array.from(voiceChannel.members.values());
                            for (const member of members) {
                                try {
                                    await this.gameStatTracker.trackInnLevel(member.id, channel.guild.id, v4State.innLevel);
                                } catch (error) {
                                    console.error('Error tracking initial inn level:', error);
                                }
                            }
                        }
                    }
                    
                    // Send initial inn opening notification
                    try {
                        const initEmbed = new EmbedBuilder()
                            .setTitle('🏨 Inn Opened!')
                            .setColor('#2ecc71')
                            .setDescription('Welcome to the inn! The establishment is now open for business.')
                            .setTimestamp();
                        
                        await channel.send({ embeds: [initEmbed] });
                    } catch (error) {
                        console.error(`[InnKeeperV4] Error sending initial inn notification for channel ${channel.id}:`, error);
                    }
                }

                // Check current work/break state and handle transitions
                await this.handleWorkBreakCycle(channel, freshEntry, now);
                
            } finally {
                await this.releaseLock(channelId);
            }
            
        } catch (error) {
            console.error(`[InnKeeperV4] Error processing inn ${channelId}:`, error);
            await this.releaseLock(channelId);
        }
    }

    /**
     * Initialize game data for InnKeeper V4
     * @returns {boolean} true if initialization was performed, false if already initialized
     */
    async initializeGameData(channelId, now) {
        const existingEntry = await ActiveVCs.findOne({ channelId }).lean();
        
        if (!existingEntry) {
            console.error(`[InnKeeperV4] No database entry found for channel ${channelId}`);
            return false;
        }

        // Initialize gameData if it doesn't exist
        if (!existingEntry.gameData) {
            existingEntry.gameData = {};
        }

        // Initialize V4 specific data
        const needsInit = !existingEntry.gameData.v4State;
        
        if (needsInit) {
            const v4State = {
                workState: 'working',           // 'working' | 'break'
                workStartTime: new Date(now),
                cycleCount: 0,                  // Track cycles for long break
                lastStateChange: new Date(now),
                breakType: null,                // 'short' | 'long'
                lastWorkEvent: 0,               // Track last work event time
                workEventCount: 0,              // Count work events for testing
                workEventLog: [],               // Array of work events for current work period
                workLogMessageId: null,         // ID of the current work log embed message
                workLogEmbedCount: 0,           // Count of work log embeds created
                currentWorkPeriodProfit: 0,     // Total profit earned in current work period
                totalProfit: 0,                 // Total profit earned across all periods
                customers: [],                  // Array of current customers in the inn
                innReputation: 5,               // Inn reputation (0-100)
                maxCustomers: 15,               // Default max customers, will be updated from gachaServers.json
                innDimensions: this.getInnDimensions(existingEntry.typeId), // Inn dimensions from gachaServers.json
                innLevel: 1,                    // Inn level (starts at 1)
                baseEarnings: this.getBaseEarnings(existingEntry.typeId), // Base earnings from gachaServers.json
                employeeCount: 0                // Number of hired employees
            };

            const initData = {
                'gameData.gamemode': 'innkeeper_v4',
                'gameData.v4State': v4State,
                'gameData.lastActivity': new Date(now)
            };
            
            console.log(`[InnKeeperV4] Initializing for channel ${channelId}`);

            await ActiveVCs.findOneAndUpdate(
                { channelId: channelId },
                { $set: initData }
            );
            
            return true; // Indicate that initialization was performed
        }
        
        return false; // Already initialized
    }

    /**
     * Handle work/break cycle transitions
     */
    async handleWorkBreakCycle(channel, dbEntry, now) {
        const v4State = dbEntry.gameData?.v4State;
        if (!v4State) {
            console.error(`[InnKeeperV4] No V4 state found for channel ${channel.id}`);
            return;
        }

        const currentState = v4State.workState;
        
        if (currentState === 'working') {
            // Check if work period is complete
            if (this.isWorkPeriodComplete(v4State, now)) {
                console.log(`[InnKeeperV4] Work period complete, starting break for ${channel.id}`);
                await this.startBreak(channel, dbEntry, now);
            } else {
                // Still working - process customer events
                console.log(`[InnKeeperV4] Inn is working, processing customer events for ${channel.id}`);
                await this.processCustomerWorkEvents(channel, dbEntry, now);
            }
        } else if (currentState === 'break') {
            // Check if break period is complete
            if (this.isBreakPeriodComplete(v4State, now)) {
                const breakEnded = await this.endBreak(channel, dbEntry, now);
                
                // If break ended successfully, fetch fresh data and start customer events
                if (breakEnded) {
                    console.log(`[InnKeeperV4] Break ended, fetching fresh data for customer events for ${channel.id}`);
                    const freshEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
                    if (freshEntry && freshEntry.gameData?.v4State?.workState === 'working') {
                        // Process customer events with fresh data that has reset lastWorkEvent
                        await this.processCustomerWorkEvents(channel, freshEntry, now);
                    }
                }
            } else {
                // Still on break
                console.log(`[InnKeeperV4] Still on break for ${channel.id}`);
            }
        }
    }

    /**
     * Get inn dimensions from gachaServers.json configuration
     */
    getInnDimensions(typeId) {
        const gachaServersData = require('../../data/gachaServers.json');
        const serverConfig = gachaServersData.find(s => s.id === String(typeId));
        
        if (serverConfig && serverConfig.type === 'innkeeper' && serverConfig.innDimensions) {
            return {
                width: serverConfig.innDimensions.width,
                height: serverConfig.innDimensions.height,
                maxCustomers: serverConfig.innDimensions.maxCustomers
            };
        }
        
        // Default dimensions for unknown inn types
        return {
            width: 10,
            height: 7,
            maxCustomers: 15
        };
    }

    /**
     * Get base earnings for inn from gachaServers.json configuration
     */
    getBaseEarnings(typeId) {
        const gachaServersData = require('../../data/gachaServers.json');
        const serverConfig = gachaServersData.find(s => s.id === String(typeId));
        
        if (serverConfig && serverConfig.type === 'innkeeper' && serverConfig.baseEarnings) {
            return serverConfig.baseEarnings;
        }
        
        return 5; // Default base earnings
    }

    /**
     * Check if work period is complete (20 minutes)
     */
    isWorkPeriodComplete(v4State, now) {
        const workStartTime = new Date(v4State.workStartTime).getTime();
        const workDuration = this.config.TIMING.WORK_DURATION; // 20 minutes
        const timeSinceWorkStart = now - workStartTime;
        
        return timeSinceWorkStart >= workDuration;
    }

    /**
     * Check if break period is complete
     */
    isBreakPeriodComplete(v4State, now) {
        if (!v4State.breakStartTime) {
            return true; // No break start time means break should end
        }
        
        const breakStartTime = new Date(v4State.breakStartTime).getTime();
        const breakDuration = v4State.breakType === 'long' 
            ? this.config.TIMING.LONG_BREAK_DURATION  // 20 minutes
            : this.config.TIMING.SHORT_BREAK_DURATION; // 5 minutes
        const timeSinceBreakStart = now - breakStartTime;
        
        return timeSinceBreakStart >= breakDuration;
    }

    /**
     * Start break period
     */
    async startBreak(channel, dbEntry, now) {
        const v4State = dbEntry.gameData.v4State;
        const cycleCount = v4State.cycleCount + 1;
        const isLongBreak = cycleCount % this.config.TIMING.LONG_BREAK_CYCLE === 0; // Every 4th cycle
        const breakType = isLongBreak ? 'long' : 'short';
        const breakDuration = isLongBreak 
            ? this.config.TIMING.LONG_BREAK_DURATION 
            : this.config.TIMING.SHORT_BREAK_DURATION;

        console.log(`[InnKeeperV4] Starting ${breakType} break for channel ${channel.id}, cycle ${cycleCount}`);

        // Update state
        const updated = await ActiveVCs.findOneAndUpdate(
            { 
                channelId: channel.id,
                'gameData.v4State.workState': 'working'
            },
            { 
                $set: { 
                    'gameData.v4State.workState': 'break',
                    'gameData.v4State.breakStartTime': new Date(now),
                    'gameData.v4State.breakType': breakType,
                    'gameData.v4State.cycleCount': cycleCount,
                    'gameData.v4State.lastStateChange': new Date(now),
                    'gameData.lastActivity': new Date(now),
                    nextTrigger: new Date(now + breakDuration)
                }
            },
            { new: true }
        );

        if (!updated) {
            console.log('[InnKeeperV4] Failed to start break - state already changed');
            return false;
        }

        // Get voice channel members for tracking
        let voiceChannel = null;
        const textChannelName = channel.name.toLowerCase();
        voiceChannel = channel.guild.channels.cache.find(c => 
            c.type === 2 && // Voice channel
            c.name.toLowerCase().includes(textChannelName.replace(/-/g, ' ')) ||
            textChannelName.includes(c.name.toLowerCase().replace(/-/g, ' '))
        );
        
        // If no specific match, find any voice channel with members
        if (!voiceChannel || voiceChannel.members.size === 0) {
            voiceChannel = channel.guild.channels.cache.find(c => 
                c.type === 2 && c.members.size > 0 // Any voice channel with members
            );
        }
        
        const members = voiceChannel ? Array.from(voiceChannel.members.values()) : [];

        // Process customers during break (overnight stays and departures)
        const breakCustomerResult = await CustomerManager.processBreakTimeCustomers(channel, dbEntry, now);
        const totalBreakProfit = (v4State.currentWorkPeriodProfit || 0) + breakCustomerResult.overnightProfit;

        // Track overnight stays and customer satisfaction
        if (breakCustomerResult.customersStayed > 0) {
            for (const member of members) {
                try {
                    await this.gameStatTracker.trackOvernightStays(member.id, channel.guild.id, breakCustomerResult.customersStayed);
                } catch (error) {
                    console.error('Error tracking overnight stays:', error);
                }
            }
        }

        // Track happy and sad customers
        const happyCustomers = breakCustomerResult.customersLeft > 0 ? Math.floor(breakCustomerResult.customersLeft * 0.7) : 0;
        const sadCustomers = breakCustomerResult.customersLeft - happyCustomers;
        
        if (happyCustomers > 0 || sadCustomers > 0) {
            for (const member of members) {
                try {
                    if (happyCustomers > 0) {
                        await this.gameStatTracker.trackHappyCustomers(member.id, channel.guild.id, happyCustomers);
                    }
                    if (sadCustomers > 0) {
                        await this.gameStatTracker.trackSadCustomers(member.id, channel.guild.id, sadCustomers);
                    }
                } catch (error) {
                    console.error('Error tracking customer satisfaction:', error);
                }
            }
        }

        // Distribute profits to all members in the channel (including overnight fees)
        await this.distributeProfits(channel, totalBreakProfit);

        // Send separate break announcement message
        const breakEndTime = now + breakDuration;
        const embed = await this.createBreakStartEmbed(isLongBreak, cycleCount, breakDuration, breakEndTime, totalBreakProfit, breakCustomerResult, channel);
        await channel.send({ embeds: [embed] });
        console.log(`[InnKeeperV4] Sent break announcement for channel ${channel.id}`);
        return true;
    }

    /**
     * End break period and start new work cycle
     */
    async endBreak(channel, dbEntry, now) {
        console.log(`[InnKeeperV4] Ending break for channel ${channel.id}`);

        const nextWorkEndTime = now + this.config.TIMING.WORK_DURATION;

        // Update state and reset work event timer
        const updated = await ActiveVCs.findOneAndUpdate(
            { 
                channelId: channel.id,
                'gameData.v4State.workState': 'break'
            },
            { 
                $set: { 
                    'gameData.v4State.workState': 'working',
                    'gameData.v4State.workStartTime': new Date(now),
                    'gameData.v4State.lastStateChange': new Date(now),
                    'gameData.v4State.lastWorkEvent': 0,  // Reset work event timer
                    'gameData.v4State.workEventLog': [],  // Reset work event log
                    'gameData.v4State.workLogMessageId': null,  // Reset work log message ID
                    'gameData.v4State.currentWorkPeriodProfit': 0,  // Reset current work period profit
                    'gameData.lastActivity': new Date(now),
                    nextTrigger: new Date(nextWorkEndTime)
                },
                $unset: {
                    'gameData.v4State.breakStartTime': 1,
                    'gameData.v4State.breakType': 1
                }
            },
            { new: true }
        );

        if (!updated) {
            console.log('[InnKeeperV4] Failed to end break - state already changed');
            return false;
        }

        // Edit break message to show work log instead of sending new message
        try {
            // Try to find and edit the most recent break message
            const messages = await channel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();
            
            if (lastMessage && 
                lastMessage.author.bot && 
                lastMessage.embeds.length > 0 && 
                (lastMessage.embeds[0].title?.includes('Break Time') || lastMessage.embeds[0].title?.includes('Extended Break'))) {
                
                // Create initial work event for the new work period
        const initialWorkEvent = {
            timestamp: now,
            eventNumber: 0,
                    description: 'Work period restarted - Inn is back open for business!',
                    type: 'work_restart'
        };
        
                // Update work log instead of sending reopening message
        await this.updateWorkEventLog(channel, updated, initialWorkEvent);
                console.log(`[InnKeeperV4] Edited break message to show work log for inn reopening`);
            } else {
                // Fallback: send work restart notification if no break message found
                const embed = this.createWorkStartEmbed(this.config.TIMING.WORK_DURATION, nextWorkEndTime);
                await channel.send({ embeds: [embed] });
                console.log(`[InnKeeperV4] No break message found, sent new work restart message`);
            }
        } catch (error) {
            console.error(`[InnKeeperV4] Error editing break message to work log:`, error);
            // Fallback: send work restart notification
            const embed = this.createWorkStartEmbed(this.config.TIMING.WORK_DURATION, nextWorkEndTime);
            await channel.send({ embeds: [embed] });
        }
        
        return true;
    }

    /**
     * Process customer work events (replaces dummy work events)
     */
    async processCustomerWorkEvents(channel, dbEntry, now) {
        try {
            const v4State = dbEntry.gameData?.v4State;
            if (!v4State) {
                console.log('[InnKeeperV4] No v4State found for customer work events');
                return;
            }

            const lastEventTime = v4State.lastWorkEvent || 0;
            // Random interval between 10-20 seconds
            const minInterval = 10000; // 10 seconds
            const maxInterval = 20000; // 20 seconds
            const eventInterval = minInterval + Math.random() * (maxInterval - minInterval);
            const timeSinceLastEvent = now - lastEventTime;
            
            console.log(`[InnKeeperV4] Customer work event check: ${Math.round(timeSinceLastEvent / 1000)}s since last event, need ${Math.round(eventInterval / 1000)}s minimum`);
            console.log(`[InnKeeperV4] Debug - lastEventTime: ${lastEventTime}, now: ${now}, dbEntry timestamp: ${dbEntry.gameData?.lastActivity || 'unknown'}`);
            
            // Check if enough time has passed for next event
            if (timeSinceLastEvent >= eventInterval) {
                console.log(`[InnKeeperV4] ✓ Triggering customer event (${Math.round(timeSinceLastEvent / 1000)}s >= ${Math.round(eventInterval / 1000)}s)`);
                await this.generateCustomerEvent(channel, dbEntry, now);
            } else {
                console.log(`[InnKeeperV4] ✗ Not enough time passed for customer event (${Math.round(timeSinceLastEvent / 1000)}s < ${Math.round(eventInterval / 1000)}s)`);
            }

        } catch (error) {
            console.error('[InnKeeperV4] Error processing customer work events:', error);
        }
    }

    /**
     * Process dummy work events for testing (DEPRECATED)
     */
    async processDummyWorkEvents(channel, dbEntry, now) {
        try {
            const v4State = dbEntry.gameData?.v4State;
            if (!v4State) {
                console.log('[InnKeeperV4] No v4State found for dummy work events');
                return;
            }

            const lastEventTime = v4State.lastWorkEvent || 0;
            // Random interval between 10-20 seconds
            const minInterval = 10000; // 10 seconds
            const maxInterval = 20000; // 20 seconds
            const eventInterval = minInterval + Math.random() * (maxInterval - minInterval);
            const timeSinceLastEvent = now - lastEventTime;
            
            console.log(`[InnKeeperV4] Dummy work event check: ${Math.round(timeSinceLastEvent / 1000)}s since last event, need ${Math.round(eventInterval / 1000)}s minimum`);
            
            // Check if enough time has passed for next event
            if (timeSinceLastEvent >= eventInterval) {
                console.log('[InnKeeperV4] Triggering customer event');
                await this.generateCustomerEvent(channel, dbEntry, now);
            }

        } catch (error) {
            console.error('[InnKeeperV4] Error processing dummy work events:', error);
        }
    }

    /**
     * Generate customer event (replaces dummy work event)
     */
    async generateCustomerEvent(channel, dbEntry, now) {
        try {
            console.log('[InnKeeperV4] Processing customer events');
            const v4State = dbEntry.gameData?.v4State;
            if (!v4State) {
                console.error('[InnKeeperV4] No v4State found in dbEntry for customer events');
                return;
            }
            
            const currentCount = v4State?.workEventCount || 0;
            const newCount = currentCount + 1;
            console.log(`[InnKeeperV4] Current customer count: ${(v4State.customers || []).length}, Max: ${v4State.maxCustomers || 15}`);

            // Get voice channel members for service capacity calculation
            let voiceChannel = null;
            const textChannelName = channel.name.toLowerCase();
            voiceChannel = channel.guild.channels.cache.find(c => 
                c.type === 2 && // Voice channel
                c.name.toLowerCase().includes(textChannelName.replace(/-/g, ' ')) ||
                textChannelName.includes(c.name.toLowerCase().replace(/-/g, ' '))
            );
            
            if (!voiceChannel || voiceChannel.members.size === 0) {
                voiceChannel = channel.guild.channels.cache.find(c => 
                    c.type === 2 && c.members.size > 0 // Any voice channel with members
                );
            }
            
            const members = voiceChannel ? Array.from(voiceChannel.members.values()) : [];

            // Process customers (arrivals/departures)
            console.log(`[InnKeeperV4] Processing customer arrivals/departures for channel ${channel.id}`);
            const customerResult = await CustomerManager.processCustomers(channel, dbEntry, now, members);
            const departureEvents = customerResult.departureEvents || [];
            const arrivalEvents = customerResult.arrivalEvents || [];

            // Get fresh database entry with updated customer data
            const updatedDbEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
            const updatedCustomerCount = (updatedDbEntry?.gameData?.v4State?.customers || []).length;
            console.log(`[InnKeeperV4] Updated customer count after processing: ${updatedCustomerCount}`);
            
            // Process customer orders and service
            console.log(`[InnKeeperV4] Processing customer orders for channel ${channel.id} with ${members.length} staff members`);
            const orderResult = await CustomerManager.processCustomerOrders(channel, updatedDbEntry || dbEntry, now, members);
            let profit = orderResult.profit;

            // Track orders placed
            if (orderResult.customersServed > 0) {
                for (const member of members) {
                    try {
                        await this.gameStatTracker.trackOrdersPlaced(member.id, channel.guild.id, orderResult.customersServed);
                    } catch (error) {
                        console.error('Error tracking orders placed:', error);
                    }
                }
            }

            // Process luck-based coin finding for each member
            const coinFindResults = await this.processPlayerCoinFinds(members, channel.id, updatedDbEntry || dbEntry);
            profit += coinFindResults.totalCoinsFound;
            
            // Combine order events, departure events, and arrival events for description
            let eventDescription = orderResult.eventDescription;
            if (departureEvents.length > 0) {
                eventDescription += `. Departures: ${departureEvents.join(', ')}`;
            }
            if (arrivalEvents.length > 0) {
                eventDescription += `. Arrivals: ${arrivalEvents.join(', ')}`;
            }
            if (coinFindResults.coinFindEvents.length > 0) {
                eventDescription += `. Coin Finds: ${coinFindResults.coinFindEvents.join(', ')}`;
            }

            // Update profit tracking
            const currentProfit = v4State?.currentWorkPeriodProfit || 0;
            const newCurrentProfit = currentProfit + profit;
            const totalProfit = (v4State?.totalProfit || 0) + profit;

            // Create work event object
            const workEvent = {
                timestamp: now,
                eventNumber: newCount,
                description: `Event #${newCount} - ${eventDescription}${profit > 0 ? ` (Earned ${profit} coins)` : ''}`,
                type: 'customer_event',
                profit: profit,
                customersServed: orderResult.customersServed || 0,
                serviceQuality: orderResult.serviceQuality || 'none'
            };

            // Update database with new event time, count, and profit
            const updateResult = await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                { 
                    $set: { 
                        'gameData.v4State.lastWorkEvent': now,
                        'gameData.v4State.workEventCount': newCount,
                        'gameData.v4State.currentWorkPeriodProfit': newCurrentProfit,
                        'gameData.v4State.totalProfit': totalProfit
                    }
                },
                { new: true }
            );
            
            if (updateResult) {
                console.log(`[InnKeeperV4] Database updated - lastWorkEvent set to ${now}, count: ${newCount}`);
            } else {
                console.error(`[InnKeeperV4] Failed to update database for channel ${channel.id}`);
            }

            // Get fresh database entry with updated customer data for work log
            const freshDbEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
            
            // Update work event log embed instead of sending new message
            console.log(`[InnKeeperV4] About to update work event log for channel ${channel.id}`);
            await this.updateWorkEventLog(channel, freshDbEntry || dbEntry, workEvent);

            console.log(`[InnKeeperV4] Customer event #${newCount} processed for channel ${channel.id} - ${eventDescription} (Profit: ${profit})`);

        } catch (error) {
            console.error('[InnKeeperV4] Error generating customer event:', error);
        }
    }

    /**
     * Generate a dummy work event for testing (DEPRECATED - replaced by generateCustomerEvent)
     */
    async generateDummyWorkEvent(channel, dbEntry, now) {
        try {
            console.log('[InnKeeperV4] Generating dummy work event');
            const v4State = dbEntry.gameData?.v4State;
            const currentCount = v4State?.workEventCount || 0;
            const newCount = currentCount + 1;

            // Generate random profit between 50-100
            const profit = Math.floor(Math.random() * 51) + 50; // 50-100 inclusive
            const currentProfit = v4State?.currentWorkPeriodProfit || 0;
            const newCurrentProfit = currentProfit + profit;
            const totalProfit = (v4State?.totalProfit || 0) + profit;

            // Create work event object
            const workEvent = {
                timestamp: now,
                eventNumber: newCount,
                description: `Event #${newCount} - Earned ${profit} coins serving customers!`,
                type: 'dummy_work_event',
                profit: profit
            };

            // Update database with new event time, count, and profit
            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                { 
                    $set: { 
                        'gameData.v4State.lastWorkEvent': now,
                        'gameData.v4State.workEventCount': newCount,
                        'gameData.v4State.currentWorkPeriodProfit': newCurrentProfit,
                        'gameData.v4State.totalProfit': totalProfit
                    }
                }
            );

            // Update work event log embed instead of sending new message
            await this.updateWorkEventLog(channel, dbEntry, workEvent);

            console.log(`[InnKeeperV4] Dummy work event #${newCount} logged for channel ${channel.id} - Earned ${profit} coins (Total: ${newCurrentProfit})`);

        } catch (error) {
            console.error('[InnKeeperV4] Error generating dummy work event:', error);
        }
    }

    /**
     * Distribute profits equally to all members in the voice channel
     */
    async distributeProfits(channel, totalProfit) {
        try {
            if (!totalProfit || totalProfit <= 0) {
                console.log('[InnKeeperV4] No profits to distribute');
                return { employeesPaid: true, playerProfit: 0 };
            }

            // Get inn state for employee information
            const dbEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
            const v4State = dbEntry?.gameData?.v4State;
            const employeeCount = v4State?.employeeCount || 0;
            const baseEarnings = v4State?.baseEarnings || 5;

            // Calculate employee wages (baseEarnings x 1 per employee)
            const totalEmployeeWages = employeeCount * baseEarnings;
            
            let playerProfit = totalProfit;
            let employeesPaid = true;

            // Pay employees first if any exist
            if (employeeCount > 0) {
                if (totalProfit >= totalEmployeeWages) {
                    // Can afford to pay employees
                    playerProfit = totalProfit - totalEmployeeWages;
                    console.log(`[InnKeeperV4] Paid ${employeeCount} employees ${totalEmployeeWages} coins (${baseEarnings} each). Remaining: ${playerProfit} coins`);
                } else {
                    // Cannot afford employees - they leave
                    console.log(`[InnKeeperV4] Cannot afford employee wages (${totalEmployeeWages} needed, ${totalProfit} available). All employees leave!`);
                    
                    // Set employee count to 0
                    await ActiveVCs.findOneAndUpdate(
                        { channelId: channel.id },
                        { $set: { 'gameData.v4State.employeeCount': 0 } }
                    );
                    
                    employeesPaid = false;
                    playerProfit = totalProfit; // Players get all profit since no employees
                }
            }

            // Distribute remaining profit to players if any exists
            if (playerProfit <= 0) {
                console.log('[InnKeeperV4] No profit remaining for players after employee wages');
                return { employeesPaid, playerProfit: 0 };
            }

            // Get all members currently in the voice channel associated with this inn
            let voiceChannel = null;
            
            // Check if this text channel has a linked voice channel (same name or similar)
            const textChannelName = channel.name.toLowerCase();
            voiceChannel = channel.guild.channels.cache.find(c => 
                c.type === 2 && // Voice channel
                c.name.toLowerCase().includes(textChannelName.replace(/-/g, ' ')) ||
                textChannelName.includes(c.name.toLowerCase().replace(/-/g, ' '))
            );
            
            // If no specific match, find any voice channel with members
            if (!voiceChannel || voiceChannel.members.size === 0) {
                voiceChannel = channel.guild.channels.cache.find(c => 
                    c.type === 2 && c.members.size > 0 // Any voice channel with members
                );
            }

            if (!voiceChannel || voiceChannel.members.size === 0) {
                console.log('[InnKeeperV4] No members in voice channel to distribute profits to');
                return { employeesPaid, playerProfit };
            }

            const members = Array.from(voiceChannel.members.values());
            const profitPerMember = Math.floor(playerProfit / members.length);
            const remainingProfit = playerProfit - (profitPerMember * members.length);

            console.log(`[InnKeeperV4] Distributing ${playerProfit} coins to ${members.length} members (${profitPerMember} each, ${remainingProfit} remaining)`);

            // Distribute profits to each member
            for (const member of members) {
                try {
                    await Money.findOneAndUpdate(
                        { userId: member.id },
                        { 
                            $inc: { money: profitPerMember },
                            $set: { usertag: member.user.tag }
                        },
                        { upsert: true, new: true }
                    );

                    // Track money earned from inn
                    if (profitPerMember > 0) {
                        await this.gameStatTracker.trackInnMoneyEarned(member.id, channel.guild.id, profitPerMember);
                    }
                } catch (error) {
                    console.error(`[InnKeeperV4] Error updating money for user ${member.id}:`, error);
                }
            }

            // Distribute remaining profit to the first member (if any)
            if (remainingProfit > 0) {
                try {
                    await Money.findOneAndUpdate(
                        { userId: members[0].id },
                        { 
                            $inc: { money: remainingProfit },
                            $set: { usertag: members[0].user.tag }
                        },
                        { upsert: true, new: true }
                    );

                    // Track additional money earned from inn
                    await this.gameStatTracker.trackInnMoneyEarned(members[0].id, channel.guild.id, remainingProfit);
                } catch (error) {
                    console.error(`[InnKeeperV4] Error updating remaining money for user ${members[0].id}:`, error);
                }
            }

            console.log(`[InnKeeperV4] Successfully distributed ${playerProfit} coins to ${members.length} members`);
            return { employeesPaid, playerProfit };

        } catch (error) {
            console.error('[InnKeeperV4] Error distributing profits:', error);
            return { employeesPaid: false, playerProfit: 0 };
        }
    }

    /**
     * Generate random positions for players on empty floor tiles
     */
    generateRandomPlayerPositions(members, channelId, innDimensions = null) {
        const { generateInnLayout, INN_TILE_TYPES } = require('./imageProcessing/inn-layered-render');
        
        // Use provided dimensions or defaults
        const INN_WIDTH = innDimensions?.width || 10;
        const INN_HEIGHT = innDimensions?.height || 7;
        
        // Get the inn layout to identify empty floor tiles (using channel ID for consistency)
        const layoutResult = generateInnLayout(channelId, { width: INN_WIDTH, height: INN_HEIGHT });
        const layout = layoutResult.layout;
        
        // Find all empty floor tiles (not occupied by tables or chairs)
        const emptyFloorTiles = [];
        for (let y = 0; y < INN_HEIGHT; y++) {
            for (let x = 0; x < INN_WIDTH; x++) {
                if (layout[y][x] === INN_TILE_TYPES.FLOOR) {
                    emptyFloorTiles.push({ x, y });
                }
            }
        }
        
        console.log(`[InnKeeperV4] Found ${emptyFloorTiles.length} empty floor tiles for ${members.length} members`);
        
        // Time-based seeded random function for dynamic positioning
        const timeBasedSeededRandom = (seed, timeOffset = 0) => {
            // Use current time in minutes to change positions every minute
            const currentTimeMinutes = Math.floor((Date.now() + timeOffset) / 60000);
            const combinedSeed = seed + currentTimeMinutes;
            const x = Math.sin(combinedSeed) * 10000;
            return x - Math.floor(x);
        };
        
        // Create time-based seeded shuffle using channel ID and current time
        const channelSeed = parseInt(channelId.replace(/\D/g, '').slice(-8) || '12345678', 10);
        
        // Shuffle the empty floor tiles array with time-based seeded randomness
        for (let i = emptyFloorTiles.length - 1; i > 0; i--) {
            const j = Math.floor(timeBasedSeededRandom(channelSeed + i + 2000) * (i + 1));
            [emptyFloorTiles[i], emptyFloorTiles[j]] = [emptyFloorTiles[j], emptyFloorTiles[i]];
        }
        
        // Assign positions to members with individual time-based movement
        const playerPositions = {};
        members.forEach((member, index) => {
            if (index < emptyFloorTiles.length) {
                // Create individual time offset for each player based on their user ID
                const playerSeed = parseInt(member.id.slice(-8), 10) || (index + 1000);
                const playerTimeOffset = playerSeed % 300000; // Offset up to 5 minutes
                
                // Get time-based position index for this specific player
                const positionIndex = Math.floor(timeBasedSeededRandom(channelSeed + playerSeed + 3000, playerTimeOffset) * emptyFloorTiles.length);
                const position = emptyFloorTiles[positionIndex];
                
                playerPositions[member.id] = {
                    x: position.x,
                    y: position.y
                };
                console.log(`[InnKeeperV4] Assigned ${member.user.username} to time-based position (${position.x}, ${position.y})`);
            } else {
                console.warn(`[InnKeeperV4] No available position for ${member.user.username}, skipping`);
            }
        });
        
        return playerPositions;
    }

    /**
     * Generate positions for customers prioritizing chair tiles, then floor tiles
     */
    generateCustomerPositions(customers, channelId, playerPositions, innDimensions = null) {
        const { generateInnLayout, INN_TILE_TYPES } = require('./imageProcessing/inn-layered-render');
        
        // Use provided dimensions or defaults
        const INN_WIDTH = innDimensions?.width || 10;
        const INN_HEIGHT = innDimensions?.height || 7;
        
        // Get the inn layout to identify available tiles
        const layoutResult = generateInnLayout(channelId, { width: INN_WIDTH, height: INN_HEIGHT });
        const layout = layoutResult.layout;
        
        // Find chair tiles and empty floor tiles not occupied by players
        const chairTiles = [];
        const emptyFloorTiles = [];
        const occupiedPositions = new Set();
        
        // Mark player positions as occupied
        Object.values(playerPositions).forEach(pos => {
            occupiedPositions.add(`${pos.x},${pos.y}`);
        });
        
        // Categorize available tiles
        for (let y = 0; y < INN_HEIGHT; y++) {
            for (let x = 0; x < INN_WIDTH; x++) {
                const posKey = `${x},${y}`;
                if (!occupiedPositions.has(posKey)) {
                    if (layout[y][x] === INN_TILE_TYPES.CHAIR) {
                        chairTiles.push({ x, y, type: 'chair' });
                    } else if (layout[y][x] === INN_TILE_TYPES.FLOOR) {
                        emptyFloorTiles.push({ x, y, type: 'floor' });
                    }
                }
            }
        }
        
        console.log(`[InnKeeperV4] Found ${chairTiles.length} chair tiles and ${emptyFloorTiles.length} floor tiles for ${customers.length} customers`);
        
        // Seeded random function for consistent chair assignment
        const seededRandom = (seed) => {
            const x = Math.sin(seed) * 10000;
            return x - Math.floor(x);
        };
        
        // Time-based seeded random function for floor positioning
        const timeBasedSeededRandom = (seed, timeOffset = 0) => {
            const currentTimeMinutes = Math.floor((Date.now() + timeOffset) / 60000);
            const combinedSeed = seed + currentTimeMinutes;
            const x = Math.sin(combinedSeed) * 10000;
            return x - Math.floor(x);
        };
        
        const channelSeed = parseInt(channelId.replace(/\D/g, '').slice(-8) || '12345678', 10);
        
        // Shuffle chair tiles with channel-based seeded randomness (consistent)
        for (let i = chairTiles.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom(channelSeed + i + 1000) * (i + 1));
            [chairTiles[i], chairTiles[j]] = [chairTiles[j], chairTiles[i]];
        }
        
        // Shuffle floor tiles with time-based seeded randomness (dynamic)
        for (let i = emptyFloorTiles.length - 1; i > 0; i--) {
            const j = Math.floor(timeBasedSeededRandom(channelSeed + i + 4000) * (i + 1));
            [emptyFloorTiles[i], emptyFloorTiles[j]] = [emptyFloorTiles[j], emptyFloorTiles[i]];
        }
        
        // Assign positions to customers (chairs first, then floor)
        const customerPositions = {};
        const availableTiles = [...chairTiles, ...emptyFloorTiles];
        
        customers.forEach((customer, index) => {
            if (index < availableTiles.length) {
                let position;
                
                if (index < chairTiles.length) {
                    // Assign to chair with consistent positioning based on channel seed
                    position = chairTiles[index];
                    console.log(`[InnKeeperV4] Assigned customer ${customer.name} to chair at (${position.x}, ${position.y})`);
                } else {
                    // Assign to floor with time-based positioning
                    const floorIndex = index - chairTiles.length;
                    const customerSeed = parseInt(customer.id.replace(/\D/g, '').slice(-8), 10) || (index + 5000);
                    const customerTimeOffset = customerSeed % 300000; // Offset up to 5 minutes
                    
                    // Get time-based position index for floor tiles
                    const positionIndex = Math.floor(timeBasedSeededRandom(channelSeed + customerSeed + 6000, customerTimeOffset) * emptyFloorTiles.length);
                    position = emptyFloorTiles[positionIndex] || emptyFloorTiles[floorIndex % emptyFloorTiles.length];
                    console.log(`[InnKeeperV4] Assigned customer ${customer.name} to floor at (${position.x}, ${position.y})`);
                }
                
                customerPositions[customer.id] = {
                    x: position.x,
                    y: position.y,
                    tileType: position.type,
                    customer: customer // Include customer data for rendering
                };
            } else {
                console.warn(`[InnKeeperV4] No available position for customer ${customer.name}, skipping`);
            }
        });
        
        return customerPositions;
    }

    /**
     * Generate break-time positions for players (seated on chairs)
     */
    generateBreakPlayerPositions(members, channelId, innDimensions = null) {
        const { generateInnLayout, INN_TILE_TYPES } = require('./imageProcessing/inn-layered-render');
        
        // Use provided dimensions or defaults
        const INN_WIDTH = innDimensions?.width || 10;
        const INN_HEIGHT = innDimensions?.height || 7;
        
        // Get the inn layout to identify chair tiles
        const layoutResult = generateInnLayout(channelId, { width: INN_WIDTH, height: INN_HEIGHT });
        const layout = layoutResult.layout;
        
        // Find all chair tiles for break seating
        const chairTiles = [];
        for (let y = 0; y < INN_HEIGHT; y++) {
            for (let x = 0; x < INN_WIDTH; x++) {
                if (layout[y][x] === INN_TILE_TYPES.CHAIR) {
                    chairTiles.push({ x, y });
                }
            }
        }
        
        console.log(`[InnKeeperV4] Found ${chairTiles.length} chair tiles for ${members.length} members during break`);
        
        // Seeded random function for consistent chair assignment during breaks
        const seededRandom = (seed) => {
            const x = Math.sin(seed) * 10000;
            return x - Math.floor(x);
        };
        
        const channelSeed = parseInt(channelId.replace(/\D/g, '').slice(-8) || '12345678', 10);
        
        // Shuffle chair tiles with channel-based seeded randomness (consistent)
        for (let i = chairTiles.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom(channelSeed + i + 7000) * (i + 1)); // Different seed offset for breaks
            [chairTiles[i], chairTiles[j]] = [chairTiles[j], chairTiles[i]];
        }
        
        // Assign chair positions to members
        const playerPositions = {};
        members.forEach((member, index) => {
            if (index < chairTiles.length) {
                const position = chairTiles[index];
                playerPositions[member.id] = {
                    x: position.x,
                    y: position.y
                };
                console.log(`[InnKeeperV4] Assigned ${member.user.username} to break chair at (${position.x}, ${position.y})`);
            } else {
                // If more members than chairs, place on floor tiles
                const floorTiles = [];
                for (let y = 0; y < INN_HEIGHT; y++) {
                    for (let x = 0; x < INN_WIDTH; x++) {
                        if (layout[y][x] === INN_TILE_TYPES.FLOOR) {
                            floorTiles.push({ x, y });
                        }
                    }
                }
                
                if (floorTiles.length > 0) {
                    const floorIndex = (index - chairTiles.length) % floorTiles.length;
                    const position = floorTiles[floorIndex];
                    playerPositions[member.id] = {
                        x: position.x,
                        y: position.y
                    };
                    console.log(`[InnKeeperV4] Assigned ${member.user.username} to break floor at (${position.x}, ${position.y})`);
                }
            }
        });
        
        return playerPositions;
    }

    /**
     * Process luck-based coin finding for each player in the inn
     */
    async processPlayerCoinFinds(members, channelId, dbEntry) {
        const results = {
            totalCoinsFound: 0,
            coinFindEvents: []
        };

        try {
            const v4State = dbEntry.gameData?.v4State;
            if (!v4State) return results;

            const innDimensions = v4State.innDimensions || { width: 10, height: 7 };
            const baseEarnings = v4State.baseEarnings || 5;
            const innSize = innDimensions.width * innDimensions.height;

            // Import player stats function
            const getPlayerStats = require('../calculatePlayerStat');

            for (const member of members) {
                try {
                    // Get player stats
                    const playerData = await getPlayerStats(member.user.id);
                    const playerLuck = playerData?.stats?.luck || 0;

                    // Calculate chance based on luck vs inn size
                    // Bigger inn = higher chance to find coins (more places to search)
                    const innSizeBonus = Math.min(0.3, (innSize - 70) / 300); // Caps at 30%
                    const luckBonus = playerLuck / 1000; // Luck contributes to chance
                    const findChance = Math.min(0.3, innSizeBonus + luckBonus); // Total chance caps at 30%

                    if (Math.random() < findChance) {
                        // Calculate coins found: luck × base earnings + random roll
                        const baseCoinFind = Math.floor(playerLuck * (baseEarnings / 10)); // Scale luck with base earnings
                        const randomBonus = Math.floor(Math.random() * baseEarnings) + 1; // 1 to baseEarnings
                        const coinsFound = Math.max(1, baseCoinFind + randomBonus);

                        results.totalCoinsFound += coinsFound;
                        results.coinFindEvents.push(`${member.user.username} found ${coinsFound} coins in the inn (luck: ${playerLuck})`);

                        console.log(`[InnKeeperV4] ${member.user.username} found ${coinsFound} coins (luck: ${playerLuck}, chance: ${Math.round(findChance * 100)}%)`);

                        // Add coins directly to player
                        const Money = require('../../models/currency');
                        await Money.findOneAndUpdate(
                            { userId: member.user.id },
                            { 
                                $inc: { money: coinsFound },
                                $set: { usertag: member.user.tag }
                            },
                            { upsert: true, new: true }
                        );

                        // Track money earned from coin finds
                        try {
                            await this.gameStatTracker.trackInnMoneyEarned(member.user.id, channel.guild.id, coinsFound);
                        } catch (error) {
                            console.error('Error tracking coin find money:', error);
                        }
                    }

                } catch (playerError) {
                    console.warn(`[InnKeeperV4] Error processing coin find for ${member.user.username}:`, playerError.message);
                }
            }

            if (results.coinFindEvents.length > 0) {
                console.log(`[InnKeeperV4] Coin finding results: ${results.totalCoinsFound} total coins found by ${results.coinFindEvents.length} players`);
            }

        } catch (error) {
            console.error('[InnKeeperV4] Error processing player coin finds:', error);
        }

        return results;
    }

    /**
     * Get profit distribution breakdown for all VC members
     */
    async getProfitDistributionBreakdown(channel, totalProfit) {
        try {
            // Get inn state for employee information
            const dbEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
            const v4State = dbEntry?.gameData?.v4State;
            const employeeCount = v4State?.employeeCount || 0;
            const baseEarnings = v4State?.baseEarnings || 5;

            // Calculate employee wages
            const totalEmployeeWages = employeeCount * baseEarnings;
            let playerProfit = totalProfit;
            let employeesPaid = true;

            let breakdown = `Total Profit: ${totalProfit} coins\n`;

            // Show employee wages if any
            if (employeeCount > 0) {
                if (totalProfit >= totalEmployeeWages) {
                    breakdown += `Employee Wages: ${totalEmployeeWages} coins (${employeeCount} × ${baseEarnings})\n`;
                    playerProfit = totalProfit - totalEmployeeWages;
                    employeesPaid = true;
                } else {
                    breakdown += `⚠️ Cannot afford employee wages (${totalEmployeeWages} needed)\n`;
                    breakdown += `All employees have left the inn!\n`;
                    playerProfit = totalProfit;
                    employeesPaid = false;
                }
            }

            // Get all members currently in the voice channel
            let voiceChannel = null;
            const textChannelName = channel.name.toLowerCase();
            voiceChannel = channel.guild.channels.cache.find(c => 
                c.type === 2 && // Voice channel
                c.name.toLowerCase().includes(textChannelName.replace(/-/g, ' ')) ||
                textChannelName.includes(c.name.toLowerCase().replace(/-/g, ' '))
            );
            
            if (!voiceChannel || voiceChannel.members.size === 0) {
                voiceChannel = channel.guild.channels.cache.find(c => 
                    c.type === 2 && c.members.size > 0 // Any voice channel with members
                );
            }

            if (!voiceChannel || voiceChannel.members.size === 0) {
                breakdown += 'No members in voice channel to distribute profits to.';
                return breakdown;
            }

            const members = Array.from(voiceChannel.members.values());
            
            if (playerProfit <= 0) {
                breakdown += `Members: ${members.length}\n`;
                breakdown += `Per Member: 0 coins (all profit went to employees)\n`;
                return breakdown;
            }

            const profitPerMember = Math.floor(playerProfit / members.length);
            const remainingProfit = playerProfit - (profitPerMember * members.length);

            breakdown += `Player Share: ${playerProfit} coins\n`;
            breakdown += `Members: ${members.length}\n`;
            breakdown += `Per Member: ${profitPerMember} coins\n\n`;

            // List each member and their share
            members.forEach((member, index) => {
                const memberShare = profitPerMember + (index === 0 ? remainingProfit : 0);
                const username = member.user.username;
                breakdown += `${username}: ${memberShare} coins\n`;
            });

            if (remainingProfit > 0) {
                breakdown += `\n(+${remainingProfit} bonus to ${members[0].user.username})`;
            }

            return breakdown;

        } catch (error) {
            console.error('[InnKeeperV4] Error creating profit breakdown:', error);
            return `Total: ${totalProfit} coins distributed to voice channel members.`;
        }
    }

    /**
     * Create break start embed with profit distribution breakdown
     */
    async createBreakStartEmbed(isLongBreak, cycleCount, breakDuration, breakEndTime, distributedProfit = 0, customerInfo = null, channel = null) {
        // Get profit distribution breakdown
        let profitBreakdown = '';
        if (channel && distributedProfit > 0) {
            profitBreakdown = await this.getProfitDistributionBreakdown(channel, distributedProfit);
        }

        // Create description with profit breakdown
        let description = isLongBreak 
            ? `The inn is closing for an extended break!`
            : `The inn is closing for a break. Time to rest!`;

        if (profitBreakdown) {
            description += `\n\n**💰 Profit Distribution:**\n\`\`\`\n${profitBreakdown}\n\`\`\``;
        }

        const embed = new EmbedBuilder()
            .setTitle(isLongBreak ? '🛌 Extended Break Time!' : '☕ Break Time!')
            .setColor(isLongBreak ? '#e74c3c' : '#f39c12')
            .setDescription(description)
            .addFields(
                { name: '⏳ Reopening At', value: `<t:${Math.floor(breakEndTime / 1000)}:R>`, inline: true }
            );

        // Add customer overnight information if available
        if (customerInfo) {
            const { overnightProfit, customersLeft, customersStayed, reputation } = customerInfo;
            
            if (customersStayed > 0) {
                embed.addFields(
                    { name: '🏨 Overnight Guests', value: `${customersStayed} customers stayed (+${overnightProfit} coins)`, inline: true }
                );
            }
            
            if (customersLeft > 0) {
                embed.addFields(
                    { name: '👋 Departures', value: `${customersLeft} customers left`, inline: true }
                );
            }
            
            embed.addFields(
                { name: '⭐ Inn Reputation', value: `${reputation}/100`, inline: true }
            );
        }

        embed.setTimestamp();
        return embed;
    }

    /**
     * Create work start embed
     */
    createWorkStartEmbed(workDuration, nextBreakTime) {
        const workDurationMinutes = Math.floor(workDuration / 60000);
        
        const embed = new EmbedBuilder()
            .setTitle('🏨 Inn Reopened!')
            .setColor('#2ecc71')
            .setDescription('Break time is over! The inn is back open for business.')
            .addFields(
                { name: '⏰ Work Duration', value: `${workDurationMinutes} minutes`, inline: true },
                { name: '⏳ Next Break At', value: `<t:${Math.floor(nextBreakTime / 1000)}:R>`, inline: true }
            )
            .setTimestamp();

        return embed;
    }

    /**
     * Create work event log embed
     */
    createWorkEventLogEmbed(workEventLog, workStartTime, now, currentProfit = 0, v4State = null) {
        // Defensive check for v4State parameter
        if (typeof v4State === 'undefined') {
            console.error('[InnKeeperV4] v4State is undefined in createWorkEventLogEmbed');
            v4State = null;
        }
        
        // Calculate when the next break will occur
        const workDuration = this.config.TIMING.WORK_DURATION; // 20 minutes
        const nextBreakTime = workStartTime + workDuration;
        const nextBreakTimestamp = Math.floor(nextBreakTime / 1000);
        
        // Format work event log for description (more space than fields)
        let logContent = '';
        if (workEventLog.length === 0) {
            logContent = 'No events yet...';
        } else {
            // Show recent events, but limit to fit in description (2048 chars max)
            const recentEvents = workEventLog.slice(-15); // More events since we have more space
            logContent = recentEvents.map((event, index) => {
                const eventTime = new Date(event.timestamp);
                const timeStr = eventTime.toLocaleTimeString();
                return `${timeStr} - ${event.description}`;
            }).join('\n');
            
            // Check if content is too long for description (leave room for break timestamp)
            const maxDescriptionLength = 1800; // Leave buffer for break timestamp
            if (logContent.length > maxDescriptionLength) {
                // Trim events until it fits
                let trimmedEvents = recentEvents;
                do {
                    trimmedEvents = trimmedEvents.slice(1); // Remove oldest event
                    logContent = trimmedEvents.map((event, index) => {
                        const eventTime = new Date(event.timestamp);
                        const timeStr = eventTime.toLocaleTimeString();
                        return `${timeStr} - ${event.description}`;
                    }).join('\n');
                } while (logContent.length > maxDescriptionLength && trimmedEvents.length > 1);
            }
        }

        const fullDescription = `**Next Break:** <t:${nextBreakTimestamp}:R>\n\n**📋 Recent Events:**\n\`\`\`\n${logContent}\n\`\`\``;

        // Generate customer dialogue from current customers
        const customerDialogue = this.generateCustomerDialogue(v4State?.customers || []);

        const embed = new EmbedBuilder()
            .setTitle('🏨 Inn Work Log')
            .setColor('#3498db')
            .setDescription(fullDescription)
            .addFields(
                { 
                    name: '⭐ Inn Reputation', 
                    value: `${v4State?.innReputation || 5}/100`, 
                    inline: true 
                },
                { 
                    name: '👥 Current Customers', 
                    value: `${(v4State?.customers || []).length}/${v4State?.maxCustomers || 15}`, 
                    inline: true 
                },
                { 
                    name: '💰 Current Profit', 
                    value: `${currentProfit} coins`, 
                    inline: true 
                },
                { 
                    name: '👷 Employees', 
                    value: `${v4State?.employeeCount || 0} hired${(v4State?.employeeCount || 0) > 0 ? ` (${v4State?.baseEarnings || 5}c wage)` : ''}`, 
                    inline: true 
                },
                { 
                    name: '🏢 Inn Level', 
                    value: `Level ${v4State?.innLevel || 1}`, 
                    inline: true 
                },
                { 
                    name: '⚡ Base Earning Power', 
                    value: `${v4State?.baseEarnings || 5} coins`, 
                    inline: true 
                }
            );

        // Add customer dialogue if available
        if (customerDialogue) {
            embed.addFields({
                name: '💬 Inn Chatter',
                value: customerDialogue,
                inline: false
            });
        }

        embed
            .setTimestamp();

        return embed;
    }

    /**
     * Generate customer dialogue from current customers using dialogue pool and NPC data
     */
    generateCustomerDialogue(customers) {
        try {
            if (!customers || customers.length === 0) {
                return null; // No customers, no dialogue
            }

            // Filter customers who can speak (NPCs and player customers)
            const speakingCustomers = customers.filter(customer => 
                customer.npcId || customer.isPlayerCustomer
            );

            if (speakingCustomers.length === 0) {
                return null;
            }

            // Select random customer to speak
            const randomCustomer = speakingCustomers[Math.floor(Math.random() * speakingCustomers.length)];
            
            let dialogue = null;

            if (randomCustomer.npcId) {
                // Use NPC dialogue from npcs.json
                const npcsData = require('../../data/npcs.json');
                const npcData = npcsData.find(npc => npc.id === randomCustomer.npcId);
                
                if (npcData && npcData.dialogue && npcData.dialogue.length > 0) {
                    dialogue = npcData.dialogue[Math.floor(Math.random() * npcData.dialogue.length)];
                }
            } else if (randomCustomer.isPlayerCustomer) {
                // Generate simple dialogue for player customers
                const playerDialogues = [
                    "This place has great atmosphere!",
                    "The service here is excellent.",
                    "I love coming here after shopping.",
                    "The food is worth every coin.",
                    "This inn feels like home.",
                    "Best inn in the area!",
                    "The staff here really knows what they're doing.",
                    "I'll definitely be back again soon."
                ];
                dialogue = playerDialogues[Math.floor(Math.random() * playerDialogues.length)];
            }

            if (dialogue) {
                // Format with customer name and happiness indicator
                const happinessIcon = randomCustomer.happiness >= 70 ? '😊' : 
                                    randomCustomer.happiness >= 40 ? '😐' : '😞';
                return `${happinessIcon} **${randomCustomer.name}**: "${dialogue}"`;
            }

            return null;

        } catch (error) {
            console.error('[InnKeeperV4] Error generating customer dialogue:', error);
            return null;
        }
    }

    /**
     * Update or create work event log embed with inn map
     */
    async updateWorkEventLog(channel, dbEntry, newEvent) {
        try {
            console.log(`[InnKeeperV4] updateWorkEventLog called for channel ${channel.id} with event: ${newEvent.description}`);
            const v4State = dbEntry.gameData?.v4State;
            console.log(`[InnKeeperV4] v4State extracted:`, v4State ? 'exists' : 'null/undefined');
            if (!v4State) {
                console.log('[InnKeeperV4] No v4State found for work event log update');
                return;
            }

            // Add new event to log
            const updatedLog = [...(v4State.workEventLog || []), newEvent];
            
            // Create updated embed
            console.log(`[InnKeeperV4] About to call createWorkEventLogEmbed with v4State:`, v4State ? 'exists' : 'null/undefined');
            const embed = this.createWorkEventLogEmbed(
                updatedLog, 
                new Date(v4State.workStartTime).getTime(), 
                newEvent.timestamp,
                v4State.currentWorkPeriodProfit || 0,
                v4State
            );

            // Generate inn map with current voice chat members
            let mapAttachment = null;
            try {
                // Get members currently in the voice channel associated with this inn
                // First try to find the voice channel linked to this text channel
                let voiceChannel = null;
                
                // Check if this text channel has a linked voice channel (same name or similar)
                const textChannelName = channel.name.toLowerCase();
                voiceChannel = channel.guild.channels.cache.find(c => 
                    c.type === 2 && // Voice channel
                    c.name.toLowerCase().includes(textChannelName.replace(/-/g, ' ')) ||
                    textChannelName.includes(c.name.toLowerCase().replace(/-/g, ' '))
                );
                
                // If no specific match, find any voice channel with members
                if (!voiceChannel || voiceChannel.members.size === 0) {
                    voiceChannel = channel.guild.channels.cache.find(c => 
                        c.type === 2 && c.members.size > 0 // Any voice channel with members
                    );
                }
                
                const members = voiceChannel ? Array.from(voiceChannel.members.values()) : [];
                console.log(`[InnKeeperV4] Found ${members.length} members in voice channel "${voiceChannel?.name || 'none'}" for work log`);
                
                // Get inn dimensions from gameData
                const innDimensions = dbEntry.gameData?.v4State?.innDimensions || { width: 10, height: 7 };
                
                // Generate positions based on event type
                let playerPositions;
                if (newEvent.isBreak) {
                    // During breaks, seat players on chairs
                    playerPositions = this.generateBreakPlayerPositions(members, channel.id, innDimensions);
                } else {
                    // During work, use normal random positioning
                    playerPositions = this.generateRandomPlayerPositions(members, channel.id, innDimensions);
                }
                
                // Add customer positions to the map
                const customers = dbEntry.gameData?.v4State?.customers || [];
                const customerPositions = this.generateCustomerPositions(customers, channel.id, playerPositions, innDimensions);
                
                // Combine player and customer positions for rendering
                const allOccupants = [...members];
                const allPositions = { ...playerPositions };
                
                // Add customers as occupants
                Object.values(customerPositions).forEach(custPos => {
                    // Create a mock member object for customers
                    let customerMember;
                    
                    if (custPos.customer.isPlayerCustomer && custPos.customer.discordMember && custPos.customer.discordMember.user) {
                        // Use actual Discord member for player customers
                        customerMember = {
                            id: custPos.customer.id,
                            user: custPos.customer.discordMember.user,
                            displayName: custPos.customer.discordMember.displayName || custPos.customer.discordMember.user.username || custPos.customer.name,
                            roles: custPos.customer.discordMember.roles || { cache: new Map() },
                            isCustomer: true,
                            isPlayerCustomer: true,
                            customerData: custPos.customer
                        };
                    } else if (custPos.customer.isPlayerCustomer) {
                        // Player customer without Discord member (fallback)
                        customerMember = {
                            id: custPos.customer.id,
                            user: {
                                username: custPos.customer.name,
                                displayAvatarURL: () => custPos.customer.avatar
                            },
                            displayName: custPos.customer.name,
                            roles: { cache: new Map() },
                            isCustomer: true,
                            isPlayerCustomer: true,
                            customerData: custPos.customer
                        };
                    } else {
                        // Use NPC avatar for NPC customers
                        customerMember = {
                            id: custPos.customer.id,
                            user: {
                                username: custPos.customer.name,
                                displayAvatarURL: () => custPos.customer.avatar
                            },
                            displayName: custPos.customer.name,
                            roles: { cache: new Map() },
                            isCustomer: true,
                            isPlayerCustomer: false,
                            customerData: custPos.customer
                        };
                    }
                    
                    allOccupants.push(customerMember);
                    allPositions[custPos.customer.id] = { x: custPos.x, y: custPos.y };
                });
                
                // Generate inn map image with both players and customers
                const mapResult = await generateInnMapImage(channel, allOccupants, allPositions, innDimensions, dbEntry);
                
                // Update customer limit based on chair count
                const newCustomerLimit = mapResult.chairCount + 5;
                if (v4State.maxCustomers !== newCustomerLimit) {
                    await ActiveVCs.findOneAndUpdate(
                        { channelId: channel.id },
                        { $set: { 'gameData.v4State.maxCustomers': newCustomerLimit } }
                    );
                    console.log(`[InnKeeperV4] Updated customer limit to ${newCustomerLimit} (${mapResult.chairCount} chairs + 5)`);
                }
                
                // Create attachment
                mapAttachment = new AttachmentBuilder(mapResult.buffer, { 
                    name: `inn-worklog-${channel.id}-${Date.now()}.png`,
                    description: 'Current inn status with occupants'
                });
                
                console.log(`[InnKeeperV4] Generated inn map for work log with ${members.length} players`);
            } catch (mapError) {
                console.error(`[InnKeeperV4] Error generating inn map for work log:`, mapError);
                // Continue without map attachment
            }

            // Generate shop on each work log update
            try {
                console.log(`[InnKeeperV4] Generating shop for inn work log update`);
                await generateShop(channel, 20, null); // 20 minute closing time, no specific player
            } catch (shopError) {
                console.error(`[InnKeeperV4] Error generating shop for work log:`, shopError);
                // Continue without shop generation
            }

            // Check if embed exceeds character limit (Discord limit is 6000 characters total)
            // Description limit is 2048, but we also need to check total embed size
            const embedLength = JSON.stringify(embed.data).length;
            const descriptionLength = embed.data.description?.length || 0;
            const maxEmbedLength = 5000; // Leave some buffer for total embed
            const maxDescriptionLength = 2000; // Leave buffer for description

            let messageId = v4State.workLogMessageId;

            // Create expansion button with reputation cost
            const expansionButton = new ButtonBuilder()
                .setCustomId(`inn_expand_${channel.id}`)
                .setLabel(`🏗️ Expand Inn ⭐10`)
                .setStyle(v4State.innReputation >= 10 ? ButtonStyle.Success : ButtonStyle.Danger);
            
            // Create level up button (always available, but costs 90 reputation)
            const canLevelUp = v4State.innReputation >= 90;
            const currentLevel = v4State.innLevel || 1;
            
            const levelUpButton = new ButtonBuilder()
                .setCustomId(`inn_levelup_${channel.id}`)
                .setLabel(`⬆️ Level Up Inn ⭐90 (L${currentLevel}→L${currentLevel + 1})`)
                .setStyle(canLevelUp ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(!canLevelUp);
            
            // Create hire employee button
            const baseEarnings = v4State.baseEarnings || 5;
            const hireCost = baseEarnings * 10;
            const employeeCount = v4State.employeeCount || 0;
            
            const hireEmployeeButton = new ButtonBuilder()
                .setCustomId(`inn_hire_employee_${channel.id}`)
                .setLabel(`👥 Hire Employee 💰${hireCost} (${employeeCount})`)
                .setStyle(ButtonStyle.Secondary);
            
            const actionRow = new ActionRowBuilder()
                .addComponents(expansionButton, levelUpButton, hireEmployeeButton);

            // Prepare message content
            const messageContent = {
                embeds: [embed],
                files: mapAttachment ? [mapAttachment] : [],
                components: [actionRow]
            };

            if (embedLength > maxEmbedLength || descriptionLength > maxDescriptionLength || !messageId) {
                // Create new embed if too long or no existing message
                const sentMessage = await channel.send(messageContent);
                messageId = sentMessage.id;
                
                // Update embed count
                const newEmbedCount = (v4State.workLogEmbedCount || 0) + 1;
                
                // Update database with new message ID and reset log to recent events
                await ActiveVCs.findOneAndUpdate(
                    { channelId: channel.id },
                    { 
                        $set: { 
                            'gameData.v4State.workEventLog': updatedLog.slice(-5), // Keep only last 5 events
                            'gameData.v4State.workLogMessageId': messageId,
                            'gameData.v4State.workLogEmbedCount': newEmbedCount
                        }
                    }
                );
                
                console.log(`[InnKeeperV4] Created new work log embed #${newEmbedCount} with inn map for channel ${channel.id}`);
            } else {
                // Edit existing embed
                try {
                    const message = await channel.messages.fetch(messageId);
                    await message.edit(messageContent);
                    
                    // Update database with new log
                    await ActiveVCs.findOneAndUpdate(
                        { channelId: channel.id },
                        { 
                            $set: { 
                                'gameData.v4State.workEventLog': updatedLog
                            }
                        }
                    );
                    
                    console.log(`[InnKeeperV4] Updated work log embed with inn map for channel ${channel.id}`);
                } catch (error) {
                    console.log(`[InnKeeperV4] Failed to edit work log message, creating new one: ${error.message}`);
                    
                    // If editing fails, create new message
                    const sentMessage = await channel.send(messageContent);
                    const newEmbedCount = (v4State.workLogEmbedCount || 0) + 1;
                    
                    await ActiveVCs.findOneAndUpdate(
                        { channelId: channel.id },
                        { 
                            $set: { 
                                'gameData.v4State.workEventLog': updatedLog.slice(-5),
                                'gameData.v4State.workLogMessageId': sentMessage.id,
                                'gameData.v4State.workLogEmbedCount': newEmbedCount
                            }
                        }
                    );
                }
            }

        } catch (error) {
            console.error('[InnKeeperV4] Error updating work event log:', error);
        }
    }

    /**
     * Acquire processing lock
     */
    async acquireLock(channelId, timeout = 5000) {
        const startTime = Date.now();
        
        // Check if already locked and wait briefly
        while (this.processingLocks.has(channelId)) {
            if (Date.now() - startTime > timeout) {
                console.warn(`[InnKeeperV4] Lock acquisition timeout for channel ${channelId}`);
                this.processingLocks.delete(channelId);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.processingLocks.set(channelId, {
            timestamp: Date.now(),
            pid: process.pid
        });
        
        // Auto-release lock after timeout
        setTimeout(() => {
            this.releaseLock(channelId);
        }, timeout);
        
        return true;
    }

    /**
     * Release processing lock
     */
    async releaseLock(channelId) {
        return this.processingLocks.delete(channelId);
    }

    /**
     * Get current state for debugging/monitoring
     */
    async getCurrentState(channelId) {
        const dbEntry = await ActiveVCs.findOne({ channelId }).lean();
        if (!dbEntry || !dbEntry.gameData || !dbEntry.gameData.v4State) {
            return null;
        }

        const v4State = dbEntry.gameData.v4State;
        const now = Date.now();
        
        return {
            workState: v4State.workState,
            cycleCount: v4State.cycleCount,
            workEventCount: v4State.workEventCount || 0,
            currentWorkPeriodProfit: v4State.currentWorkPeriodProfit || 0,
            totalProfit: v4State.totalProfit || 0,
            timeInCurrentState: now - new Date(v4State.lastStateChange).getTime(),
            nextStateChange: this.calculateNextStateChange(v4State, now)
        };
    }

    /**
     * Calculate when next state change should occur
     */
    calculateNextStateChange(v4State, now) {
        if (v4State.workState === 'working') {
            const workStartTime = new Date(v4State.workStartTime).getTime();
            return workStartTime + this.config.TIMING.WORK_DURATION;
        } else if (v4State.workState === 'break' && v4State.breakStartTime) {
            const breakStartTime = new Date(v4State.breakStartTime).getTime();
            const breakDuration = v4State.breakType === 'long' 
                ? this.config.TIMING.LONG_BREAK_DURATION 
                : this.config.TIMING.SHORT_BREAK_DURATION;
            return breakStartTime + breakDuration;
        }
        
        return now;
    }
}

// Create singleton instance
const innKeeperV4Instance = new InnKeeperV4Controller();

// Export as function for game master
module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();
    return await innKeeperV4Instance.processInn(channel, dbEntry, now);
};

// Export class and instance for direct use
module.exports.InnKeeperV4Controller = InnKeeperV4Controller;
module.exports.instance = innKeeperV4Instance;