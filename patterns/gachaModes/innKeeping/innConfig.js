// innKeeping/innConfig.js
// Centralized configuration for the inn system

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

    // Event Probabilities
    EVENTS: {
        NPC_SALE: {
            BASE_CHANCE: 0.70,                // 70% base chance
            FORCED_CHANCE: 0.85,              // 85% when forcing event
            COOLDOWN: 5000                    // 5 second cooldown
        },
        RANDOM_EVENT: {
            BASE_CHANCE: 0.60,                // 60% base chance
            FORCED_CHANCE: 0.80,              // 80% when forcing
            COOLDOWN: 5000,                   // 5 second cooldown
            DISTRIBUTION: {
                BAR_FIGHT: 0.20,              // 20% of random events
                RUMOR: 0.20,                  // 20% of random events
                COIN_FIND: 0.60               // 60% of random events
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
            FORMULA: 'power => 100 * Math.pow(2, power - 1)',
            POWER_1: 100,
            POWER_2: 200,
            POWER_3: 400,
            POWER_4: 800,
            POWER_5: 1600,
            POWER_6: 3200,
            POWER_7: 6400
        },
        PROFIT_MARGIN: 0.95,                  // 95% profit margin (5% cost basis)
        COST_BASIS_MULTIPLIER: 0.05,          // 5% of item value
        PRICE_FLUCTUATION: {
            MIN: 0.8,                          // -20% minimum price
            MAX: 1.2                           // +20% maximum price
        },
        TIPS: {
            BASE_PERCENTAGE: 0.10,             // 10% base tip
            MINIMUM_PERCENTAGE: {
                POWER_1_3: 0.10,               // 10% minimum for low power
                POWER_4_5: 0.15,               // 15% minimum for mid power
                POWER_6_7: 0.25                // 25% minimum for high power
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
        RARE_THRESHOLD: 50,                    // Luck needed for rare finds
        RARE_CHANCE: 0.3,                      // 30% chance with high luck
        LUCK_DIVISOR: 300                      // Luck bonus calculation
    },

    // Bar Fight Configuration
    BAR_FIGHTS: [
        { npc1: "Grimjaw", npc2: "Tethys", reason: "which world had the stronger warriors" },
        { npc1: "Shadowbane", npc2: "Chrome", reason: "a dispute over portal territory rights" },
        { npc1: "Frost-Eye", npc2: "Ember", reason: "conflicting dimensional theories" },
        { npc1: "The Collector", npc2: "Voidwhisper", reason: "ownership of a mysterious artifact" },
        { npc1: "Steelclaw", npc2: "Mirage", reason: "accusations of interdimensional smuggling" },
        { npc1: "Portalkeeper Zax", npc2: "Grimjaw", reason: "unpaid portal passage fees" },
        { npc1: "Nexus", npc2: "Shard", reason: "conflicting claims about their home worlds" },
        { npc1: "Whisper", npc2: "Ironhide", reason: "a misunderstanding about currency exchange rates" },
        { npc1: "Vex", npc2: "Quantum", reason: "a rigged dice game using probability manipulation" },
        { npc1: "Driftwood", npc2: "Stasis", reason: "who arrived in Hellungi first" },
        { npc1: "Glitch", npc2: "Prism", reason: "incompatible technologies causing interference" },
        { npc1: "Echo", npc2: "Null", reason: "philosophical differences about the nature of Hellungi" }
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
        BONUS_MULTIPLIER: 2                    // 2x total payout
    },

    // Debug Configuration
    DEBUG: {
        ENABLED: process.env.NODE_ENV === 'development',
        LOG_EVENTS: true,
        LOG_SALES: true,
        LOG_AI_CALLS: false,
        LOG_TIMING: true
    }
};
