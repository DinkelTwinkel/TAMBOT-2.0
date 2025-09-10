// InnKeeper V4 - Simplified Basic Break/Work Cycle with Dummy Events
// Features: 20min work shifts -> 5min breaks, every 4th cycle 20min break

const { EmbedBuilder } = require('discord.js');
const ActiveVCs = require('../../models/activevcs');
const Money = require('../../models/currency');
const InnConstants = require('./innKeeping/innConstants');

class InnKeeperV4Controller {
    constructor() {
        // Use centralized constants
        this.config = InnConstants;
        
        this.processingLocks = new Map();
        this.messageCache = new Map();
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

                // If this was a new initialization, create initial work log
                if (wasInitialized) {
                    const initialWorkEvent = {
                        timestamp: now,
                        eventNumber: 0,
                        description: 'Inn initialized - Ready to serve customers!',
                        type: 'inn_init'
                    };
                    await this.updateWorkEventLog(channel, freshEntry, initialWorkEvent);
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
                totalProfit: 0                  // Total profit earned across all periods
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
                await this.startBreak(channel, dbEntry, now);
            } else {
                // Still working - generate dummy work events
                console.log(`[InnKeeperV4] Inn is working, processing work events for ${channel.id}`);
                await this.processDummyWorkEvents(channel, dbEntry, now);
            }
        } else if (currentState === 'break') {
            // Check if break period is complete
            if (this.isBreakPeriodComplete(v4State, now)) {
                const breakEnded = await this.endBreak(channel, dbEntry, now);
                
                // If break ended successfully, fetch fresh data and start work events
                if (breakEnded) {
                    console.log(`[InnKeeperV4] Break ended, fetching fresh data for work events for ${channel.id}`);
                    const freshEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
                    if (freshEntry && freshEntry.gameData?.v4State?.workState === 'working') {
                        // Process work events with fresh data that has reset lastWorkEvent
                        await this.processDummyWorkEvents(channel, freshEntry, now);
                    }
                }
            } else {
                // Still on break
                console.log(`[InnKeeperV4] Still on break for ${channel.id}`);
            }
        }
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

        // Distribute profits to all members in the channel
        await this.distributeProfits(channel, v4State.currentWorkPeriodProfit || 0);

        // Send break notification
        const breakEndTime = now + breakDuration;
        const embed = this.createBreakStartEmbed(isLongBreak, cycleCount, breakDuration, breakEndTime, v4State.currentWorkPeriodProfit || 0);

        await channel.send({ embeds: [embed] });
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

        // Send work restart notification
        const embed = this.createWorkStartEmbed(this.config.TIMING.WORK_DURATION, nextWorkEndTime);

        await channel.send({ embeds: [embed] });
        
        // Create initial work log embed
        const initialWorkEvent = {
            timestamp: now,
            eventNumber: 0,
            description: 'Work period started - Inn is open for business!',
            type: 'work_start'
        };
        
        await this.updateWorkEventLog(channel, updated, initialWorkEvent);
        
        return true;
    }

    /**
     * Process dummy work events for testing
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
                console.log('[InnKeeperV4] Triggering dummy work event');
                await this.generateDummyWorkEvent(channel, dbEntry, now);
            }

        } catch (error) {
            console.error('[InnKeeperV4] Error processing dummy work events:', error);
        }
    }

    /**
     * Generate a dummy work event for testing
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
                return;
            }

            // Get all members currently in the voice channel
            const voiceChannel = channel.guild.channels.cache.find(c => 
                c.type === 2 && c.members.size > 0 // Voice channel with members
            );

            if (!voiceChannel || voiceChannel.members.size === 0) {
                console.log('[InnKeeperV4] No members in voice channel to distribute profits to');
                return;
            }

            const members = Array.from(voiceChannel.members.values());
            const profitPerMember = Math.floor(totalProfit / members.size);
            const remainingProfit = totalProfit - (profitPerMember * members.size);

            console.log(`[InnKeeperV4] Distributing ${totalProfit} coins to ${members.length} members (${profitPerMember} each, ${remainingProfit} remaining)`);

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
                } catch (error) {
                    console.error(`[InnKeeperV4] Error updating remaining money for user ${members[0].id}:`, error);
                }
            }

            console.log(`[InnKeeperV4] Successfully distributed ${totalProfit} coins to ${members.length} members`);

        } catch (error) {
            console.error('[InnKeeperV4] Error distributing profits:', error);
        }
    }

    /**
     * Create break start embed
     */
    createBreakStartEmbed(isLongBreak, cycleCount, breakDuration, breakEndTime, distributedProfit = 0) {
        const breakDurationMinutes = Math.floor(breakDuration / 60000);
        
        const embed = new EmbedBuilder()
            .setTitle(isLongBreak ? '🛌 Extended Break Time!' : '☕ Break Time!')
            .setColor(isLongBreak ? '#e74c3c' : '#f39c12')
            .setDescription(
                isLongBreak 
                    ? `The inn is closing for an extended ${breakDurationMinutes}-minute break after ${cycleCount} work cycles!`
                    : `The inn is closing for a ${breakDurationMinutes}-minute break. Time to rest!`
            )
            .addFields(
                { name: '⏰ Break Duration', value: `${breakDurationMinutes} minutes`, inline: true },
                { name: '🔄 Cycle Count', value: `${cycleCount}`, inline: true },
                { name: '⏳ Reopening At', value: `<t:${Math.floor(breakEndTime / 1000)}:R>`, inline: true }
            );

        // Add profit distribution info if there were profits
        if (distributedProfit > 0) {
            embed.addFields(
                { name: '💰 Profits Distributed', value: `${distributedProfit} coins`, inline: true }
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
    createWorkEventLogEmbed(workEventLog, workStartTime, now, currentProfit = 0) {
        const workDuration = Math.floor((now - workStartTime) / 1000);
        const workMinutes = Math.floor(workDuration / 60);
        const workSeconds = workDuration % 60;
        
        // Format work event log as code blocks
        let logContent = '';
        if (workEventLog.length === 0) {
            logContent = 'No events yet...';
        } else {
            // Show last 10 events to keep embed manageable
            const recentEvents = workEventLog.slice(-10);
            logContent = recentEvents.map((event, index) => {
                const eventTime = new Date(event.timestamp);
                const timeStr = eventTime.toLocaleTimeString();
                return `${timeStr} - ${event.description}`;
            }).join('\n');
        }

        const embed = new EmbedBuilder()
            .setTitle('🏨 Inn Work Log')
            .setColor('#3498db')
            .setDescription(`**Work Period Progress:** ${workMinutes}m ${workSeconds}s`)
            .addFields(
                { 
                    name: '📋 Recent Events', 
                    value: `\`\`\`\n${logContent}\n\`\`\``, 
                    inline: false 
                },
                { 
                    name: '📊 Total Events', 
                    value: `${workEventLog.length}`, 
                    inline: true 
                },
                { 
                    name: '💰 Current Profit', 
                    value: `${currentProfit} coins`, 
                    inline: true 
                }
            )
            .setTimestamp();

        return embed;
    }

    /**
     * Update or create work event log embed
     */
    async updateWorkEventLog(channel, dbEntry, newEvent) {
        try {
            const v4State = dbEntry.gameData?.v4State;
            if (!v4State) {
                console.log('[InnKeeperV4] No v4State found for work event log update');
                return;
            }

            // Add new event to log
            const updatedLog = [...(v4State.workEventLog || []), newEvent];
            
            // Create updated embed
            const embed = this.createWorkEventLogEmbed(
                updatedLog, 
                new Date(v4State.workStartTime).getTime(), 
                newEvent.timestamp,
                v4State.currentWorkPeriodProfit || 0
            );

            // Check if embed exceeds character limit (Discord limit is 6000 characters)
            const embedLength = JSON.stringify(embed.data).length;
            const maxEmbedLength = 5000; // Leave some buffer

            let messageId = v4State.workLogMessageId;

            if (embedLength > maxEmbedLength || !messageId) {
                // Create new embed if too long or no existing message
                const sentMessage = await channel.send({ embeds: [embed] });
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
                
                console.log(`[InnKeeperV4] Created new work log embed #${newEmbedCount} for channel ${channel.id}`);
            } else {
                // Edit existing embed
                try {
                    const message = await channel.messages.fetch(messageId);
                    await message.edit({ embeds: [embed] });
                    
                    // Update database with new log
                    await ActiveVCs.findOneAndUpdate(
                        { channelId: channel.id },
                        { 
                            $set: { 
                                'gameData.v4State.workEventLog': updatedLog
                            }
                        }
                    );
                    
                    console.log(`[InnKeeperV4] Updated work log embed for channel ${channel.id}`);
                } catch (error) {
                    console.log(`[InnKeeperV4] Failed to edit work log message, creating new one: ${error.message}`);
                    
                    // If editing fails, create new message
                    const sentMessage = await channel.send({ embeds: [embed] });
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