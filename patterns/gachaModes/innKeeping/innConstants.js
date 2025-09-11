// InnKeeper Constants - Centralized Configuration
// Edit these values to adjust inn behavior across all versions

module.exports = {
    // === TIMING CONFIGURATION ===
    TIMING: {
        // Work and Break Durations (in milliseconds) - TESTING VALUES
        WORK_DURATION: 25 * 60 * 1000,         // 3 minutes - length of work shifts (TESTING)
        SHORT_BREAK_DURATION: 5 * 60 * 1000,  // 1 minute - regular break length (TESTING)
        LONG_BREAK_DURATION: 20 * 60 * 1000,   // 2 minutes - extended break length (TESTING)
        
        // Cycle Configuration
        LONG_BREAK_CYCLE: 4,                   // Every Nth cycle triggers long break
        
        // Display Update Intervals
        WORK_COUNTDOWN_THRESHOLD: 5 * 60 * 1000,  // Show countdown in last 5 minutes of work
        BREAK_COUNTDOWN_THRESHOLD: 2 * 60 * 1000, // Show countdown in last 2 minutes of break
        
        // Processing Intervals
        PROCESSING_INTERVAL: 8 * 1000,       // 30 seconds - how often to check state
        LOCK_TIMEOUT: 5 * 1000,               // 5 seconds - processing lock timeout (aligned with mining)
    },

    // === PROFIT AND ECONOMY ===
    ECONOMY: {
        // Base profit settings
        BASE_PROFIT_MIN: 10,                   // Minimum profit per sale
        BASE_PROFIT_MAX: 50,                   // Maximum profit per sale
        
        // Multipliers and bonuses
        LEVEL_PROFIT_BONUS: 0.05,              // 5% profit bonus per inn level
        TEAMWORK_BONUS_BASE: 0.1,              // 10% base teamwork bonus
        INNKEEPER_CUT: 0.1,                    // 10% house cut from profits
        
        // Tips and extras
        TIP_CHANCE: 0.3,                       // 30% chance of receiving tips
        TIP_MULTIPLIER: 0.2,                   // Tips are 20% of sale price
    },

    // === ACTIVITY AND EVENTS ===
    ACTIVITY: {
        // Event generation chances
        BASE_EVENT_CHANCE: 0.1,                // 10% base chance for events per cycle
        RARE_EVENT_CHANCE: 0.05,               // 5% chance for rare events
        LEGENDARY_EVENT_CHANCE: 0.01,          // 1% chance for legendary events
        
        // Activity timing
        MIN_ACTIVITY_INTERVAL: 30 * 1000,     // 30 seconds minimum between activities
        MAX_ACTIVITY_INTERVAL: 5 * 60 * 1000, // 5 minutes maximum between activities
        
        // Sales generation
        SALES_PER_MINUTE: 2,                   // Average sales per minute during work
        CUSTOMER_ARRIVAL_VARIANCE: 0.3,       // 30% variance in customer timing
    },

    // === PROGRESSION SYSTEM ===
    PROGRESSION: {
        // Experience and leveling
        XP_PER_SALE: 10,                       // XP gained per successful sale
        XP_PER_LEVEL: 1000,                    // XP required per level
        XP_MULTIPLIER: 1.2,                    // XP requirement multiplier per level
        MAX_LEVEL: 50,                         // Maximum inn level
        
        // Level bonuses
        PROFIT_BONUS_PER_LEVEL: 0.03,          // 3% profit increase per level
        EVENT_FREQUENCY_BONUS: 0.02,           // 2% more events per level
        EFFICIENCY_BONUS_PER_LEVEL: 0.01,      // 1% efficiency increase per level
    },

    // === DISPLAY AND UI ===
    DISPLAY: {
        // Message management
        MESSAGE_CACHE_SIZE: 10,                // Number of messages to cache per channel
        EDIT_SEARCH_LIMIT: 5,                  // How many recent messages to search for editing
        
        // Update frequencies
        STATUS_UPDATE_INTERVAL: 5 * 1000,     // 5 seconds - status display updates
        ACTIVITY_LOG_INTERVAL: 30 * 1000,     // 30 seconds - activity log updates
        
        // Colors (hex values)
        COLORS: {
            WORKING: 0x3498DB,                 // Blue for working state
            SHORT_BREAK: 0xF39C12,             // Orange for short breaks
            LONG_BREAK: 0xFF6B6B,              // Red for long breaks
            SUCCESS: 0x2ECC71,                 // Green for success messages
            PROFIT: 0xFFD700,                  // Gold for profit displays
            ERROR: 0xE74C3C,                   // Red for errors
            INFO: 0x95A5A6,                    // Gray for info messages
        }
    },

    // === SEASONAL AND SPECIAL EVENTS ===
    SEASONAL: {
        // Event durations
        SEASONAL_EVENT_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days
        SPECIAL_EVENT_DURATION: 24 * 60 * 60 * 1000,       // 24 hours
        
        // Bonuses
        SEASONAL_PROFIT_MULTIPLIER: 1.5,      // 50% bonus during seasonal events
        HOLIDAY_PROFIT_MULTIPLIER: 2.0,       // 100% bonus during holidays
        
        // Frequencies
        SEASONAL_EVENT_CHANCE: 0.1,            // 10% chance per day for seasonal events
        RANDOM_EVENT_COOLDOWN: 60 * 60 * 1000, // 1 hour cooldown between random events
    },

    // === AUTOMATION AND QUALITY OF LIFE ===
    AUTOMATION: {
        // Auto-processing
        AUTO_DISTRIBUTE_PROFITS: true,         // Automatically distribute profits at break
        AUTO_RESTART_AFTER_BREAK: true,        // Automatically restart work after break
        AUTO_LEVEL_ANNOUNCEMENTS: true,        // Announce level ups automatically
        
        // Thresholds
        IDLE_TIMEOUT: 30 * 60 * 1000,         // 30 minutes - consider inn idle
        MAINTENANCE_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours - run maintenance
        
        // Limits
        MAX_CONCURRENT_EVENTS: 3,              // Maximum simultaneous events
        MAX_SALES_PER_CYCLE: 50,               // Maximum sales per work cycle
    },

    // === DEBUGGING AND MONITORING ===
    DEBUG: {
        // Logging levels
        LOG_LEVEL: 'info',                     // 'debug', 'info', 'warn', 'error'
        LOG_STATE_CHANGES: true,               // Log all state transitions
        LOG_PROFIT_DISTRIBUTION: true,         // Log profit calculations
        
        // Performance monitoring
        PERFORMANCE_MONITORING: true,          // Enable performance tracking
        SLOW_OPERATION_THRESHOLD: 5000,       // 5 seconds - log slow operations
        
        // Health checks
        HEALTH_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes - health check frequency
        MAX_PROCESSING_TIME: 30 * 1000,       // 30 seconds - max processing time
    },

    // === EMPLOYEE MANAGEMENT SYSTEM ===
    EMPLOYEES: {
        // Inn size configuration (max employees by rarity)
        INN_SIZES: {
            common: 2,                          // Common inns can have 2 employees
            uncommon: 3,                        // Uncommon inns can have 3 employees  
            rare: 4,                            // Rare inns can have 4 employees
            epic: 5,                            // Epic inns can have 5 employees
            legendary: 6                        // Legendary inns can have 6 employees
        },
        
        // Employee stats configuration
        STAT_RANGES: {
            MIN_STAT: 1,                        // Minimum stat value
            MAX_STAT: 5,                        // Maximum stat value
            STATS: ['speed', 'charisma', 'luck', 'sight', 'strength']
        },
        
        // Employee leveling
        XP_PER_LEVEL: 100,                      // XP needed per employee level
        XP_MULTIPLIER: 1.5,                     // XP requirement multiplier per level
        MAX_EMPLOYEE_LEVEL: 20,                 // Maximum employee level
        XP_PER_WORK_CYCLE: 25,                  // XP gained per work cycle
        
        // Hiring system
        HIRING_CHANCE: 0.3,                     // 30% chance of hiring event per break
        HIRING_COST_BASE: 100,                  // Base cost to hire employee
        HIRING_COST_MULTIPLIER: 1.2,            // Cost multiplier per existing employee
        
        // Employee bonuses
        STAT_BONUS_MULTIPLIER: 0.02,            // 2% bonus per stat point
        LEVEL_BONUS_MULTIPLIER: 0.05,           // 5% bonus per employee level
        
        // Event system - removed (replaced by comprehensive event system below)
    },

    // === BREAK EVENT SYSTEM ===
    BREAK_EVENTS: {
        // Event weights determine probability of selection
        // Higher weight = more likely to be selected
        
        SHORT_BREAK_EVENTS: {
            // Events that can only happen during short breaks (1 minute)
            HIRING: {
                weight: 80,
                name: "Employee Hiring",
                description: "A potential employee is looking for work",
                canHappen: (employees, maxEmployees) => employees.length < maxEmployees,
                minReputation: 0,
                reputationGain: 1
            },
            NOTHING: {
                weight: 20,
                name: "Peaceful Break",
                description: "A quiet, uneventful break period",
                canHappen: () => true,
                minReputation: 0,
                reputationGain: 0
            }
        },

        LONG_BREAK_EVENTS: {
            // Events that can only happen during long breaks (2 minutes)
            STAFF_PROMOTION: {
                weight: 80,
                name: "Staff Promotion Ceremony",
                description: "An employee gets promoted, boosting team morale",
                canHappen: (employees) => employees.some(emp => emp.level >= 5),
                minReputation: 0,
                reputationGain: 5,
                xpBonus: 25
            },
            NOTHING: {
                weight: 20,
                name: "Extended Rest",
                description: "A long, peaceful break with no special events",
                canHappen: () => true,
                minReputation: 0,
                reputationGain: 1
            }
        },

        BOTH_BREAK_EVENTS: {
            // No events that happen during both break types for now
        }
    },

    // === WORK PERIOD EVENT SYSTEM ===
    WORK_EVENTS: {
        // Events that happen during work periods to generate profit/loss
        
        POSITIVE_EVENTS: {
            // Events that increase profit and reputation
            FOOD_ORDER: {
                weight: 30,
                name: "Food Order",
                description: "Customers order hearty meals and drinks",
                profitRange: [10, 25],
                reputationGain: 1,
                canHappen: () => true
            },
            DRINK_RUSH: {
                weight: 25,
                name: "Drink Rush",
                description: "A group of travelers orders multiple rounds of drinks",
                profitRange: [15, 30],
                reputationGain: 1,
                canHappen: () => true
            },
            ROOM_RENTAL: {
                weight: 20,
                name: "Room Rental",
                description: "Weary travelers rent rooms for the night",
                profitRange: [20, 40],
                reputationGain: 2,
                canHappen: () => true
            },
            MERCHANT_FEAST: {
                weight: 15,
                name: "Merchant Feast",
                description: "Wealthy merchants host a lavish feast",
                profitRange: [30, 60],
                reputationGain: 3,
                canHappen: () => true,
                minReputation: 10
            },
            CELEBRATION_PARTY: {
                weight: 10,
                name: "Celebration Party",
                description: "Locals celebrate a special occasion at the inn",
                profitRange: [25, 50],
                reputationGain: 2,
                canHappen: () => true,
                minReputation: 5
            }
        },

        NEGATIVE_EVENTS: {
            // Events that decrease profit and reputation
            TAVERN_FIGHT: {
                weight: 20,
                name: "Tavern Fight",
                description: "A brawl breaks out, damaging furniture and scaring customers",
                profitRange: [-30, -10],
                reputationLoss: 2,
                canHappen: () => true
            },
            FOOD_POISONING: {
                weight: 15,
                name: "Food Poisoning",
                description: "Bad ingredients cause customers to fall ill",
                profitRange: [-25, -15],
                reputationLoss: 3,
                canHappen: () => true
            },
            THEFT_INCIDENT: {
                weight: 15,
                name: "Theft Incident",
                description: "A thief steals from the inn's coffers",
                profitRange: [-20, -5],
                reputationLoss: 1,
                canHappen: () => true
            },
            BROKEN_EQUIPMENT: {
                weight: 12,
                name: "Broken Equipment",
                description: "Kitchen equipment breaks down, disrupting service",
                profitRange: [-15, -5],
                reputationLoss: 1,
                canHappen: () => true
            },
            ROWDY_CUSTOMERS: {
                weight: 10,
                name: "Rowdy Customers",
                description: "Disruptive customers drive away other patrons",
                profitRange: [-10, -2],
                reputationLoss: 1,
                canHappen: () => true
            },
            FIRE_HAZARD: {
                weight: 8,
                name: "Fire Hazard",
                description: "A small fire damages part of the inn",
                profitRange: [-40, -20],
                reputationLoss: 2,
                canHappen: () => true
            }
        },

        // Event generation settings
        EVENT_FREQUENCY: {
            MIN_INTERVAL: 5 * 1000,         // 5 seconds minimum between events
            MAX_INTERVAL: 10 * 1000,        // 10 seconds maximum between events
            POSITIVE_EVENT_CHANCE: 0.7,     // 70% chance for positive events
            NEGATIVE_EVENT_CHANCE: 0.3      // 30% chance for negative events
        }
    },

    // === INN WEALTH SYSTEM ===
    WEALTH: {
        STARTING_WEALTH: 100,               // Starting inn wealth
        MAX_WEALTH: 10000,                  // Maximum wealth cap
        MIN_WEALTH: 0,                      // Minimum wealth (can't go negative)
        
        // Wealth display tiers
        WEALTH_TIERS: {
            POOR: { min: 0, max: 199, name: "Struggling", emoji: "💸" },
            MODEST: { min: 200, max: 499, name: "Modest", emoji: "💰" },
            COMFORTABLE: { min: 500, max: 999, name: "Comfortable", emoji: "💵" },
            PROSPEROUS: { min: 1000, max: 2499, name: "Prosperous", emoji: "💎" },
            WEALTHY: { min: 2500, max: 4999, name: "Wealthy", emoji: "👑" },
            OPULENT: { min: 5000, max: 10000, name: "Opulent", emoji: "🏰" }
        }
    },

    // === FUTURE EXPANSION AREAS ===
    // These sections are prepared for future features
    
    REPUTATION: {
        // Inn reputation system
        STARTING_REPUTATION: 0,                // All inns start at 0 reputation
        MAX_REPUTATION: 1000,                  // Maximum reputation possible
        REPUTATION_DECAY: 0.01,                // Daily reputation decay
        REPUTATION_BONUS_THRESHOLD: 100,       // Reputation needed for bonuses
        
        // Reputation gain sources
        REPUTATION_GAIN: {
            SUCCESSFUL_WORK_CYCLE: 1,          // +1 reputation per completed work cycle
            EMPLOYEE_LEVEL_UP: 2,              // +2 reputation when employee levels up
            HIRING_EMPLOYEE: 1,                // +1 reputation when hiring new employee
            LONG_BREAK_COMPLETED: 3,           // +3 reputation after completing long break cycle
            PERFECT_SERVICE: 5                 // +5 reputation for exceptional service (future)
        }
    },

    ACHIEVEMENTS: {
        // Achievement system (future)
        ACHIEVEMENT_CHECK_INTERVAL: 10 * 60 * 1000, // 10 minutes
        XP_BONUS_FOR_ACHIEVEMENTS: 100,        // Bonus XP for achievements
    },

    SOCIAL: {
        // Social features (future)
        FRIEND_BONUS_MULTIPLIER: 1.1,          // 10% bonus when friends work together
        GUILD_COMPETITION_ENABLED: false,      // Enable cross-guild competitions
    },

    CUSTOMIZATION: {
        // Inn customization (future)
        THEME_UNLOCK_LEVELS: [5, 10, 15, 20, 25], // Levels that unlock new themes
        DECORATION_SLOTS: 5,                   // Number of decoration slots
    }
};

// === HELPER FUNCTIONS ===

/**
 * Convert minutes to milliseconds
 */
function minutes(min) {
    return min * 60 * 1000;
}

/**
 * Convert hours to milliseconds  
 */
function hours(hr) {
    return hr * 60 * 60 * 1000;
}

/**
 * Convert days to milliseconds
 */
function days(d) {
    return d * 24 * 60 * 60 * 1000;
}

// Export helper functions
module.exports.helpers = {
    minutes,
    hours, 
    days
};

// === QUICK CONFIG PRESETS ===
// Uncomment one of these sections to quickly change inn behavior

// FAST TESTING PRESET (for development)
/*
module.exports.TIMING.WORK_DURATION = minutes(2);           // 2 minute work
module.exports.TIMING.SHORT_BREAK_DURATION = minutes(1);    // 1 minute break  
module.exports.TIMING.LONG_BREAK_DURATION = minutes(3);     // 3 minute long break
*/

// CASUAL PRESET (shorter cycles)
/*
module.exports.TIMING.WORK_DURATION = minutes(15);          // 15 minute work
module.exports.TIMING.SHORT_BREAK_DURATION = minutes(3);    // 3 minute break
module.exports.TIMING.LONG_BREAK_DURATION = minutes(10);    // 10 minute long break
*/

// HARDCORE PRESET (longer cycles)  
/*
module.exports.TIMING.WORK_DURATION = minutes(30);          // 30 minute work
module.exports.TIMING.SHORT_BREAK_DURATION = minutes(5);    // 5 minute break
module.exports.TIMING.LONG_BREAK_DURATION = minutes(30);    // 30 minute long break
*/
