// innKeeping/innConfigV3.js
// Enhanced configuration for Inn Keeper V3 with progression, reputation, and automation systems

module.exports = {
    // Core Timing Configuration (Enhanced from V2)
    TIMING: {
        WORK_DURATION: 25 * 60 * 1000,        // 25 minutes
        BREAK_DURATION: 5 * 60 * 1000,        // 5 minutes
        ACTIVITY_GUARANTEE: 15 * 1000,        // 15 seconds max between events (faster)
        MESSAGE_COOLDOWN: 2000,               // 2 seconds between messages (faster)
        SHOP_GENERATION_COOLDOWN: 3 * 60 * 1000, // 3 minutes (faster refresh)
        DEFAULT_CYCLE_DELAY: {
            MIN: 3000,                         // 3 seconds minimum (faster)
            MAX: 10000                         // 10 seconds maximum (faster)
        },
        // V3 Specific Timing
        REPUTATION_UPDATE_INTERVAL: 5 * 60 * 1000,    // 5 minutes
        ACHIEVEMENT_CHECK_INTERVAL: 10 * 60 * 1000,   // 10 minutes
        SEASONAL_EVENT_CHECK: 30 * 60 * 1000,         // 30 minutes
        AUTOMATION_UPDATE_INTERVAL: 2 * 60 * 1000,    // 2 minutes
        DAILY_BONUS_RESET: 24 * 60 * 60 * 1000        // 24 hours
    },

    // Enhanced Concurrency Configuration
    CONCURRENCY: {
        LOCK_TIMEOUT: 45000,                   // 45 seconds lock timeout (longer for V3)
        LOCK_RETRY_DELAY: 1000,                // 1 second between lock retries
        MAX_LOCK_RETRIES: 3,                   // Maximum lock acquisition attempts
        PURCHASE_COOLDOWN: 2000,               // 2 seconds between purchases per user (faster)
        EVENT_DUPLICATE_WINDOW: 20000,         // 20 seconds duplicate event prevention (shorter)
        DISTRIBUTION_LOCK_TIMEOUT: 60000,      // 1 minute for profit distribution
        RETRY_BACKOFF: {
            BASE_DELAY: 30000,                 // 30 seconds base retry delay
            MAX_DELAY: 300000,                 // 5 minutes maximum delay
            MULTIPLIER: 2                      // Exponential backoff multiplier
        },
        CLEANUP_INTERVAL: 60000,               // 1 minute cleanup interval
        STATE_VERSION_CHECK: true,             // Enable optimistic locking
        IDEMPOTENCY_WINDOW: 300000,            // 5 minutes idempotency window
        // V3 Enhanced Concurrency
        MAX_CONCURRENT_EVENTS: 3,              // Maximum concurrent events
        EVENT_PROCESSING_TIMEOUT: 30000,       // 30 seconds for event processing
        REPUTATION_BATCH_SIZE: 50,             // Process reputations in batches
        ACHIEVEMENT_BATCH_SIZE: 20             // Process achievements in batches
    },

    // Enhanced Event Probabilities
    EVENTS: {
        BASE_EVENT_CHANCE: 0.15,               // 15% base chance (increased from V2)
        RARE_EVENT_CHANCE: 0.05,               // 5% rare event chance
        LEGENDARY_EVENT_CHANCE: 0.01,          // 1% legendary event chance
        SEASONAL_EVENT_CHANCE: 0.1,            // 10% seasonal event chance
        EVENT_COOLDOWN: 20000,                 // 20 seconds between events (shorter)
        MAX_EVENTS_PER_CYCLE: 2,               // Maximum events per processing cycle
        // Event Types
        COMMON_EVENTS: [
            'local_gathering', 'morning_rush', 'evening_wind_down',
            'traveler_stop', 'local_meeting', 'quiet_evening'
        ],
        RARE_EVENTS: [
            'traveling_merchant', 'festival_celebration', 'adventurer_guild_meeting',
            'noble_visit', 'artisan_demonstration', 'bard_performance'
        ],
        LEGENDARY_EVENTS: [
            'celebrity_visit', 'treasure_hunter_stop', 'royal_delegation',
            'dragon_riders_rest', 'ancient_artifact_sale', 'cosmic_traveler'
        ]
    },

    // Progression System Configuration
    PROGRESSION: {
        MAX_LEVEL: 100,                        // Increased max level
        XP_PER_LEVEL: 1000,                    // Base XP per level
        XP_MULTIPLIER: 1.15,                   // XP multiplier per level
        LEVEL_BONUSES: {
            PROFIT_BOOST: 0.03,                // 3% profit boost per level
            EVENT_FREQUENCY: 0.02,             // 2% event frequency per level
            AUTOMATION_EFFICIENCY: 0.025,      // 2.5% automation efficiency per level
            REPUTATION_GAIN: 0.01,             // 1% reputation gain per level
            SHOP_REFRESH_SPEED: 0.02           // 2% shop refresh speed per level
        },
        // Level Milestones
        MILESTONE_LEVELS: [5, 10, 25, 50, 75, 100],
        MILESTONE_REWARDS: {
            5: { xp: 500, reputation: 100, specialUnlock: 'automation_level_1' },
            10: { xp: 1000, reputation: 200, specialUnlock: 'rare_events' },
            25: { xp: 2500, reputation: 500, specialUnlock: 'seasonal_events' },
            50: { xp: 5000, reputation: 1000, specialUnlock: 'legendary_events' },
            75: { xp: 7500, reputation: 1500, specialUnlock: 'automation_level_5' },
            100: { xp: 10000, reputation: 2000, specialUnlock: 'master_innkeeper' }
        }
    },

    // Reputation System Configuration
    REPUTATION: {
        MAX_REPUTATION: 2000,                  // Increased max reputation
        REPUTATION_GAIN: {
            SALE: 1,                           // Base reputation per sale
            TIP: 3,                            // Reputation per tip
            EVENT_PARTICIPATION: 5,            // Reputation for event participation
            DAILY_BONUS: 15,                   // Daily bonus reputation
            ACHIEVEMENT: 25,                   // Reputation for achievements
            LEVEL_UP: 50,                      // Reputation for leveling up
            SEASONAL_PARTICIPATION: 100        // Reputation for seasonal events
        },
        REPUTATION_BONUSES: {
            PROFIT_MULTIPLIER: 0.0005,         // 0.05% profit per reputation point
            RARE_EVENT_CHANCE: 0.0001,         // 0.01% rare event chance per reputation
            LEGENDARY_EVENT_CHANCE: 0.00005,   // 0.005% legendary event chance per reputation
            AUTOMATION_EFFICIENCY: 0.0002,     // 0.02% automation efficiency per reputation
            SHOP_QUALITY: 0.0003               // 0.03% shop quality per reputation
        },
        // Reputation Tiers
        REPUTATION_TIERS: {
            NOVICE: { min: 0, max: 99, name: 'Novice', color: 0x808080 },
            APPRENTICE: { min: 100, max: 299, name: 'Apprentice', color: 0x00FF00 },
            JOURNEYMAN: { min: 300, max: 599, name: 'Journeyman', color: 0x0099FF },
            EXPERT: { min: 600, max: 999, name: 'Expert', color: 0xFF6600 },
            MASTER: { min: 1000, max: 1499, name: 'Master', color: 0xFFD700 },
            GRANDMASTER: { min: 1500, max: 2000, name: 'Grandmaster', color: 0xFF00FF }
        }
    },

    // Seasonal Events Configuration
    SEASONAL: {
        EVENT_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days
        BONUS_MULTIPLIER: 2.0,                 // 2x bonus during seasonal events
        SPECIAL_ITEMS: true,                   // Enable special seasonal items
        THEMED_EVENTS: true,                   // Enable themed events
        // Seasonal Event Types
        SEASONAL_EVENTS: {
            HARVEST_FESTIVAL: {
                name: 'Harvest Festival',
                description: 'The annual harvest festival brings extra customers and special items!',
                profitMultiplier: 1.5,
                specialItems: ['pumpkin_pie', 'apple_cider', 'harvest_bread', 'corn_bread'],
                themedEvents: ['harvest_celebration', 'pumpkin_carving', 'apple_picking']
            },
            WINTER_SOLSTICE: {
                name: 'Winter Solstice',
                description: 'The winter solstice celebration brings warmth and cheer to all!',
                profitMultiplier: 1.4,
                specialItems: ['hot_chocolate', 'gingerbread', 'winter_stew', 'mulled_wine'],
                themedEvents: ['snow_festival', 'warm_fireplace', 'winter_games']
            },
            SPRING_AWAKENING: {
                name: 'Spring Awakening',
                description: 'Spring has arrived with fresh ingredients and renewed spirits!',
                profitMultiplier: 1.3,
                specialItems: ['spring_salad', 'flower_tea', 'fresh_herbs', 'honey_cake'],
                themedEvents: ['flower_festival', 'spring_cleaning', 'new_growth']
            },
            SUMMER_SOLSTICE: {
                name: 'Summer Solstice',
                description: 'The longest day brings the biggest celebrations and warmest hospitality!',
                profitMultiplier: 1.6,
                specialItems: ['summer_ale', 'fresh_fruit', 'grilled_fish', 'ice_cream'],
                themedEvents: ['sun_festival', 'beach_party', 'summer_games']
            }
        }
    },

    // Automation System Configuration
    AUTOMATION: {
        MAX_LEVEL: 20,                         // Increased max automation level
        UPGRADE_COST: 5000,                    // Base cost for automation upgrade
        COST_MULTIPLIER: 1.4,                  // Cost multiplier per level
        EFFICIENCY_BOOST: 0.05,                // 5% efficiency boost per level
        // Automation Features
        FEATURES: {
            AUTO_SHOP_REFRESH: { level: 1, description: 'Automatically refresh shop inventory' },
            AUTO_EVENT_GENERATION: { level: 3, description: 'Automatically generate events' },
            AUTO_PROFIT_DISTRIBUTION: { level: 5, description: 'Automatically distribute profits' },
            AUTO_REPUTATION_UPDATE: { level: 7, description: 'Automatically update reputations' },
            AUTO_ACHIEVEMENT_CHECK: { level: 10, description: 'Automatically check achievements' },
            AUTO_SEASONAL_EVENTS: { level: 15, description: 'Automatically manage seasonal events' },
            AUTO_LEVEL_UP: { level: 20, description: 'Automatically handle level ups' }
        }
    },

    // Enhanced Events Configuration
    ENHANCED_EVENTS: {
        RARE_EVENT_CHANCE: 0.05,               // 5% base chance for rare events
        LEGENDARY_EVENT_CHANCE: 0.01,          // 1% base chance for legendary events
        EVENT_COOLDOWN: 20000,                 // 20 seconds between events
        MAX_CONCURRENT_EVENTS: 3,              // Maximum concurrent events
        EVENT_DURATION: 5 * 60 * 1000,         // 5 minutes event duration
        // Event Rewards
        EVENT_REWARDS: {
            COMMON: { xp: 20, reputation: 3, profitMultiplier: 1.2 },
            RARE: { xp: 50, reputation: 10, profitMultiplier: 2.0 },
            LEGENDARY: { xp: 100, reputation: 20, profitMultiplier: 5.0 }
        }
    },

    // Achievement System Configuration
    ACHIEVEMENTS: {
        // Sales Achievements
        SALES_ACHIEVEMENTS: [
            { id: 'sales_10', name: 'First Steps', description: 'Made 10 sales', threshold: 10, reward: { xp: 50, reputation: 10 } },
            { id: 'sales_100', name: 'First Hundred', description: 'Made 100 sales', threshold: 100, reward: { xp: 200, reputation: 50 } },
            { id: 'sales_500', name: 'Half Thousand', description: 'Made 500 sales', threshold: 500, reward: { xp: 500, reputation: 100 } },
            { id: 'sales_1000', name: 'Sales Master', description: 'Made 1,000 sales', threshold: 1000, reward: { xp: 1000, reputation: 200 } },
            { id: 'sales_5000', name: 'Sales Legend', description: 'Made 5,000 sales', threshold: 5000, reward: { xp: 2500, reputation: 500 } }
        ],
        // Level Achievements
        LEVEL_ACHIEVEMENTS: [
            { id: 'level_5', name: 'Rising Star', description: 'Reached inn level 5', threshold: 5, reward: { xp: 100, reputation: 25 } },
            { id: 'level_10', name: 'Established Inn', description: 'Reached inn level 10', threshold: 10, reward: { xp: 300, reputation: 75 } },
            { id: 'level_25', name: 'Popular Destination', description: 'Reached inn level 25', threshold: 25, reward: { xp: 750, reputation: 150 } },
            { id: 'level_50', name: 'Regional Legend', description: 'Reached inn level 50', threshold: 50, reward: { xp: 1500, reputation: 300 } },
            { id: 'level_100', name: 'Master Innkeeper', description: 'Reached inn level 100', threshold: 100, reward: { xp: 3000, reputation: 600 } }
        ],
        // Profit Achievements
        PROFIT_ACHIEVEMENTS: [
            { id: 'profit_1k', name: 'First Thousand', description: 'Earned 1,000 coins in profit', threshold: 1000, reward: { xp: 100, reputation: 25 } },
            { id: 'profit_10k', name: 'Profit Master', description: 'Earned 10,000 coins in profit', threshold: 10000, reward: { xp: 500, reputation: 100 } },
            { id: 'profit_50k', name: 'Wealthy Inn', description: 'Earned 50,000 coins in profit', threshold: 50000, reward: { xp: 1000, reputation: 200 } },
            { id: 'profit_100k', name: 'Gold Standard', description: 'Earned 100,000 coins in profit', threshold: 100000, reward: { xp: 2000, reputation: 400 } },
            { id: 'profit_500k', name: 'Economic Powerhouse', description: 'Earned 500,000 coins in profit', threshold: 500000, reward: { xp: 5000, reputation: 1000 } }
        ],
        // Special Achievements
        SPECIAL_ACHIEVEMENTS: [
            { id: 'first_event', name: 'Eventful Start', description: 'Generated your first event', threshold: 1, reward: { xp: 50, reputation: 15 } },
            { id: 'first_rare_event', name: 'Lucky Break', description: 'Generated your first rare event', threshold: 1, reward: { xp: 100, reputation: 30 } },
            { id: 'first_legendary_event', name: 'Legendary Moment', description: 'Generated your first legendary event', threshold: 1, reward: { xp: 200, reputation: 50 } },
            { id: 'first_seasonal', name: 'Seasonal Spirit', description: 'Participated in your first seasonal event', threshold: 1, reward: { xp: 150, reputation: 40 } },
            { id: 'automation_master', name: 'Automation Master', description: 'Reached maximum automation level', threshold: 20, reward: { xp: 1000, reputation: 200 } }
        ]
    },

    // Display Configuration
    DISPLAY: {
        COLORS: {
            SUCCESS_GREEN: 0x00FF00,
            WARNING_ORANGE: 0xFF6600,
            ERROR_RED: 0xFF0000,
            INFO_BLUE: 0x0099FF,
            BREAK_ORANGE: 0xFF6600,
            WORK_GREEN: 0x00FF00,
            EVENT_PURPLE: 0x9900FF,
            ACHIEVEMENT_GOLD: 0xFFD700,
            LEVEL_UP_RAINBOW: 0xFF00FF,
            SEASONAL_GOLD: 0xFFD700
        },
        EMOJIS: {
            COINS: '💰',
            XP: '⭐',
            REPUTATION: '🏆',
            LEVEL: '📈',
            EVENT: '🎪',
            ACHIEVEMENT: '🏅',
            SEASONAL: '🌟',
            AUTOMATION: '⚙️',
            BREAK: '☕',
            WORK: '⚒️'
        }
    },

    // Performance Configuration
    PERFORMANCE: {
        CACHE_SIZE: 1000,                      // Maximum cache size
        CACHE_TTL: 300000,                     // 5 minutes cache TTL
        BATCH_SIZE: 50,                        // Batch processing size
        MAX_CONCURRENT_OPERATIONS: 10,         // Maximum concurrent operations
        MEMORY_LIMIT: 100 * 1024 * 1024,      // 100MB memory limit
        CPU_LIMIT: 80                          // 80% CPU limit
    }
};
