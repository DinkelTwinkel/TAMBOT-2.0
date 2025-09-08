// InnKeeper V4 - Core Shift and Break Cycle Management
// Features: 20min work shifts -> 5min breaks, every 4th cycle 20min break

const { EmbedBuilder } = require('discord.js');
const ActiveVCs = require('../../models/activevcs');
const InnConstants = require('./innKeeping/innConstants');
const npcs = require('../../data/npcs.json');
const gachaServers = require('../../data/gachaServers.json');

class InnKeeperV4Controller {
    constructor() {
        // Use centralized constants
        this.config = InnConstants;
        
        this.processingLocks = new Map();
        this.messageCache = new Map();
        this.lastStatusUpdate = new Map(); // Track last status update time per channel
    }

    /**
     * Main processing loop for InnKeeper V4
     */
    async processInn(channel, dbEntry, now) {
        const channelId = channel.id;
        console.log(`[InnKeeperV4] processInn called for ${channelId}`);
        
        try {
        // Acquire processing lock
        if (!await this.acquireLock(channelId, this.config.TIMING.LOCK_TIMEOUT)) {
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
                
                // Update status embed every 5 seconds
                await this.updateStatusEmbed(channel, freshEntry, now);
                
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
        const needsWorkEventsInit = !existingEntry.gameData.v4State?.workEvents;
        
        if (needsInit || needsWorkEventsInit) {
            // Get inn type from gachaServers to determine max employees
            const innType = await this.getInnType(channelId);
            const maxEmployees = this.getMaxEmployees(innType?.rarity || 'common');
            
            let initData = {};
            
            if (needsInit) {
                // Full initialization for new inns
                const v4State = {
                    workState: 'working',           // 'working' | 'break'
                    workStartTime: new Date(now),
                    cycleCount: 0,                  // Track cycles for long break
                    totalCycles: 0,                 // Total cycles completed
                    lastStateChange: new Date(now),
                    breakType: null,                // 'short' | 'long'
                    innType: innType,               // Store inn information
                    maxEmployees: maxEmployees,     // Maximum employees this inn can have
                    reputation: this.config.REPUTATION.STARTING_REPUTATION,  // Inn reputation starts at 0
                    wealth: this.config.WEALTH.STARTING_WEALTH,              // Inn wealth starts at 100
                    lastWorkEvent: 0,               // Track last work event time
                    workEvents: []                  // Store work events for display
                };

                initData = {
                    'gameData.gamemode': 'innkeeper_v4',
                    'gameData.v4State': v4State,
                    'gameData.employees': [],       // Array of employee objects
                    'gameData.lastActivity': new Date(now)
                };
                
                console.log(`[InnKeeperV4] Full initialization for channel ${channelId}`);
            } else if (needsWorkEventsInit) {
                // Just add workEvents to existing v4State
                initData = {
                    'gameData.v4State.workEvents': [],
                    'gameData.v4State.lastWorkEvent': 0
                };
                
                console.log(`[InnKeeperV4] Adding workEvents to existing inn ${channelId}`);
            }

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
                // Still working - generate work events and update display
                console.log(`[InnKeeperV4] Inn is working, processing work events for ${channel.id}`);
                await this.processWorkEvents(channel, dbEntry, now);
                await this.updateWorkDisplay(channel, v4State, now);
            }
        } else if (currentState === 'break') {
            // Check if break period is complete
            if (this.isBreakPeriodComplete(v4State, now)) {
                await this.endBreak(channel, dbEntry, now);
            } else {
                // Still on break - update break display
                await this.updateBreakDisplay(channel, v4State, now);
            }
        }
    }

    /**
     * Check if work period is complete
     */
    isWorkPeriodComplete(v4State, now) {
        const workStartTime = new Date(v4State.workStartTime).getTime();
        const workDuration = this.config.TIMING.WORK_DURATION;
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
            ? this.config.TIMING.LONG_BREAK_DURATION 
            : this.config.TIMING.SHORT_BREAK_DURATION;
        const timeSinceBreakStart = now - breakStartTime;
        
        return timeSinceBreakStart >= breakDuration;
    }

    /**
     * Start break period
     */
    async startBreak(channel, dbEntry, now) {
        const v4State = dbEntry.gameData.v4State;
        const cycleCount = v4State.cycleCount + 1;
        const isLongBreak = cycleCount % this.config.TIMING.LONG_BREAK_CYCLE === 0;
        const breakType = isLongBreak ? 'long' : 'short';
        const breakDuration = isLongBreak 
            ? this.config.TIMING.LONG_BREAK_DURATION 
            : this.config.TIMING.SHORT_BREAK_DURATION;

        console.log(`[InnKeeperV4] Starting ${breakType} break for channel ${channel.id}, cycle ${cycleCount}`);

        // Update state atomically
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
                },
                $inc: {
                    'gameData.v4State.totalCycles': 1
                }
            },
            { new: true }
        );

        if (!updated) {
            console.log('[InnKeeperV4] Failed to start break - state already changed');
            return false;
        }

        // Award reputation for completing work cycle
        await this.awardWorkCycleReputation(channel, cycleCount, isLongBreak);

        // Distribute wealth to users in channel
        await this.distributeWealth(channel, updated, now);

        // Process break events (employee hiring, etc.)
        await this.processBreakEvents(channel, updated, now);

        // Send break notification with enhanced embed
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

        // Update state atomically
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
     * Update work display
     */
    async updateWorkDisplay(channel, v4State, now) {
        const workStartTime = new Date(v4State.workStartTime).getTime();
        const workEndTime = workStartTime + this.config.TIMING.WORK_DURATION;
        const timeRemaining = workEndTime - now;
        const minutesRemaining = Math.max(0, Math.floor(timeRemaining / 60000));

        // Only show countdown in last few minutes to avoid spam
        const countdownThreshold = Math.floor(this.config.TIMING.WORK_COUNTDOWN_THRESHOLD / 60000);
        if (minutesRemaining <= countdownThreshold && minutesRemaining > 0) {
            const embed = new EmbedBuilder()
                .setTitle('🏨 Inn Working')
                .setColor(this.config.DISPLAY.COLORS.WORKING)
                .setDescription(`Work shift in progress...`)
                .addFields(
                    { name: '⏰ Time Remaining', value: `${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}`, inline: true },
                    { name: '🔄 Current Cycle', value: `${v4State.cycleCount + 1}`, inline: true }
                )
                .setTimestamp();

            await this.sendOrUpdateMessage(channel, { embeds: [embed] }, 'work', true);
        }
    }

    /**
     * Update break display
     */
    async updateBreakDisplay(channel, v4State, now) {
        const breakStartTime = new Date(v4State.breakStartTime).getTime();
        const breakDuration = v4State.breakType === 'long' 
            ? this.config.TIMING.LONG_BREAK_DURATION 
            : this.config.TIMING.SHORT_BREAK_DURATION;
        const breakEndTime = breakStartTime + breakDuration;
        const timeRemaining = breakEndTime - now;
        const minutesRemaining = Math.max(0, Math.floor(timeRemaining / 60000));

        // Only show countdown in last few minutes to avoid spam
        const countdownThreshold = Math.floor(this.config.TIMING.BREAK_COUNTDOWN_THRESHOLD / 60000);
        if (minutesRemaining <= countdownThreshold && minutesRemaining > 0) {
            const isLongBreak = v4State.breakType === 'long';
            const embed = new EmbedBuilder()
                .setTitle(isLongBreak ? '🛌 Extended Break' : '☕ Break Time')
                .setColor(isLongBreak ? this.config.DISPLAY.COLORS.LONG_BREAK : this.config.DISPLAY.COLORS.SHORT_BREAK)
                .setDescription(`${isLongBreak ? 'Extended break' : 'Break'} in progress...`)
                .addFields(
                    { name: '⏰ Time Remaining', value: `${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}`, inline: true },
                    { name: '🔄 Cycle Count', value: `${v4State.cycleCount}`, inline: true }
                )
                .setTimestamp();

            await this.sendOrUpdateMessage(channel, { embeds: [embed] }, 'break', true);
        }
    }

    /**
     * Send or update message with edit-first approach
     */
    async sendOrUpdateMessage(channel, messageData, messageType, isUpdate = false) {
        try {
            const cacheKey = `${channel.id}_${messageType}`;
            const cachedMessageId = this.messageCache.get(cacheKey);
            
            // Try to edit existing message first
            if (cachedMessageId) {
                try {
                    const existingMessage = await channel.messages.fetch(cachedMessageId);
                    await existingMessage.edit(messageData);
                    return existingMessage;
                } catch (err) {
                    this.messageCache.delete(cacheKey);
                }
            }

            // Search for existing message in recent messages
            const messages = await channel.messages.fetch({ limit: this.config.DISPLAY.EDIT_SEARCH_LIMIT });
            for (const message of messages.values()) {
                if (message.author.bot && 
                    message.embeds.length > 0 && 
                    this.isInnKeeperMessage(message.embeds[0], messageType)) {
                    await message.edit(messageData);
                    this.messageCache.set(cacheKey, message.id);
                    return message;
                }
            }

            // Only create new message if not an update or no existing message found
            if (!isUpdate) {
                const newMessage = await channel.send(messageData);
                this.messageCache.set(cacheKey, newMessage.id);
                return newMessage;
            }

        } catch (error) {
            console.error('[InnKeeperV4] Error sending/updating message:', error);
            return null;
        }
    }

    /**
     * Check if message is an InnKeeper message of specific type
     */
    isInnKeeperMessage(embed, messageType) {
        if (!embed.title) return false;
        
        const title = embed.title.toLowerCase();
        
        if (messageType === 'work') {
            return title.includes('inn working') || title.includes('inn reopened');
        } else if (messageType === 'break') {
            return title.includes('break time') || title.includes('extended break');
        }
        
        return false;
    }

    /**
     * Acquire processing lock
     */
    async acquireLock(channelId, timeout = this.config.TIMING.LOCK_TIMEOUT) {
        if (this.processingLocks.has(channelId)) {
            return false;
        }
        
        this.processingLocks.set(channelId, Date.now());
        
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
            totalCycles: v4State.totalCycles,
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

    /**
     * Update status embed every 5 seconds
     */
    async updateStatusEmbed(channel, dbEntry, now) {
        try {
            const channelId = channel.id;
            const lastUpdate = this.lastStatusUpdate.get(channelId) || 0;
            
            // Only update every 5 seconds
            if (now - lastUpdate < this.config.DISPLAY.STATUS_UPDATE_INTERVAL) {
                console.log(`[InnKeeperV4] Skipping status update - only ${Math.round((now - lastUpdate) / 1000)}s since last update`);
                return;
            }
            
            console.log(`[InnKeeperV4] Updating status embed for ${channelId}`);

            const v4State = dbEntry.gameData?.v4State;
            if (!v4State) {
                return;
            }

            // Create status embed
            const statusEmbed = this.createStatusEmbed(v4State, dbEntry, now, channel);
            
            // Try to edit existing status message first
            const existingMessage = await this.findExistingStatusMessage(channel);
            
            if (existingMessage) {
                try {
                    await existingMessage.edit({ embeds: [statusEmbed] });
                    console.log(`[InnKeeperV4] Successfully edited existing status message for ${channelId}`);
                    this.lastStatusUpdate.set(channelId, now);
                    return;
                } catch (editError) {
                    console.log(`[InnKeeperV4] Failed to edit existing status message for ${channelId}, creating new one:`, editError.message);
                }
            }

            // Create new status message
            const newMessage = await channel.send({ embeds: [statusEmbed] });
            console.log(`[InnKeeperV4] Created new status message for ${channelId}`);
            this.messageCache.set(`${channelId}_status`, newMessage.id);
            this.lastStatusUpdate.set(channelId, now);

        } catch (error) {
            console.error('[InnKeeperV4] Error updating status embed:', error);
        }
    }

    /**
     * Find existing status message in last 3 messages
     */
    async findExistingStatusMessage(channel) {
        try {
            // Check cache first
            const cachedMessageId = this.messageCache.get(`${channel.id}_status`);
            if (cachedMessageId) {
                try {
                    const cachedMessage = await channel.messages.fetch(cachedMessageId);
                    if (this.isStatusMessage(cachedMessage)) {
                        return cachedMessage;
                    }
                } catch (err) {
                    this.messageCache.delete(`${channel.id}_status`);
                }
            }

            // Search last 3 messages for status embed
            const messages = await channel.messages.fetch({ limit: 3 });
            for (const message of messages.values()) {
                if (this.isStatusMessage(message)) {
                    this.messageCache.set(`${channel.id}_status`, message.id);
                    return message;
                }
            }

            return null;
        } catch (error) {
            console.error('[InnKeeperV4] Error finding existing status message:', error);
            return null;
        }
    }

    /**
     * Check if message is a status message
     */
    isStatusMessage(message) {
        return message.author.bot && 
               message.embeds.length > 0 && 
               (message.embeds[0].title?.includes('Inn Status') || 
                message.embeds[0].title?.startsWith('📊'));
    }

    /**
     * Create current inn status embed
     */
    createStatusEmbed(v4State, dbEntry, now, channel = null) {
        const currentState = v4State.workState;
        const employees = dbEntry.gameData?.employees || [];
        const maxEmployees = v4State.maxEmployees || 2;
        const innType = v4State.innType;
        const wealth = v4State.wealth || 0;
        const workEvents = v4State.workEvents || [];

        let timeRemaining = 0;
        let nextStateTime = 0;
        let stateDescription = '';
        let color = this.config.DISPLAY.COLORS.INFO;

        if (currentState === 'working') {
            const workStartTime = new Date(v4State.workStartTime).getTime();
            const workEndTime = workStartTime + this.config.TIMING.WORK_DURATION;
            timeRemaining = Math.max(0, workEndTime - now);
            nextStateTime = workEndTime;
            stateDescription = '🏨 Currently Working';
            color = this.config.DISPLAY.COLORS.WORKING;
        } else if (currentState === 'break') {
            const breakStartTime = new Date(v4State.breakStartTime).getTime();
            const breakDuration = v4State.breakType === 'long' 
                ? this.config.TIMING.LONG_BREAK_DURATION 
                : this.config.TIMING.SHORT_BREAK_DURATION;
            const breakEndTime = breakStartTime + breakDuration;
            timeRemaining = Math.max(0, breakEndTime - now);
            nextStateTime = breakEndTime;
            
            if (v4State.breakType === 'long') {
                stateDescription = '🛌 Extended Break';
                color = this.config.DISPLAY.COLORS.LONG_BREAK;
            } else {
                stateDescription = '☕ Short Break';
                color = this.config.DISPLAY.COLORS.SHORT_BREAK;
            }
        }

        // Format time remaining
        const minutesLeft = Math.floor(timeRemaining / 60000);
        const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
        const timeLeftDisplay = minutesLeft > 0 
            ? `${minutesLeft}m ${secondsLeft}s`
            : `${secondsLeft}s`;

        // Use channel name as title, fallback to generic title
        const title = channel ? `📊 ${channel.name}` : '📊 Inn Status';
        
        // Get wealth tier for display
        const wealthTier = this.getWealthTier(wealth);
        
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setDescription(stateDescription)
            .addFields(
                { name: '⏰ Time Remaining', value: timeLeftDisplay, inline: true },
                { name: '🔄 Cycle', value: `${v4State.cycleCount + (currentState === 'working' ? 1 : 0)}`, inline: true },
                { name: '👥 Staff', value: `${employees.length}/${maxEmployees}`, inline: true },
                { name: `${wealthTier.emoji} Wealth`, value: `${wealth} (${wealthTier.name})`, inline: true }
            )
            .setTimestamp();

        // Add next state change timestamp
        if (nextStateTime > now) {
            embed.addFields({
                name: currentState === 'working' ? '⏳ Break Starts' : '🏨 Work Resumes',
                value: `<t:${Math.floor(nextStateTime / 1000)}:R>`,
                inline: false
            });
        }

        // Add work events log
        if (workEvents.length > 0) {
            const eventsLog = this.formatWorkEventsLog(workEvents, now);
            if (eventsLog) {
                embed.addFields({
                    name: '📜 Recent Work Events',
                    value: eventsLog,
                    inline: false
                });
            }
        }

        // Add inn type and reputation if available
        if (innType) {
            const reputation = v4State.reputation || 0;
            embed.setFooter({ 
                text: `${innType.name} • ${innType.rarity} • Reputation ${reputation}` 
            });
        }

        return embed;
    }

    /**
     * Format work events log for display in code block
     */
    formatWorkEventsLog(workEvents, now) {
        if (!workEvents || workEvents.length === 0) return null;

        // Sort events by timestamp (most recent first for display)
        const sortedEvents = workEvents
            .slice() // Create a copy
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 10); // Show last 10 events

        let logText = '';
        
        for (const event of sortedEvents) {
            const timeAgo = this.formatTimeAgo(now - event.timestamp);
            const profitText = event.profit > 0 ? `+${event.profit}c` : `${event.profit}c`;
            const repText = event.reputationChange !== 0 ? 
                (event.reputationChange > 0 ? ` +${event.reputationChange}rep` : ` ${event.reputationChange}rep`) : '';
            
            // Use different icons for positive/negative events
            const icon = event.type === 'positive' ? '💰' : '💸';
            
            logText += `${icon} ${event.name} (${timeAgo})\n`;
            logText += `   ${profitText}${repText}\n`;
        }

        // Wrap in code block and ensure it fits Discord's field limit (1024 chars)
        const wrappedLog = `\`\`\`\n${logText}\`\`\``;
        
        if (wrappedLog.length > 1020) {
            // Truncate if too long
            const truncated = logText.substring(0, 1010 - 20) + '\n...\n';
            return `\`\`\`\n${truncated}\`\`\``;
        }
        
        return wrappedLog;
    }

    /**
     * Format time ago in human readable format
     */
    formatTimeAgo(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        
        if (minutes > 0) {
            return `${minutes}m ago`;
        } else if (seconds > 0) {
            return `${seconds}s ago`;
        } else {
            return 'just now';
        }
    }

    /**
     * Award reputation for completing work cycle
     */
    async awardWorkCycleReputation(channel, cycleCount, isLongBreak) {
        try {
            let reputationGain = this.config.REPUTATION.REPUTATION_GAIN.SUCCESSFUL_WORK_CYCLE;
            
            // Bonus reputation for completing long break cycle
            if (isLongBreak) {
                reputationGain += this.config.REPUTATION.REPUTATION_GAIN.LONG_BREAK_COMPLETED;
            }

            // Update reputation in database (avoid MongoDB conflict)
            const currentEntry = await ActiveVCs.findOne({ channelId: channel.id });
            const currentRep = currentEntry?.gameData?.v4State?.reputation || 0;
            const newRep = Math.min(
                this.config.REPUTATION.MAX_REPUTATION, 
                currentRep + reputationGain
            );
            
            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                { 
                    $set: { 
                        'gameData.v4State.reputation': newRep 
                    }
                }
            );

            console.log(`[InnKeeperV4] Awarded ${reputationGain} reputation for ${isLongBreak ? 'long break' : 'work'} cycle completion`);

        } catch (error) {
            console.error('[InnKeeperV4] Error awarding work cycle reputation:', error);
        }
    }

    /**
     * Get wealth tier for display
     */
    getWealthTier(wealth) {
        const tiers = this.config.WEALTH.WEALTH_TIERS;
        for (const tier of Object.values(tiers)) {
            if (wealth >= tier.min && wealth <= tier.max) {
                return tier;
            }
        }
        return tiers.POOR; // Fallback
    }

    /**
     * Process work period events (profit/loss events)
     */
    async processWorkEvents(channel, dbEntry, now) {
        try {
            const v4State = dbEntry.gameData?.v4State;
            if (!v4State) {
                console.log('[InnKeeperV4] No v4State found for work events');
                return;
            }

            const lastEventTime = v4State.lastWorkEvent || 0;
            const eventFreq = this.config.WORK_EVENTS.EVENT_FREQUENCY;
            
            // Use minimum interval for consistent event generation
            const minInterval = eventFreq.MIN_INTERVAL;
            const timeSinceLastEvent = now - lastEventTime;
            
            console.log(`[InnKeeperV4] Work event check: ${Math.round(timeSinceLastEvent / 1000)}s since last event, need ${Math.round(minInterval / 1000)}s minimum`);
            
            // Check if enough time has passed for next event (use minimum interval)
            if (timeSinceLastEvent >= minInterval) {
                console.log('[InnKeeperV4] Triggering work event generation');
                await this.generateWorkEvent(channel, dbEntry, now);
            }

        } catch (error) {
            console.error('[InnKeeperV4] Error processing work events:', error);
        }
    }

    /**
     * Generate a random work event
     */
    async generateWorkEvent(channel, dbEntry, now) {
        try {
            console.log('[InnKeeperV4] Starting work event generation');
            const v4State = dbEntry.gameData?.v4State;
            const reputation = v4State?.reputation || 0;
            
            // Determine if event is positive or negative
            const eventFreq = this.config.WORK_EVENTS.EVENT_FREQUENCY;
            const isPositive = Math.random() < eventFreq.POSITIVE_EVENT_CHANCE;
            console.log(`[InnKeeperV4] Event type: ${isPositive ? 'positive' : 'negative'}, reputation: ${reputation}`);
            
            // Select event
            const selectedEvent = this.selectWorkEvent(reputation, isPositive);
            if (!selectedEvent) {
                console.log('[InnKeeperV4] No event selected');
                return;
            }
            console.log(`[InnKeeperV4] Selected event: ${selectedEvent.name}`);

            // Calculate profit/loss
            const profitRange = selectedEvent.profitRange;
            const profit = Math.floor(Math.random() * (profitRange[1] - profitRange[0] + 1)) + profitRange[0];
            
            // Apply effects
            const updateData = {
                $set: { 'gameData.v4State.lastWorkEvent': now },
                $inc: {}
            };

            // Update wealth (with bounds)
            const currentWealth = v4State?.wealth || 0;
            const newWealth = Math.max(
                this.config.WEALTH.MIN_WEALTH, 
                Math.min(
                    this.config.WEALTH.MAX_WEALTH, 
                    currentWealth + profit
                )
            );
            updateData.$set['gameData.v4State.wealth'] = newWealth;

            // Update reputation (avoid MongoDB conflict by calculating manually)
            if (selectedEvent.reputationGain > 0) {
                const currentRep = v4State?.reputation || 0;
                const newRep = Math.min(
                    this.config.REPUTATION.MAX_REPUTATION, 
                    currentRep + selectedEvent.reputationGain
                );
                updateData.$set['gameData.v4State.reputation'] = newRep;
            } else if (selectedEvent.reputationLoss > 0) {
                const currentRep = v4State?.reputation || 0;
                const newRep = Math.max(0, currentRep - selectedEvent.reputationLoss);
                updateData.$set['gameData.v4State.reputation'] = newRep;
            }

            // Create event record for display
            const eventRecord = {
                timestamp: now,
                name: selectedEvent.name,
                description: selectedEvent.description,
                profit: profit,
                reputationChange: selectedEvent.reputationGain > 0 ? selectedEvent.reputationGain : 
                                 (selectedEvent.reputationLoss > 0 ? -selectedEvent.reputationLoss : 0),
                type: isPositive ? 'positive' : 'negative'
            };

            // Add event to workEvents array (keep last 15 events)
            const currentEvents = v4State?.workEvents || [];
            currentEvents.push(eventRecord);
            
            // Keep only the last 15 events
            const maxEvents = 15;
            if (currentEvents.length > maxEvents) {
                currentEvents.splice(0, currentEvents.length - maxEvents);
            }
            
            updateData.$set['gameData.v4State.workEvents'] = currentEvents;

            // Update database
            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                updateData
            );

            console.log(`[InnKeeperV4] Work event completed: ${selectedEvent.name} - Profit: ${profit}, New Wealth: ${newWealth}`);

        } catch (error) {
            console.error('[InnKeeperV4] Error generating work event:', error);
        }
    }

    /**
     * Select a work event based on type and reputation
     */
    selectWorkEvent(reputation, isPositive) {
        const events = isPositive 
            ? this.config.WORK_EVENTS.POSITIVE_EVENTS 
            : this.config.WORK_EVENTS.NEGATIVE_EVENTS;

        console.log(`[InnKeeperV4] Available ${isPositive ? 'positive' : 'negative'} events:`, Object.keys(events));

        // Filter eligible events
        const eligibleEvents = [];
        for (const [eventKey, eventData] of Object.entries(events)) {
            if (eventData.canHappen()) {
                // Check reputation requirement for positive events
                if (isPositive && eventData.minReputation && reputation < eventData.minReputation) {
                    console.log(`[InnKeeperV4] Event ${eventKey} requires ${eventData.minReputation} reputation, have ${reputation}`);
                    continue;
                }
                eligibleEvents.push({ key: eventKey, ...eventData });
            }
        }

        console.log(`[InnKeeperV4] Eligible events:`, eligibleEvents.map(e => e.key));

        if (eligibleEvents.length === 0) {
            console.log('[InnKeeperV4] No eligible events found');
            return null;
        }

        // Calculate total weight
        const totalWeight = eligibleEvents.reduce((sum, event) => sum + event.weight, 0);
        
        // Select random event based on weight
        let randomValue = Math.random() * totalWeight;
        
        for (const event of eligibleEvents) {
            randomValue -= event.weight;
            if (randomValue <= 0) {
                return event;
            }
        }

        return eligibleEvents[eligibleEvents.length - 1];
    }

    /**
     * Send work event notification
     */
    async sendWorkEventNotification(channel, event, profit, wealthChange) {
        try {
            let color = this.config.DISPLAY.COLORS.INFO;
            let emoji = '📋';

            // Set color and emoji based on profit
            if (profit > 0) {
                color = this.config.DISPLAY.COLORS.SUCCESS;
                emoji = '💰';
            } else if (profit < 0) {
                color = this.config.DISPLAY.COLORS.ERROR;
                emoji = '💸';
            }

            const embed = new EmbedBuilder()
                .setTitle(`${emoji} ${event.name}`)
                .setDescription(event.description)
                .setColor(color)
                .setTimestamp();

            // Add effect fields
            const effects = [];
            if (profit !== 0) {
                effects.push(`**Profit**: ${profit > 0 ? '+' : ''}${profit} coins`);
            }
            if (event.reputationGain > 0) {
                effects.push(`**Reputation**: +${event.reputationGain}`);
            }
            if (event.reputationLoss > 0) {
                effects.push(`**Reputation**: -${event.reputationLoss}`);
            }

            if (effects.length > 0) {
                embed.addFields({
                    name: '📈 Effects',
                    value: effects.join('\n'),
                    inline: false
                });
            }

            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('[InnKeeperV4] Error sending work event notification:', error);
        }
    }

    /**
     * Distribute 30% of inn wealth to users in voice channel
     */
    async distributeWealth(channel, dbEntry, now) {
        try {
            const Money = require('../../models/currency');
            const currentWealth = dbEntry.gameData?.v4State?.wealth || 0;
            
            if (currentWealth <= 0) {
                console.log('[InnKeeperV4] No wealth to distribute');
                return;
            }

            // Get members in voice channel (excluding bots)
            const membersInVC = Array.from(channel.members.values()).filter(m => !m.user.bot);
            
            if (membersInVC.length === 0) {
                console.log('[InnKeeperV4] No members in VC for wealth distribution');
                return;
            }

            // Calculate payout (30% of current wealth)
            const payoutPercentage = 0.3;
            const totalPayout = Math.floor(currentWealth * payoutPercentage);
            const payoutPerMember = Math.floor(totalPayout / membersInVC.length);
            
            if (payoutPerMember <= 0) {
                console.log('[InnKeeperV4] Payout too small to distribute');
                return;
            }

            // Calculate actual total distributed (accounting for rounding)
            const actualTotalPayout = payoutPerMember * membersInVC.length;
            const newWealth = currentWealth - actualTotalPayout;

            // Update inn wealth
            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                { $set: { 'gameData.v4State.wealth': newWealth } }
            );

            // Award coins to each member
            const payoutResults = [];
            for (const member of membersInVC) {
                try {
                    await Money.findOneAndUpdate(
                        { userId: member.id },
                        { $inc: { money: payoutPerMember } },
                        { upsert: true, new: true }
                    );
                    
                    payoutResults.push({
                        member: member,
                        amount: payoutPerMember
                    });
                    
                    console.log(`[InnKeeperV4] Paid ${payoutPerMember} coins to ${member.displayName}`);
                } catch (payoutError) {
                    console.error(`[InnKeeperV4] Error paying ${member.id}:`, payoutError);
                }
            }

            // Send payout notification
            if (payoutResults.length > 0) {
                await this.sendPayoutNotification(channel, payoutResults, actualTotalPayout, newWealth, currentWealth);
            }

        } catch (error) {
            console.error('[InnKeeperV4] Error distributing wealth:', error);
        }
    }

    /**
     * Send wealth distribution notification
     */
    async sendPayoutNotification(channel, payoutResults, totalPayout, newWealth, oldWealth) {
        try {
            const wealthTier = this.getWealthTier(newWealth);
            
            const embed = new EmbedBuilder()
                .setTitle('💰 Inn Profits Distributed!')
                .setDescription(`The inn shares its success with everyone who helped make it prosper!`)
                .setColor(this.config.DISPLAY.COLORS.PROFIT)
                .setTimestamp();

            // Add payout summary
            embed.addFields(
                { name: '💵 Total Distributed', value: `${totalPayout} coins (30% of wealth)`, inline: true },
                { name: '👥 Recipients', value: `${payoutResults.length} members`, inline: true },
                { name: '💰 Per Person', value: `${payoutResults[0]?.amount || 0} coins`, inline: true }
            );

            // Show individual payouts
            const payoutText = payoutResults
                .map(result => `${result.member.displayName}: **${result.amount}** coins`)
                .join('\n');

            if (payoutText.length <= 1024) {
                embed.addFields({
                    name: '🎯 Individual Payouts',
                    value: payoutText,
                    inline: false
                });
            }

            // Show wealth status
            embed.addFields({
                name: `${wealthTier.emoji} Remaining Wealth`,
                value: `${newWealth} coins (${wealthTier.name})`,
                inline: false
            });

            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('[InnKeeperV4] Error sending payout notification:', error);
        }
    }

    // === EMPLOYEE MANAGEMENT SYSTEM ===

    /**
     * Get inn type from gachaServers based on channel configuration
     */
    async getInnType(channelId) {
        try {
            // Get the database entry to find the typeId
            const dbEntry = await ActiveVCs.findOne({ channelId }).lean();
            if (!dbEntry || !dbEntry.typeId) {
                console.log(`[InnKeeperV4] No typeId found for channel ${channelId}, using default`);
                return gachaServers.find(server => server.type === 'innkeeper') || null;
            }

            // Find the inn type in gachaServers
            const innType = gachaServers.find(server => server.id === dbEntry.typeId);
            if (!innType) {
                console.log(`[InnKeeperV4] Inn type ${dbEntry.typeId} not found in gachaServers`);
                return gachaServers.find(server => server.type === 'innkeeper') || null;
            }

            return innType;
        } catch (error) {
            console.error('[InnKeeperV4] Error getting inn type:', error);
            return gachaServers.find(server => server.type === 'innkeeper') || null;
        }
    }

    /**
     * Get maximum employees based on inn rarity
     */
    getMaxEmployees(rarity) {
        return this.config.EMPLOYEES.INN_SIZES[rarity] || this.config.EMPLOYEES.INN_SIZES.common;
    }

    /**
     * Process break events using the weighted event system
     */
    async processBreakEvents(channel, dbEntry, now) {
        try {
            const employees = dbEntry.gameData?.employees || [];
            const maxEmployees = dbEntry.gameData?.v4State?.maxEmployees || 2;
            const reputation = dbEntry.gameData?.v4State?.reputation || 0;
            const isLongBreak = dbEntry.gameData?.v4State?.breakType === 'long';

            // Select event using weighted system
            const selectedEvent = this.selectBreakEvent(employees, maxEmployees, reputation, isLongBreak);
            
            if (selectedEvent) {
                console.log(`[InnKeeperV4] Processing ${isLongBreak ? 'long' : 'short'} break event: ${selectedEvent.name}`);
                await this.executeBreakEvent(channel, dbEntry, selectedEvent, now);
            } else {
                console.log(`[InnKeeperV4] No eligible events for ${isLongBreak ? 'long' : 'short'} break`);
            }

            // Give XP to all employees for completing work cycle
            await this.giveEmployeesXP(channel, dbEntry, now);

        } catch (error) {
            console.error('[InnKeeperV4] Error processing break events:', error);
        }
    }

    /**
     * Select a weighted random event based on break type
     */
    selectBreakEvent(employees, maxEmployees, reputation, isLongBreak) {
        // Get appropriate event pools
        const shortBreakEvents = this.config.BREAK_EVENTS.SHORT_BREAK_EVENTS;
        const longBreakEvents = this.config.BREAK_EVENTS.LONG_BREAK_EVENTS;
        const bothBreakEvents = this.config.BREAK_EVENTS.BOTH_BREAK_EVENTS;

        // Combine events based on break type
        let availableEvents = { ...bothBreakEvents };
        
        if (isLongBreak) {
            availableEvents = { ...availableEvents, ...longBreakEvents };
        } else {
            availableEvents = { ...availableEvents, ...shortBreakEvents };
        }

        // Filter events based on conditions and reputation requirements
        const eligibleEvents = [];
        for (const [eventKey, eventData] of Object.entries(availableEvents)) {
            // Check if event can happen based on conditions
            if (eventData.canHappen(employees, maxEmployees)) {
                // Check reputation requirement
                if (reputation >= eventData.minReputation) {
                    eligibleEvents.push({ key: eventKey, ...eventData });
                }
            }
        }

        if (eligibleEvents.length === 0) {
            return null; // No eligible events
        }

        // Calculate total weight
        const totalWeight = eligibleEvents.reduce((sum, event) => sum + event.weight, 0);
        
        // Select random event based on weight
        let randomValue = Math.random() * totalWeight;
        
        for (const event of eligibleEvents) {
            randomValue -= event.weight;
            if (randomValue <= 0) {
                return event;
            }
        }

        // Fallback to last event
        return eligibleEvents[eligibleEvents.length - 1];
    }

    /**
     * Execute the selected break event
     */
    async executeBreakEvent(channel, dbEntry, event, now) {
        try {
            // Handle special event types
            if (event.key === 'HIRING') {
                await this.processHiringEvent(channel, dbEntry, now);
                return;
            }

            // Apply event effects
            const updateData = {};
            
            // Apply reputation gain
            if (event.reputationGain > 0) {
                updateData['$inc'] = { 'gameData.v4State.reputation': event.reputationGain };
                updateData['$max'] = { 'gameData.v4State.reputation': this.config.REPUTATION.MAX_REPUTATION };
            }

            // Apply XP bonus to employees
            if (event.xpBonus && dbEntry.gameData?.employees?.length > 0) {
                const employees = [...dbEntry.gameData.employees];
                employees.forEach(emp => emp.xp += event.xpBonus);
                updateData['$set'] = { ...updateData['$set'], 'gameData.employees': employees };
            }

            // Apply XP loss to employees (for negative events)
            if (event.xpLoss && dbEntry.gameData?.employees?.length > 0) {
                const employees = [...dbEntry.gameData.employees];
                employees.forEach(emp => emp.xp = Math.max(0, emp.xp - event.xpLoss));
                updateData['$set'] = { ...updateData['$set'], 'gameData.employees': employees };
            }

            // Update database if there are changes
            if (Object.keys(updateData).length > 0) {
                await ActiveVCs.findOneAndUpdate(
                    { channelId: channel.id },
                    updateData
                );
            }

            // Send event notification
            await this.sendEventNotification(channel, event);

        } catch (error) {
            console.error('[InnKeeperV4] Error executing break event:', error);
        }
    }

    /**
     * Send event notification embed
     */
    async sendEventNotification(channel, event) {
        try {
            let color = this.config.DISPLAY.COLORS.INFO;
            let emoji = '📋';

            // Set color and emoji based on event effects
            if (event.reputationGain > 5) {
                color = this.config.DISPLAY.COLORS.SUCCESS;
                emoji = '🌟';
            } else if (event.reputationGain > 0) {
                color = this.config.DISPLAY.COLORS.WORKING;
                emoji = '✨';
            } else if (event.xpLoss > 0) {
                color = this.config.DISPLAY.COLORS.ERROR;
                emoji = '⚠️';
            }

            const embed = new EmbedBuilder()
                .setTitle(`${emoji} ${event.name}`)
                .setDescription(event.description)
                .setColor(color)
                .setTimestamp();

            // Add effect fields
            const effects = [];
            if (event.reputationGain > 0) {
                effects.push(`**Reputation**: +${event.reputationGain}`);
            }
            if (event.xpBonus > 0) {
                effects.push(`**Employee XP**: +${event.xpBonus}`);
            }
            if (event.xpLoss > 0) {
                effects.push(`**Employee XP**: -${event.xpLoss}`);
            }
            if (event.profitBonus > 1) {
                effects.push(`**Profit Bonus**: +${Math.round((event.profitBonus - 1) * 100)}%`);
            }

            if (effects.length > 0) {
                embed.addFields({
                    name: '📈 Effects',
                    value: effects.join('\n'),
                    inline: false
                });
            }

            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('[InnKeeperV4] Error sending event notification:', error);
        }
    }

    /**
     * Process hiring event
     */
    async processHiringEvent(channel, dbEntry, now) {
        try {
            const employees = dbEntry.gameData?.employees || [];
            const maxEmployees = dbEntry.gameData?.v4State?.maxEmployees || 2;

            if (employees.length >= maxEmployees) {
                console.log('[InnKeeperV4] Cannot hire - inn at max capacity');
                return;
            }

            // Select random NPC from npcs.json
            const availableNPCs = npcs.filter(npc => npc.frequency !== 'never');
            if (availableNPCs.length === 0) {
                console.log('[InnKeeperV4] No available NPCs for hiring');
                return;
            }

            const selectedNPC = availableNPCs[Math.floor(Math.random() * availableNPCs.length)];
            
            // Create new employee with random stats
            const newEmployee = this.createEmployee(selectedNPC);

            // Calculate hiring cost
            const hiringCost = this.calculateHiringCost(employees.length);

            // Update database with new employee and reputation gain (avoid MongoDB conflict)
            const currentRep = dbEntry.gameData?.v4State?.reputation || 0;
            const newRep = Math.min(
                this.config.REPUTATION.MAX_REPUTATION, 
                currentRep + this.config.REPUTATION.REPUTATION_GAIN.HIRING_EMPLOYEE
            );
            
            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                { 
                    $push: { 'gameData.employees': newEmployee },
                    $set: { 'gameData.v4State.reputation': newRep }
                }
            );

            // Send hiring notification
            const embed = new EmbedBuilder()
                .setTitle('🤝 New Employee Hired!')
                .setColor(this.config.DISPLAY.COLORS.SUCCESS)
                .setDescription(`**${newEmployee.name}** has joined your inn staff!`)
                .addFields(
                    { name: '📊 Level', value: `${newEmployee.level}`, inline: true },
                    { name: '💰 Hiring Cost', value: `${hiringCost} coins`, inline: true },
                    { name: '👥 Staff Count', value: `${employees.length + 1}/${maxEmployees}`, inline: true },
                    { name: '⚡ Speed', value: `${newEmployee.stats.speed}`, inline: true },
                    { name: '💬 Charisma', value: `${newEmployee.stats.charisma}`, inline: true },
                    { name: '🍀 Luck', value: `${newEmployee.stats.luck}`, inline: true },
                    { name: '👁️ Sight', value: `${newEmployee.stats.sight}`, inline: true },
                    { name: '💪 Strength', value: `${newEmployee.stats.strength}`, inline: true },
                    { name: '📝 Description', value: newEmployee.description, inline: false }
                )
                .setTimestamp();

            await channel.send({ embeds: [embed] });

            console.log(`[InnKeeperV4] Hired ${newEmployee.name} for ${hiringCost} coins`);

        } catch (error) {
            console.error('[InnKeeperV4] Error processing hiring event:', error);
        }
    }

    /**
     * Create new employee from NPC data
     */
    createEmployee(npcData) {
        const stats = {};
        
        // Generate random stats
        for (const stat of this.config.EMPLOYEES.STAT_RANGES.STATS) {
            stats[stat] = Math.floor(Math.random() * 
                (this.config.EMPLOYEES.STAT_RANGES.MAX_STAT - this.config.EMPLOYEES.STAT_RANGES.MIN_STAT + 1)) + 
                this.config.EMPLOYEES.STAT_RANGES.MIN_STAT;
        }

        return {
            id: `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            npcId: npcData.id,
            name: npcData.name,
            description: npcData.description,
            level: 1,
            xp: 0,
            stats: stats,
            hiredAt: new Date(),
            totalWorkCycles: 0
        };
    }

    /**
     * Calculate hiring cost based on current employee count
     */
    calculateHiringCost(currentEmployees) {
        const baseCost = this.config.EMPLOYEES.HIRING_COST_BASE;
        const multiplier = Math.pow(this.config.EMPLOYEES.HIRING_COST_MULTIPLIER, currentEmployees);
        return Math.floor(baseCost * multiplier);
    }

    /**
     * Give XP to all employees for completing work cycle
     */
    async giveEmployeesXP(channel, dbEntry, now) {
        try {
            const employees = dbEntry.gameData?.employees || [];
            if (employees.length === 0) return;

            const xpGain = this.config.EMPLOYEES.XP_PER_WORK_CYCLE;
            const leveledUpEmployees = [];

            // Process XP gain for each employee
            for (let i = 0; i < employees.length; i++) {
                const employee = employees[i];
                const oldLevel = employee.level;
                
                employee.xp += xpGain;
                employee.totalWorkCycles += 1;

                // Check for level up
                const newLevel = this.calculateEmployeeLevel(employee.xp);
                if (newLevel > oldLevel && newLevel <= this.config.EMPLOYEES.MAX_EMPLOYEE_LEVEL) {
                    employee.level = newLevel;
                    leveledUpEmployees.push({
                        name: employee.name,
                        oldLevel: oldLevel,
                        newLevel: newLevel
                    });
                }
            }

            // Calculate reputation gain from level ups
            const reputationGain = leveledUpEmployees.length * this.config.REPUTATION.REPUTATION_GAIN.EMPLOYEE_LEVEL_UP;

            // Update database with employees and reputation (avoid MongoDB conflict)
            const updateData = { $set: { 'gameData.employees': employees } };
            
            if (reputationGain > 0) {
                const currentRep = dbEntry.gameData?.v4State?.reputation || 0;
                const newRep = Math.min(
                    this.config.REPUTATION.MAX_REPUTATION, 
                    currentRep + reputationGain
                );
                updateData.$set['gameData.v4State.reputation'] = newRep;
            }

            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                updateData
            );

            // Send level up notifications if any
            if (leveledUpEmployees.length > 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📈 Employee Level Up!')
                    .setColor(this.config.DISPLAY.COLORS.SUCCESS)
                    .setDescription('Your employees have gained experience!')
                    .addFields(
                        leveledUpEmployees.map(emp => ({
                            name: `${emp.name}`,
                            value: `Level ${emp.oldLevel} → ${emp.newLevel}`,
                            inline: true
                        }))
                    )
                    .setTimestamp();

                await channel.send({ embeds: [embed] });
            }

        } catch (error) {
            console.error('[InnKeeperV4] Error giving employees XP:', error);
        }
    }

    /**
     * Calculate employee level based on XP
     */
    calculateEmployeeLevel(xp) {
        let level = 1;
        let xpNeeded = this.config.EMPLOYEES.XP_PER_LEVEL;
        let totalXpUsed = 0;

        while (xp >= totalXpUsed + xpNeeded && level < this.config.EMPLOYEES.MAX_EMPLOYEE_LEVEL) {
            totalXpUsed += xpNeeded;
            level++;
            xpNeeded = Math.floor(xpNeeded * this.config.EMPLOYEES.XP_MULTIPLIER);
        }

        return level;
    }

    /**
     * Create break start embed with employee information
     */
    createBreakStartEmbed(isLongBreak, cycleCount, breakDuration, breakEndTime) {
        const breakDurationMinutes = Math.floor(breakDuration / 60000);
        
        const embed = new EmbedBuilder()
            .setTitle(isLongBreak ? '🛌 Extended Break Time!' : '☕ Break Time!')
            .setColor(isLongBreak ? this.config.DISPLAY.COLORS.LONG_BREAK : this.config.DISPLAY.COLORS.SHORT_BREAK)
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
            .setColor(this.config.DISPLAY.COLORS.SUCCESS)
            .setDescription('Break time is over! The inn is back open for business.')
            .addFields(
                { name: '⏰ Work Duration', value: `${workDurationMinutes} minutes`, inline: true },
                { name: '⏳ Next Break At', value: `<t:${Math.floor(nextBreakTime / 1000)}:R>`, inline: true }
            )
            .setTimestamp();

        return embed;
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
