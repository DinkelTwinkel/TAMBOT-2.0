// innKeeping/innConfig.js
// Centralized configuration for the inn system with concurrency enhancements

module.exports = {
    // Timing Configuration
    TIMING: {
        WORK_DURATION: 25 * 60 * 1000,        // 25 minutes
        BREAK_DURATION: 5 * 60 * 1000,        // 5 minutes
        ACTIVITY_GUARANTEE: 20 * 1000,        // 20 seconds max between events
        MESSAGE_COOLDOWN: 3000,               // 3 seconds between messages
        SHOP_GENERATION_COOLDOWN: 5 * 60 * 1000, // 5 minutes
        DEFAULT_CYCLE_DELAY: {
            MIN: 5000,                         // 5 seconds minimum
            MAX: 15000                         // 15 seconds maximum
        }
    },

    // Concurrency Configuration (NEW)
    CONCURRENCY: {
        LOCK_TIMEOUT: 30000,                   // 30 seconds lock timeout
        LOCK_RETRY_DELAY: 1000,                // 1 second between lock retries
        MAX_LOCK_RETRIES: 3,                   // Maximum lock acquisition attempts
        PURCHASE_COOLDOWN: 3000,               // 3 seconds between purchases per user
        EVENT_DUPLICATE_WINDOW: 30000,         // 30 seconds duplicate event prevention
        DISTRIBUTION_LOCK_TIMEOUT: 60000,      // 1 minute for profit distribution
        RETRY_BACKOFF: {
            BASE_DELAY: 30000,                 // 30 seconds base retry delay
            MAX_DELAY: 300000,                 // 5 minutes maximum delay
            MULTIPLIER: 2                      // Exponential backoff multiplier
        },
        CLEANUP_INTERVAL: 60000,               // 1 minute cleanup interval
        STATE_VERSION_CHECK: true,             // Enable optimistic locking
        IDEMPOTENCY_WINDOW: 300000            // 5 minutes idempotency window
    },

    // Event Probabilities
    EVENTS: {
        COSTLY_EVENT: {
            BASE_CHANCE: 0.50,                // 50% chance for costly events (bar fights, etc.)
            FORCED_CHANCE: 0.55,              // 55% when forcing event
            DISTRIBUTION: {
                BAR_FIGHT: 0.70,              // 70% of costly events are bar fights
                THEFT: 0.15,                  // 15% theft (future feature)
                ACCIDENT: 0.15                // 15% accidents (future feature)
            },
            // Cost scaling by establishment power
            COST_SCALING: {
                BASE_MULTIPLIER: {             // Base cost multiplier by power
                    1: 1.0,    // Miner's Inn: 1x base cost
                    2: 2.5,    // Hunter's Lodge: 2.5x base cost
                    3: 5.0,    // Power 3: 5x base cost
                    4: 10.0,   // Noble's Rest: 10x base cost
                    5: 20.0,   // Power 5: 20x base cost
                    6: 35.0,   // Power 6: 35x base cost
                    7: 50.0    // Power 7: 50x base cost
                },
                VARIANCE_MULTIPLIER: {         // How much randomness in cost
                    1: 0.2,    // ±20% variance
                    2: 0.25,   // ±25% variance
                    3: 0.3,    // ±30% variance
                    4: 0.35,   // ±35% variance
                    5: 0.4,    // ±40% variance
                    6: 0.45,   // ±45% variance
                    7: 0.5     // ±50% variance
                }
            },
            // Player mitigation thresholds
            MITIGATION: {
                STAT_WEIGHTS: {                // How each stat contributes
                    SPEED: 0.4,                // 40% weight
                    SIGHT: 0.4,                // 40% weight
                    LUCK: 0.2                  // 20% weight
                },
                NEGATION_THRESHOLDS: {         // Total stats needed to fully negate
                    1: 5,      // Miner's Inn: 5 total stats
                    2: 8,      // Hunter's Lodge: 8 total stats
                    3: 12,     // Power 3: 12 total stats
                    4: 18,     // Noble's Rest: 18 total stats
                    5: 25,     // Power 5: 25 total stats
                    6: 35,     // Power 6: 35 total stats
                    7: 50      // Power 7: 50 total stats
                },
                REDUCTION_FORMULA: 'stats / threshold', // Reduction percentage
                MAX_REDUCTION: 0.95,          // Maximum 95% reduction
                MIN_REDUCTION: 0.0             // Minimum 0% reduction
            }
        },
        NPC_SALE: {
            BASE_CHANCE: 0.50,                // 50% base chance (reduced from 70%)
            FORCED_CHANCE: 0.65,              // 65% when forcing event (reduced from 85%)
            COOLDOWN: 5000                    // 5 second cooldown
        },
        RANDOM_EVENT: {
            BASE_CHANCE: 0.30,                // 30% base chance (reduced from 60%)
            FORCED_CHANCE: 0.40,              // 40% when forcing (reduced from 80%)
            COOLDOWN: 5000,                   // 5 second cooldown
            DISTRIBUTION: {
                RUMOR: 0.30,                  // 30% of random events (increased)
                COIN_FIND: 0.70               // 70% of random events (increased)
            }
        },
        INNKEEPER_COMMENT: {
            ENABLED: true,                    // Fallback when nothing else happens
            ONLY_WHEN_FORCED: true           // Only as last resort
        }
    },

    // Economy Configuration
    ECONOMY: {
        BASE_SALARY: {
            FORMULA: 'power => 15 * Math.pow(1.5, power - 1)',
            POWER_1: 15,
            POWER_2: 23,
            POWER_3: 34,
            POWER_4: 51,
            POWER_5: 77,
            POWER_6: 115,
            POWER_7: 173
        },
        PROFIT_MARGIN: 0.65,                  // 65% profit margin (35% cost basis)
        COST_BASIS_MULTIPLIER: 0.35,          // 35% of item value
        PRICE_FLUCTUATION: {
            MIN: 0.8,                          // -20% minimum price
            MAX: 1.2                           // +20% maximum price
        },
        TIPS: {
            BASE_PERCENTAGE: 0.05,             // 5% base tip
            MINIMUM_PERCENTAGE: {
                POWER_1_3: 0.05,               // 5% minimum for low power
                POWER_4_5: 0.08,               // 8% minimum for mid power
                POWER_6_7: 0.12                // 12% minimum for high power
            },
            NPC_MODIFIERS: {
                WEALTH_MULTIPLIER: 0.15,       // Per wealth level
                POWER_MULTIPLIER: 0.33,        // Per power level
                TEAMWORK_BONUS: 0.15           // Logarithmic bonus per worker
            },
            PLAYER_LUCK_SCALING: {
                BASE_MIN: 10,                  // 10% minimum tip
                BASE_MAX: 100,                 // 100% base maximum
                LUCK_EXPONENT: 1.5,            // Exponential scaling
                MASSIVE_TIP_THRESHOLD: 100,    // Luck level for massive tips
                MASSIVE_TIP_CHANCE: 0.10       // 10% chance at high luck
            }
        },
        SYNERGY: {
            ENABLED: true,
            MULTIPLIER: 0.15,                  // 15% bonus per worker (logarithmic)
            FORMULA: 'workers => 1 + (Math.log(workers) * 0.15)'
        },
        TRANSACTION_SAFETY: {                  // NEW
            ENABLE_ROLLBACK: true,             // Enable transaction rollback
            ROLLBACK_TIMEOUT: 5000,            // 5 seconds rollback timeout
            ATOMIC_OPERATIONS: true            // Use atomic DB operations
        }
    },

    // Stat Bonuses Configuration
    STATS: {
        EFFECTIVENESS: {
            SPEED: {
                BONUS_PER_POINT: 0.005,        // 0.5% per point
                MAX_BONUS: 0.5,                 // 50% max bonus
                DESCRIPTION: 'Faster service and order handling'
            },
            SIGHT: {
                BONUS_PER_POINT: 0.004,        // 0.4% per point
                MAX_BONUS: 0.4,                 // 40% max bonus
                DESCRIPTION: 'Better customer attention'
            },
            LUCK: {
                BONUS_PER_POINT: 0.002,        // 0.2% per point
                MAX_BONUS: 0.2,                 // 20% max bonus
                DESCRIPTION: 'Better tips and events'
            },
            MINING: {
                BONUS_PER_POINT: 0.001,        // 0.1% per point
                MAX_BONUS: 0.1,                 // 10% max bonus
                DESCRIPTION: 'Heavy lifting strength'
            }
        },
        PERFORMANCE_TIERS: {
            POOR: { MIN: 0, MAX: 10 },
            DECENT: { MIN: 10, MAX: 25 },
            AVERAGE: { MIN: 25, MAX: 50 },
            GOOD: { MIN: 50, MAX: 100 },
            EXCELLENT: { MIN: 100, MAX: 150 },
            LEGENDARY: { MIN: 150, MAX: Infinity }
        }
    },

    // NPC Configuration
    NPC: {
        FREQUENCY_WEIGHTS: {
            VERY_COMMON: 5,
            COMMON: 3,
            UNCOMMON: 2,
            RARE: 1
        },
        WEALTH_ADJUSTMENT: {
            LOW_POWER: {                       // Power 1-2
                POOR_MULTIPLIER: 4,            // 4x weight for wealth 1-3
                MIDDLE_MULTIPLIER: 2,          // 2x weight for wealth 4-5
                RICH_DIVISOR: 2                // 0.5x weight for wealth 6+
            },
            MID_POWER: {                       // Power 3-4
                MIDDLE_MULTIPLIER: 2           // 2x weight for wealth 4-6
            },
            HIGH_POWER: {                      // Power 5-7
                RICH_MULTIPLIER: 5,            // 5x weight for wealth 7+
                WEALTHY_MULTIPLIER: 3,         // 3x weight for wealth 5-6
                POOR_DIVISOR: 3                // 0.33x weight for wealth 1-3
            }
        },
        BUDGET_LIMITS: {
            LOW: 150,
            MEDIUM: 350,
            HIGH: 1500
        }
    },

    // Coin Find Configuration
    COIN_FINDS: {
        BASE_AMOUNTS: [
            { amount: 1, description: "a single copper coin under a chair" },
            { amount: 2, description: "a few copper coins dropped by tired workers" },
            { amount: 3, description: "some coins that rolled under the bar" },
            { amount: 4, description: "a forgotten tip that fell off a table" },
            { amount: 5, description: "silver coins from a spilled pouch" }
        ],
        RARE_AMOUNTS: [
            { amount: 7, description: "coins hidden in a crack in the floor" },
            { amount: 10, description: "a small purse dropped during the rush" },
            { amount: 15, description: "gold pieces from a gambler's lucky streak" }
        ],
        POWER_MULTIPLIERS: {               // Multiply base amounts by power level
            1: 1.0,   // Miner's Inn: 1-15 coins
            2: 1.5,   // Hunter's Lodge: 1-22 coins
            3: 2.0,   // Power 3: 2-30 coins
            4: 3.0,   // Noble's Rest: 3-45 coins
            5: 4.0,   // Power 5: 4-60 coins
            6: 5.0,   // Power 6: 5-75 coins
            7: 6.0    // Power 7: 6-90 coins
        },
        RARE_THRESHOLD: 50,                    // Luck needed for rare finds
        RARE_CHANCE: 0.3,                      // 30% chance with high luck
        LUCK_DIVISOR: 200                      // Luck bonus calculation (improved from 300)
    },

    // Bar Fight Configuration
    BAR_FIGHTS: [
        // Original fights with new NPCs (works as fallback when AI is unavailable)
        { npc1: "Grimjaw", npc2: "Tethys", reason: "which world had the stronger warriors" },
        { npc1: "Ember", npc2: "Frost-Eye", reason: "whose elemental magic is superior" },
        { npc1: "Driftwood", npc2: "Shard", reason: "who has the worst luck with portals" },
        { npc1: "Whisper", npc2: "Echo", reason: "who was talking too loudly" },
        { npc1: "Null", npc2: "Vex", reason: "a spilled drink that may have been intentional" },
        { npc1: "Stasis", npc2: "Glitch", reason: "whose turn it was to buy the next round" },
        
        // Existing NPCs fights
        { npc1: "Relc Grasstongue", npc2: "Pisces Jealnet", reason: "whose magic is more useful in combat" },
        { npc1: "Lyonette", npc2: "Selys Shivertail", reason: "proper inn management techniques" },
        { npc1: "Klbkch", npc2: "Numbtongue", reason: "a misunderstanding about battle tactics" },
        { npc1: "Olesm", npc2: "Pisces Jealnet", reason: "the proper way to play chess" },
        
        // Mid-power fights
        { npc1: "Chrome", npc2: "Null", reason: "a dispute over portal territory rights" },
        { npc1: "Vex", npc2: "Quantum", reason: "ownership of a mysterious artifact" },
        { npc1: "Yvlon Byres", npc2: "Seborn", reason: "accusations of cheating at cards" },
        { npc1: "Ceria Springwalker", npc2: "Moore", reason: "whose magic is more practical" },
        { npc1: "Jelaqua", npc2: "Grimalkin", reason: "physical training methods" },
        { npc1: "Whisper", npc2: "Grimjaw", reason: "a misunderstanding about currency exchange rates" },
        
        // High-power fights mixing old and new
        { npc1: "Vex", npc2: "Quantum", reason: "a rigged dice game using probability manipulation" },
        { npc1: "Prism", npc2: "Saliss", reason: "whose interdimensional theories are correct" },
        { npc1: "Chrome", npc2: "Ilvriss", reason: "a business deal gone wrong" },
        { npc1: "Quantum", npc2: "Grimalkin", reason: "a rare artifact's true value" },
        { npc1: "Glitch", npc2: "Prism", reason: "incompatible technologies causing interference" },
        { npc1: "Echo", npc2: "Null", reason: "philosophical differences about the nature of Hellungi" },
        { npc1: "Ilvriss", npc2: "Saliss", reason: "proper dress code in the establishment" },
        { npc1: "Rags", npc2: "Ulvama", reason: "goblin leadership hierarchy" },
        { npc1: "Erin", npc2: "Lyonette", reason: "who really runs the inn" }
    ],

    // Rumors
    RUMORS: [
        "a new portal opened near the eastern ridge, spewing strange creatures",
        "travelers from a world of eternal ice arrived yesterday",
        "the portal storms are getting worse this season",
        "someone found ancient ruins between the portal nexuses",
        "interdimensional merchants are selling impossible artifacts",
        "a warrior from a clockwork world seeks companions",
        "the reality tears near the old mine are expanding",
        "refugees from a dying world arrived through the northern portal",
        "strange energies are destabilizing the portal network",
        "a new faction of worldwalkers has formed in the wastes",
        "the Portal Authority is demanding higher taxes",
        "creatures of living shadow emerged from portal seven",
        "a technomancer from the steel realm is offering services",
        "the dimensional barriers are weakening",
        "prophets speak of a great convergence approaching",
        "The One Pick was glimpsed between dimensions last night",
        "miners claim The One Pick created the first portal to Hellungi",
        "The Miner King walks between worlds, still wielding The One Pick"
    ],

    // Innkeeper Comments
    INNKEEPER_COMMENTS: {
        slow: [
            "sighs and wipes down the bar for the third time",
            "reorganizes the bottles behind the bar",
            "checks the clock and mutters about slow days",
            "starts polishing glasses that are already clean",
            "flips through the ledger, counting yesterday's profits",
            "stares out the window, hoping for customers",
            "tastes the soup and adds more seasoning",
            "sweeps the already-clean floor",
            "adjusts the chairs for the fifth time",
            "counts the coins in the till again"
        ],
        moderate: [
            "nods approvingly at the steady flow of customers",
            "efficiently serves drinks while maintaining conversation",
            "calls out a greeting to a regular customer",
            "signals the kitchen to prepare more food",
            "quickly wipes down a table between customers",
            "expertly juggles multiple orders",
            "shares a quick joke with the patrons at the bar"
        ],
        busy: [
            "rushes between tables with practiced efficiency",
            "shouts orders to the kitchen over the din",
            "barely has time to count the coins being handed over",
            "wipes sweat from their brow between orders",
            "calls for backup from the other workers",
            "apologizes for the wait to new arrivals"
        ]
    },

    // Display Configuration
    DISPLAY: {
        SALES_LOG: {
            SEARCH_LIMIT: 2,                   // Messages to search for existing log
            DELETE_LIMIT: 10,                  // Messages to search for old logs
            UPDATE_EXISTING: true               // Update instead of new message
        },
        EVENT_LOG: {
            MAX_EVENTS: 10,                    // Maximum events to display
            COMBINE_SIMILAR: true              // Combine similar events
        },
        COLORS: {
            INN_BROWN: 0x8B4513,
            SUCCESS_GREEN: 0x2ECC71,
            BREAK_ORANGE: 0xF39C12,
            ERROR_RED: 0xE74C3C
        }
    },

    // AI Configuration
    AI: {
        ENABLED: process.env.OPENAI_API_KEY ? true : false,
        MODEL: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
        MAX_TOKENS: parseInt(process.env.OPENAI_MAX_TOKENS) || 60,
        TEMPERATURE: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.9,
        CACHE_TIMEOUT: 5 * 60 * 1000,         // 5 minutes
        MAX_CACHE_SIZE: 100,
        WORLD_CONTEXT: `This takes place in the world of The Wandering Inn in Hellungi, 
                       where levels and classes exist, multiple species interact 
                       (Drakes, Gnolls, Humans, Antinium, Goblins, etc.), 
                       and magic is real. Skills appear in [brackets]. 
                       The One Pick is a legendary artifact.`
    },

    // Employee of the Day Configuration
    EMPLOYEE_OF_DAY: {
        ENABLED: true,
        MIN_WORKERS: 2,                        // Minimum workers to enable
        BONUS_MULTIPLIER: 1.2                    // 2x total payout
    },

    // Database Safety Configuration (NEW)
    DATABASE: {
        USE_TRANSACTIONS: false,               // MongoDB doesn't support multi-doc transactions by default
        USE_ATOMIC_OPERATIONS: true,           // Use findOneAndUpdate, etc.
        OPTIMISTIC_LOCKING: true,              // Use version fields for state changes
        WRITE_CONCERN: 'majority',             // Ensure writes are acknowledged
        READ_PREFERENCE: 'primary',            // Always read from primary for consistency
        MAX_RETRIES: 3,                        // Database operation retry count
        RETRY_DELAY: 1000                      // Delay between retries
    },

    // Debug Configuration
    DEBUG: {
        ENABLED: process.env.NODE_ENV === 'development',
        LOG_EVENTS: true,
        LOG_SALES: true,
        LOG_AI_CALLS: false,
        LOG_TIMING: true,
        LOG_LOCKS: true,                      // NEW: Log lock acquisitions/releases
        LOG_ATOMIC_OPS: false,                 // NEW: Log atomic operations
        LOG_RETRIES: true                      // NEW: Log retry attempts
    }
};
