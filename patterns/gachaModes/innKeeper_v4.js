// InnKeeper V4 - Simplified Basic Break/Work Cycle with Dummy Events
// Features: 20min work shifts -> 5min breaks, every 4th cycle 20min break

const { EmbedBuilder } = require('discord.js');
const ActiveVCs = require('../../models/activevcs');
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
                await this.initializeGameData(channelId, now);
                
                // Get fresh data after initialization
                const freshEntry = await ActiveVCs.findOne({ channelId }).lean();
                if (!freshEntry) {
                    console.error(`[InnKeeperV4] No database entry found for channel ${channelId}`);
                    return;
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
     */
    async initializeGameData(channelId, now) {
        const existingEntry = await ActiveVCs.findOne({ channelId }).lean();
        
        if (!existingEntry) {
            console.error(`[InnKeeperV4] No database entry found for channel ${channelId}`);
            return;
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
                workEventCount: 0               // Count work events for testing
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
        }
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

        // Send break notification
        const breakEndTime = now + breakDuration;
        const embed = this.createBreakStartEmbed(isLongBreak, cycleCount, breakDuration, breakEndTime);

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
            const eventInterval = 30000; // 30 seconds for testing
            const timeSinceLastEvent = now - lastEventTime;
            
            console.log(`[InnKeeperV4] Dummy work event check: ${Math.round(timeSinceLastEvent / 1000)}s since last event, need 30s minimum`);
            
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

            // Update database with new event time and count
            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                { 
                    $set: { 
                        'gameData.v4State.lastWorkEvent': now,
                        'gameData.v4State.workEventCount': newCount
                    }
                }
            );

            // Send dummy event notification
            const embed = new EmbedBuilder()
                .setTitle('🏨 Inn Work Event')
                .setDescription(`Dummy work event #${newCount} - Inn is busy serving customers!`)
                .setColor('#3498db')
                .addFields(
                    { name: '📊 Event Count', value: `${newCount}`, inline: true },
                    { name: '⏰ Time', value: `<t:${Math.floor(now / 1000)}:R>`, inline: true }
                )
                .setTimestamp();

            await channel.send({ embeds: [embed] });

            console.log(`[InnKeeperV4] Dummy work event #${newCount} sent for channel ${channel.id}`);

        } catch (error) {
            console.error('[InnKeeperV4] Error generating dummy work event:', error);
        }
    }

    /**
     * Create break start embed
     */
    createBreakStartEmbed(isLongBreak, cycleCount, breakDuration, breakEndTime) {
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
            )
            .setTimestamp();

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