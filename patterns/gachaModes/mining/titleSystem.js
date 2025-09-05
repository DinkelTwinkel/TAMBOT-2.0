// titleSystem.js - Title and Achievement System for Unique Items
// Tracks player achievements and awards titles using MongoDB

const PlayerTitles = require('../../../models/PlayerTitles');

const TITLES = {
    // The One Pick titles
    HEIR_OF_MINER_KING: {
        id: 'heir_of_miner_king',
        name: 'Heir of the Miner King',
        description: 'Wielder of The One Pick, the legendary tool of kings',
        emoji: '👑',
        rarity: 'mythic',
        requirements: {
            uniqueItem: 1 // The One Pick
        },
        benefits: {
            shopDiscount: 0.2, // 20% shop discount
            teamRespect: true,
            legendaryStatus: true
        }
    },
    
    // Shadow Legion titles
    SHADOW_MASTER: {
        id: 'shadow_master',
        name: 'Shadow Master',
        description: 'Commander of the Shadow Legion, feared across the realm',
        emoji: '👤',
        rarity: 'legendary',
        requirements: {
            uniqueItem: 11, // Shadow Legion Amulet
            shadowOreFound: 100
        },
        benefits: {
            cloneEfficiency: 0.1,
            shadowResistance: 0.2
        }
    },
    
    // Midas titles
    GOLDEN_TOUCH: {
        id: 'golden_touch',
        name: 'Golden Touch',
        description: 'Everything you touch turns to gold',
        emoji: '💰',
        rarity: 'legendary',
        requirements: {
            uniqueItem: 10, // Midas' Burden
            coinsEarned: 1000000
        },
        benefits: {
            coinMultiplier: 0.05,
            wealthAttraction: true
        }
    },
    
    // Phoenix titles
    PHOENIX_REBORN: {
        id: 'phoenix_reborn',
        name: 'Phoenix Reborn',
        description: 'Risen from the ashes, stronger than before',
        emoji: '🔥',
        rarity: 'rare',
        requirements: {
            uniqueItem: 5, // Phoenix Feather Charm
            revivals: 10
        },
        benefits: {
            reviveChance: 0.1,
            fireResistance: 0.2
        }
    },
    
    // Crown titles
    FORGOTTEN_ROYALTY: {
        id: 'forgotten_royalty',
        name: 'Forgotten Royalty',
        description: 'Royal blood flows through your veins',
        emoji: '👑',
        rarity: 'epic',
        requirements: {
            uniqueItem: 7, // Crown of the Forgotten King
            npcsCommanded: 50
        },
        benefits: {
            npcDiscount: 0.5,
            royalRespect: true
        }
    },
    
    // Achievement-based titles
    MASTER_MINER: {
        id: 'master_miner',
        name: 'Master Miner',
        description: 'A legendary miner who has broken a thousand walls',
        emoji: '⛏️',
        rarity: 'epic',
        requirements: {
            wallsBroken: 1000,
            oreFound: 5000
        },
        benefits: {
            miningSpeed: 0.1,
            wallBreakChance: 0.05
        }
    },
    
    TREASURE_HUNTER: {
        id: 'treasure_hunter',
        name: 'Treasure Hunter',
        description: 'Found more treasures than any other adventurer',
        emoji: '💎',
        rarity: 'rare',
        requirements: {
            treasuresFound: 100,
            rareItemsFound: 50
        },
        benefits: {
            treasureFindChance: 0.05,
            luckBonus: 1
        }
    },
    
    HAZARD_SURVIVOR: {
        id: 'hazard_survivor',
        name: 'Hazard Survivor',
        description: 'Survived countless dangers in the depths',
        emoji: '🛡️',
        rarity: 'uncommon',
        requirements: {
            hazardsSurvived: 200,
            deathsAvoided: 50
        },
        benefits: {
            hazardResistance: 0.1,
            survivalBonus: 0.05
        }
    },
    
    TEAM_LEADER: {
        id: 'team_leader',
        name: 'Team Leader',
        description: 'Led countless mining expeditions to success',
        emoji: '⭐',
        rarity: 'rare',
        requirements: {
            teamMiningTime: 100 * 60 * 60 * 1000, // 100 hours
            playersHelped: 100
        },
        benefits: {
            teamBonusRange: 1,
            leadershipAura: 0.05
        }
    },
    
    // Mining Tree Completion Titles
    ALL_BLACK_CONQUEROR: {
        id: 'all_black_conqueror',
        name: 'Conqueror of the All Black',
        description: 'Reached the absolute core of coal deposits where black diamonds form',
        emoji: '⚫',
        rarity: 'legendary',
        requirements: {
            mineReached: 113 // The All Black
        },
        benefits: {
            coalMastery: 0.2,
            darkPower: 0.1,
            voidResistance: 0.15
        }
    },
    
    SUN_UNDER_MASTER: {
        id: 'sun_under_master',
        name: 'Master of the Sun Under',
        description: 'Delved into the underground sun where topaz crystals hold stellar power',
        emoji: '⭐',
        rarity: 'legendary',
        requirements: {
            mineReached: 114 // The Sun Under
        },
        benefits: {
            solarMastery: 0.2,
            lightPower: 0.15,
            heatResistance: 0.2
        }
    },
    
    DIAMOND_CROWN_HEIR: {
        id: 'diamond_crown_heir',
        name: 'Heir to the Diamond Crown',
        description: 'Claimed the ultimate crown of diamonds where reality crystallizes',
        emoji: '💠',
        rarity: 'legendary',
        requirements: {
            mineReached: 115 // The Diamond Crown
        },
        benefits: {
            diamondMastery: 0.25,
            crystalPower: 0.2,
            wealthAttraction: 0.1
        }
    },
    
    WORLD_TREE_GUARDIAN: {
        id: 'world_tree_guardian',
        name: 'Guardian of the World Tree',
        description: 'Touched the root of Yggdrasil crystallized in pure emerald',
        emoji: '🌳',
        rarity: 'legendary',
        requirements: {
            mineReached: 116 // Emerald World Tree
        },
        benefits: {
            natureMastery: 0.2,
            lifePower: 0.25,
            regeneration: 0.05
        }
    },
    
    VOLCANICA_CHAMPION: {
        id: 'volcanica_champion',
        name: 'Champion of Volcanica',
        description: 'Survived the volcanic heart where rubies form from pure magma',
        emoji: '🌋',
        rarity: 'legendary',
        requirements: {
            mineReached: 117 // Volcanica
        },
        benefits: {
            volcanicMastery: 0.25,
            fireResistance: 1.0, // Complete fire immunity
            magmaPower: 0.2
        }
    },
    
    BLACK_HEART_WIELDER: {
        id: 'black_heart_wielder',
        name: 'Wielder of the Black Heart',
        description: 'Grasped the obsidian heart where darkness gains physical form',
        emoji: '🖤',
        rarity: 'legendary',
        requirements: {
            mineReached: 118 // The Black Heart
        },
        benefits: {
            obsidianMastery: 0.2,
            darkPower: 0.25,
            voidWalk: 0.1
        }
    },
    
    COSMOS_EXPLORER: {
        id: 'cosmos_explorer',
        name: 'Explorer of Blue Cosmos',
        description: 'Ventured into the mythril cosmos where space itself crystallizes',
        emoji: '🌠',
        rarity: 'legendary',
        requirements: {
            mineReached: 119 // Blue Cosmos
        },
        benefits: {
            mythrilMastery: 0.25,
            cosmicPower: 0.2,
            spaceWalk: 0.15
        }
    },
    
    COPPER_THRONE_RULER: {
        id: 'copper_throne_ruler',
        name: 'Ruler of the Copper Throne',
        description: 'Commanded the primordial forge where copper was first created',
        emoji: '⚡',
        rarity: 'legendary',
        requirements: {
            mineReached: 120 // Copper Throne
        },
        benefits: {
            copperMastery: 0.2,
            electricPower: 0.25,
            lightningResistance: 1.0
        }
    },
    
    BLACK_IRON_LORD: {
        id: 'black_iron_lord',
        name: 'Lord of Black Iron',
        description: 'Mastered the convergence point where all iron in the universe meets',
        emoji: '🔩',
        rarity: 'legendary',
        requirements: {
            mineReached: 121 // Black Iron
        },
        benefits: {
            ironMastery: 0.25,
            magneticPower: 0.2,
            molecularControl: 0.1
        }
    },
    
    CRYSTAL_ETERNAL: {
        id: 'crystal_eternal',
        name: 'Crystal Eternal',
        description: 'Witnessed eternity in the crystal garden where time has no meaning',
        emoji: '💫',
        rarity: 'legendary',
        requirements: {
            mineReached: 122 // Crystal Eternity
        },
        benefits: {
            crystalMastery: 0.25,
            timePower: 0.2,
            futureVision: 0.15
        }
    },
    
    ORIGIN_WITNESS: {
        id: 'origin_witness',
        name: 'Witness of the Origin',
        description: 'Beheld the moment life began, frozen in primordial stone',
        emoji: '🦕',
        rarity: 'legendary',
        requirements: {
            mineReached: 123 // The Origin
        },
        benefits: {
            primordialMastery: 0.25,
            creationPower: 0.2,
            ancientWisdom: 0.3
        }
    }
};

const ACHIEVEMENTS = {
    // Mining achievements
    FIRST_WALL: {
        id: 'first_wall',
        name: 'First Steps',
        description: 'Broke your first wall',
        requirements: { wallsBroken: 1 },
        reward: { coins: 10, title: null }
    },
    
    HUNDRED_WALLS: {
        id: 'hundred_walls',
        name: 'Wall Breaker',
        description: 'Broke 100 walls',
        requirements: { wallsBroken: 100 },
        reward: { coins: 100, title: null }
    },
    
    FIRST_TREASURE: {
        id: 'first_treasure',
        name: 'Lucky Find',
        description: 'Found your first treasure',
        requirements: { treasuresFound: 1 },
        reward: { coins: 50, title: null }
    },
    
    UNIQUE_COLLECTOR: {
        id: 'unique_collector',
        name: 'Unique Collector',
        description: 'Collected your first unique item',
        requirements: { uniqueItemsFound: 1 },
        reward: { coins: 500, title: null }
    },
    
    SHADOW_ORE_FINDER: {
        id: 'shadow_ore_finder',
        name: 'Shadow Seeker',
        description: 'Found your first Shadow Ore',
        requirements: { shadowOreFound: 1 },
        reward: { coins: 200, title: null }
    },
    
    // Survival achievements
    HAZARD_SURVIVOR_ACH: {
        id: 'hazard_survivor_ach',
        name: 'Danger Zone',
        description: 'Survived 10 hazards',
        requirements: { hazardsSurvived: 10 },
        reward: { coins: 150, title: null }
    },
    
    PHOENIX_RISE: {
        id: 'phoenix_rise',
        name: 'Rise from Ashes',
        description: 'Revived from death',
        requirements: { revivals: 1 },
        reward: { coins: 300, title: null }
    },
    
    // Team achievements
    TEAM_PLAYER: {
        id: 'team_player',
        name: 'Team Player',
        description: 'Mined with others for 10 hours',
        requirements: { teamMiningTime: 10 * 60 * 60 * 1000 },
        reward: { coins: 200, title: null }
    },
    
    // Wealth achievements
    FIRST_THOUSAND: {
        id: 'first_thousand',
        name: 'Getting Rich',
        description: 'Earned your first 1000 coins',
        requirements: { coinsEarned: 1000 },
        reward: { coins: 100, title: null }
    },
    
    MILLIONAIRE: {
        id: 'millionaire',
        name: 'Millionaire Miner',
        description: 'Earned 1,000,000 coins',
        requirements: { coinsEarned: 1000000 },
        reward: { coins: 10000, title: 'GOLDEN_TOUCH' }
    }
};

/**
 * Get or create player titles document
 */
async function getOrCreatePlayerTitles(playerId, playerName = 'Unknown', guildId = null) {
    try {
        let playerTitles = await PlayerTitles.findByPlayer(playerId, guildId);
        
        if (!playerTitles) {
            // Create new player titles document
            playerTitles = new PlayerTitles({
                playerId,
                playerName,
                guildId: guildId || 'unknown',
                availableTitles: [],
                activeTitles: [],
                displayTitle: null,
                achievements: [],
                progress: {
                    wallsBroken: 0,
                    oreFound: 0,
                    treasuresFound: 0,
                    rareItemsFound: 0,
                    uniqueItemsFound: 0,
                    shadowOreFound: 0,
                    hazardsSurvived: 0,
                    deathsAvoided: 0,
                    revivals: 0,
                    coinsEarned: 0,
                    teamMiningTime: 0,
                    playersHelped: 0,
                    npcsCommanded: 0,
                    minesReached: [],
                    equippedUniqueItems: []
                },
                discordRoles: []
            });
            
            await playerTitles.save();
            console.log(`[TITLES] Created new player titles document for ${playerId}`);
        }
        
        return playerTitles;
    } catch (error) {
        console.error(`[TITLES] Error getting/creating player titles for ${playerId}:`, error);
        return null;
    }
}

/**
 * Update player progress
 */
async function updatePlayerProgress(playerId, progressType, amount = 1, playerName = 'Unknown', guildId = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, playerName, guildId);
        if (!playerTitles) return false;
        
        // Update progress
        const updated = playerTitles.updateProgress(progressType, amount);
        if (updated) {
            await playerTitles.save();
            
            // Check for new achievements and titles
            await checkAchievements(playerId, playerName, guildId);
            await checkTitles(playerId, playerName, guildId);
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`[TITLES] Error updating progress for ${playerId}:`, error);
        return false;
    }
}

/**
 * Check for new achievements
 */
async function checkAchievements(playerId, playerName = 'Unknown', guildId = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, playerName, guildId);
        if (!playerTitles) return [];
        
        const newAchievements = [];
        
        for (const [achievementId, achievement] of Object.entries(ACHIEVEMENTS)) {
            if (playerTitles.hasAchievement(achievementId)) continue;
            
            // Check if requirements are met
            let requirementsMet = true;
            for (const [requirement, value] of Object.entries(achievement.requirements)) {
                if (playerTitles.progress[requirement] < value) {
                    requirementsMet = false;
                    break;
                }
            }
            
            if (requirementsMet) {
                playerTitles.addAchievement(achievementId);
                newAchievements.push(achievement);
                
                // Award title if specified
                if (achievement.reward.title) {
                    await awardTitle(playerId, achievement.reward.title, playerName, guildId);
                }
                
                await playerTitles.save();
                console.log(`[TITLES] ${playerId} earned achievement: ${achievement.name}`);
            }
        }
        
        return newAchievements;
    } catch (error) {
        console.error(`[TITLES] Error checking achievements for ${playerId}:`, error);
        return [];
    }
}

/**
 * Check for new titles
 */
async function checkTitles(playerId, playerName = 'Unknown', guildId = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, playerName, guildId);
        if (!playerTitles) return [];
        
        const newTitles = [];
        
        for (const [titleId, title] of Object.entries(TITLES)) {
            if (playerTitles.hasTitle(titleId)) continue;
            
            // Check if requirements are met
            let requirementsMet = true;
            for (const [requirement, value] of Object.entries(title.requirements)) {
                if (requirement === 'uniqueItem') {
                    const hasItem = playerTitles.progress.equippedUniqueItems.some(item => item.itemId === value);
                    if (!hasItem) {
                        requirementsMet = false;
                        break;
                    }
                } else if (requirement === 'mineReached') {
                    const hasReached = playerTitles.progress.minesReached.some(mine => mine.mineId === value);
                    if (!hasReached) {
                        requirementsMet = false;
                        break;
                    }
                } else if (playerTitles.progress[requirement] < value) {
                    requirementsMet = false;
                    break;
                }
            }
            
            if (requirementsMet) {
                playerTitles.addTitle(titleId);
                newTitles.push(title);
                
                await playerTitles.save();
                console.log(`[TITLES] ${playerId} unlocked title: ${title.name}`);
            }
        }
        
        return newTitles;
    } catch (error) {
        console.error(`[TITLES] Error checking titles for ${playerId}:`, error);
        return [];
    }
}

/**
 * Award a title to a player
 */
async function awardTitle(playerId, titleId, playerName = 'Unknown', guildId = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, playerName, guildId);
        if (!playerTitles) return false;
        
        const title = TITLES[titleId];
        
        if (title && !playerTitles.hasTitle(titleId)) {
            playerTitles.addTitle(titleId);
            
            // Auto-equip legendary+ titles
            if (title.rarity === 'legendary' || title.rarity === 'mythic') {
                playerTitles.activeTitles = [titleId]; // Clear others and set this one
                playerTitles.displayTitle = titleId;
            }
            
            await playerTitles.save();
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`[TITLES] Error awarding title ${titleId} to ${playerId}:`, error);
        return false;
    }
}

/**
 * Equip a title (with Discord role management)
 */
async function equipTitle(playerId, titleId, member = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, member?.displayName, member?.guild?.id);
        if (!playerTitles) return { success: false, role: null, message: 'Could not access player data' };
        
        console.log(`[TITLES] equipTitle: Looking for titleId=${titleId} for player=${playerId}`);
        console.log(`[TITLES] Player has ${playerTitles.availableTitles.length} available titles`);
        console.log(`[TITLES] Available title IDs: ${playerTitles.availableTitles.map(t => t.titleId).join(', ')}`);
        
        if (playerTitles.hasTitle(titleId)) {
            console.log(`[TITLES] Title found in player's available titles, equipping...`);
            // Clear all other active titles (only one title can be displayed at a time)
            playerTitles.activeTitles = [titleId];
            playerTitles.displayTitle = titleId;
            
            // Update times equipped
            const titleData = playerTitles.availableTitles.find(t => t.titleId === titleId);
            if (titleData) {
                titleData.timesEquipped++;
                titleData.lastEquipped = new Date();
            }
            
            await playerTitles.save();
            
            // Manage Discord roles if member is provided
            if (member) {
                try {
                    const { equipTitleRole } = require('./titleRoleManager');
                    const roleResult = await equipTitleRole(member, titleId);
                    
                    // Update Discord role info in database
                    if (roleResult.success && roleResult.role) {
                        playerTitles.discordRoles = [{
                            roleId: roleResult.role.id,
                            roleName: roleResult.role.name,
                            titleId: titleId,
                            assignedAt: new Date()
                        }];
                        await playerTitles.save();
                    }
                    
                    if (roleResult.success) {
                        console.log(`[TITLES] Successfully equipped role for ${member.displayName}: ${titleId}`);
                        return { success: true, role: roleResult.role, message: roleResult.message };
                    } else {
                        console.warn(`[TITLES] Failed to equip role: ${roleResult.message}`);
                        return { success: true, role: null, message: 'Title equipped but role creation failed' };
                    }
                } catch (roleError) {
                    console.error(`[TITLES] Error managing role for title ${titleId}:`, roleError);
                    return { success: true, role: null, message: 'Title equipped but role management failed' };
                }
            }
            
            return { success: true, role: null, message: 'Title equipped successfully' };
        }
        
        console.log(`[TITLES] Title ${titleId} not found in database but was in menu - this suggests a sync issue`);
        
        // Check if this title should be available based on requirements
        const titleDefinition = Object.values(TITLES).find(t => t.id === titleId);
        if (titleDefinition) {
            console.log(`[TITLES] Checking if player should have title ${titleId}...`);
            
            // Check requirements
            let shouldHaveTitle = true;
            for (const [requirement, value] of Object.entries(titleDefinition.requirements)) {
                if (requirement === 'uniqueItem') {
                    const hasItem = playerTitles.progress.equippedUniqueItems.some(item => item.itemId === value);
                    if (!hasItem) {
                        shouldHaveTitle = false;
                        break;
                    }
                } else if (requirement === 'mineReached') {
                    const hasReached = playerTitles.progress.minesReached.some(mine => mine.mineId === value);
                    if (!hasReached) {
                        shouldHaveTitle = false;
                        break;
                    }
                } else if (playerTitles.progress[requirement] < value) {
                    shouldHaveTitle = false;
                    break;
                }
            }
            
            if (shouldHaveTitle) {
                console.log(`[TITLES] Player meets requirements, auto-granting title ${titleId}`);
                playerTitles.addTitle(titleId);
                playerTitles.activeTitles = [titleId];
                playerTitles.displayTitle = titleId;
                await playerTitles.save();
                
                // Continue with role assignment
                if (member) {
                    try {
                        const { equipTitleRole } = require('./titleRoleManager');
                        const roleResult = await equipTitleRole(member, titleId);
                        
                        if (roleResult.success && roleResult.role) {
                            playerTitles.discordRoles = [{
                                roleId: roleResult.role.id,
                                roleName: roleResult.role.name,
                                titleId: titleId,
                                assignedAt: new Date()
                            }];
                            await playerTitles.save();
                        }
                        
                        return { success: true, role: roleResult.role, message: `Title auto-granted and equipped! ${roleResult.message}` };
                    } catch (roleError) {
                        return { success: true, role: null, message: 'Title auto-granted but role assignment failed' };
                    }
                }
                
                return { success: true, role: null, message: 'Title auto-granted and equipped!' };
            }
        }
        
        return { success: false, role: null, message: 'Title not available - requirements not met' };
    } catch (error) {
        console.error(`[TITLES] Error equipping title ${titleId} for ${playerId}:`, error);
        return { success: false, role: null, message: 'Database error' };
    }
}

/**
 * Unequip all titles (and remove roles)
 */
async function unequipAllTitles(playerId, member = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, member?.displayName, member?.guild?.id);
        if (!playerTitles) return { success: false, removedRoles: 0 };
        
        playerTitles.activeTitles = [];
        playerTitles.displayTitle = null;
        playerTitles.discordRoles = [];
        
        await playerTitles.save();
        
        // Remove Discord roles if member is provided
        if (member) {
            try {
                const { removeAllTitleRoles } = require('./titleRoleManager');
                const removedCount = await removeAllTitleRoles(member);
                
                console.log(`[TITLES] Removed ${removedCount} title roles from ${member.displayName}`);
                return { success: true, removedRoles: removedCount };
            } catch (roleError) {
                console.error(`[TITLES] Error removing roles:`, roleError);
                return { success: true, removedRoles: 0 };
            }
        }
        
        return { success: true, removedRoles: 0 };
    } catch (error) {
        console.error(`[TITLES] Error unequipping titles for ${playerId}:`, error);
        return { success: false, removedRoles: 0 };
    }
}

/**
 * Get player titles
 */
async function getPlayerTitles(playerId, playerName = 'Unknown', guildId = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, playerName, guildId);
        if (!playerTitles) return { available: [], display: null, achievements: [] };
        
        return {
            available: playerTitles.availableTitles.map(titleData => {
                // Find title by ID since TITLES uses uppercase keys
                const titleDefinition = Object.values(TITLES).find(t => t.id === titleData.titleId);
                if (!titleDefinition) {
                    console.warn(`[TITLES] Could not find title definition for ID: ${titleData.titleId}`);
                    return null;
                }
                
                return {
                    id: titleData.titleId,
                    ...titleDefinition,
                    active: playerTitles.activeTitles.includes(titleData.titleId),
                    unlockedAt: titleData.unlockedAt,
                    timesEquipped: titleData.timesEquipped,
                    lastEquipped: titleData.lastEquipped
                };
            }).filter(title => title !== null), // Remove any null entries
            display: playerTitles.displayTitle ? (() => {
                // Find title by ID since TITLES uses uppercase keys
                const titleData = Object.values(TITLES).find(t => t.id === playerTitles.displayTitle);
                return titleData ? {
                    id: playerTitles.displayTitle,
                    ...titleData
                } : null;
            })() : null,
            achievements: playerTitles.achievements.map(achData => ({
                id: achData.achievementId,
                ...ACHIEVEMENTS[achData.achievementId],
                unlockedAt: achData.unlockedAt,
                progress: achData.progress
            }))
        };
    } catch (error) {
        console.error(`[TITLES] Error getting player titles for ${playerId}:`, error);
        return { available: [], display: null, achievements: [] };
    }
}

/**
 * Get title benefits for a player
 */
async function getTitleBenefits(playerId, playerName = 'Unknown', guildId = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, playerName, guildId);
        if (!playerTitles) return {};
        
        const benefits = {};
        
        for (const titleId of playerTitles.activeTitles) {
            const title = TITLES[titleId];
            if (title && title.benefits) {
                for (const [benefit, value] of Object.entries(title.benefits)) {
                    if (typeof value === 'number') {
                        benefits[benefit] = (benefits[benefit] || 0) + value;
                    } else {
                        benefits[benefit] = value;
                    }
                }
            }
        }
        
        return benefits;
    } catch (error) {
        console.error(`[TITLES] Error getting title benefits for ${playerId}:`, error);
        return {};
    }
}

/**
 * Update equipped unique items for title checking
 */
async function updateEquippedUniqueItems(playerId, equippedItems, playerName = 'Unknown', guildId = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, playerName, guildId);
        if (!playerTitles) return;
        
        // Clear existing equipped items
        playerTitles.progress.equippedUniqueItems = [];
        
        if (equippedItems) {
            for (const item of Object.values(equippedItems)) {
                if (item.isUnique && item.uniqueItemId) {
                    playerTitles.progress.equippedUniqueItems.push({
                        itemId: parseInt(item.uniqueItemId),
                        equippedAt: new Date()
                    });
                }
            }
        }
        
        await playerTitles.save();
        
        // Check for new titles based on equipped items
        await checkTitles(playerId, playerName, guildId);
    } catch (error) {
        console.error(`[TITLES] Error updating equipped items for ${playerId}:`, error);
    }
}

/**
 * Track when player reaches a new mine
 */
async function updateMineReached(playerId, mineId, playerName = 'Unknown', guildId = null) {
    try {
        const playerTitles = await getOrCreatePlayerTitles(playerId, playerName, guildId);
        if (!playerTitles) return [];
        
        const mineIdNum = parseInt(mineId);
        
        // Check if this is a new mine
        const isNewMine = playerTitles.addMineReached(mineIdNum);
        
        if (isNewMine) {
            await playerTitles.save();
            console.log(`[TITLES] Player ${playerId} reached new mine ${mineId}`);
            
            // Check for new titles based on mine reached
            const newTitles = await checkTitles(playerId, playerName, guildId);
            
            // Return any new titles earned for immediate notification
            return newTitles.filter(title => title.requirements.mineReached === mineIdNum);
        }
        
        return [];
    } catch (error) {
        console.error(`[TITLES] Error updating mine reached for ${playerId}:`, error);
        return [];
    }
}

module.exports = {
    TITLES,
    ACHIEVEMENTS,
    PlayerTitles, // Export the model
    getOrCreatePlayerTitles,
    updatePlayerProgress,
    checkAchievements,
    checkTitles,
    awardTitle,
    equipTitle,
    unequipAllTitles,
    getPlayerTitles,
    getTitleBenefits,
    updateEquippedUniqueItems,
    updateMineReached
};
