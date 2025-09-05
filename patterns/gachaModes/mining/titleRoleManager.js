// titleRoleManager.js - Discord Role Management for Mining Titles
// Automatically creates and manages Discord roles for player titles

const TITLE_ROLE_CONFIGS = {
    // Unique Item Titles
    'heir_of_miner_king': {
        name: '👑 Heir of the Miner King',
        color: '#FFD700', // Gold
        position: 10
    },
    'shadow_master': {
        name: '👤 Shadow Master',
        color: '#4B0082', // Indigo
        position: 9
    },
    'golden_touch': {
        name: '💰 Golden Touch',
        color: '#FFD700', // Gold
        position: 9
    },
    'phoenix_reborn': {
        name: '🔥 Phoenix Reborn',
        color: '#FF4500', // Orange Red
        position: 8
    },
    'forgotten_royalty': {
        name: '👑 Forgotten Royalty',
        color: '#9932CC', // Dark Orchid
        position: 8
    },
    
    // Achievement Titles
    'master_miner': {
        name: '⛏️ Master Miner',
        color: '#8B4513', // Saddle Brown
        position: 7
    },
    'treasure_hunter': {
        name: '💎 Treasure Hunter',
        color: '#00CED1', // Dark Turquoise
        position: 6
    },
    'hazard_survivor': {
        name: '🛡️ Hazard Survivor',
        color: '#32CD32', // Lime Green
        position: 5
    },
    'team_leader': {
        name: '⭐ Team Leader',
        color: '#FF69B4', // Hot Pink
        position: 7
    },
    
    // Mining Tree Completion Titles
    'all_black_conqueror': {
        name: '⚫ Conqueror of the All Black',
        color: '#2F2F2F', // Dark Gray
        position: 10
    },
    'sun_under_master': {
        name: '⭐ Master of the Sun Under',
        color: '#FFFF00', // Yellow
        position: 10
    },
    'diamond_crown_heir': {
        name: '💠 Heir to the Diamond Crown',
        color: '#E0E0FF', // Lavender
        position: 10
    },
    'world_tree_guardian': {
        name: '🌳 Guardian of the World Tree',
        color: '#00FF00', // Lime
        position: 10
    },
    'volcanica_champion': {
        name: '🌋 Champion of Volcanica',
        color: '#FF0000', // Red
        position: 10
    },
    'black_heart_wielder': {
        name: '🖤 Wielder of the Black Heart',
        color: '#0A0A0A', // Almost Black
        position: 10
    },
    'cosmos_explorer': {
        name: '🌠 Explorer of Blue Cosmos',
        color: '#0000FF', // Blue
        position: 10
    },
    'copper_throne_ruler': {
        name: '⚡ Ruler of the Copper Throne',
        color: '#FF6600', // Orange
        position: 10
    },
    'black_iron_lord': {
        name: '🔩 Lord of Black Iron',
        color: '#2A2A2A', // Dark Gray
        position: 10
    },
    'crystal_eternal': {
        name: '💫 Crystal Eternal',
        color: '#FF00FF', // Magenta
        position: 10
    },
    'origin_witness': {
        name: '🦕 Witness of the Origin',
        color: '#654321', // Brown
        position: 10
    }
};

// Cache for guild roles to avoid repeated API calls
const guildRoleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get or create a role for a title
 */
async function getOrCreateTitleRole(guild, titleId) {
    try {
        const config = TITLE_ROLE_CONFIGS[titleId];
        if (!config) {
            console.warn(`[TITLE ROLES] No role config found for title: ${titleId}`);
            return null;
        }
        
        // Check cache first
        const cacheKey = `${guild.id}_${titleId}`;
        const cached = guildRoleCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return cached.role;
        }
        
        // Search for existing role
        const existingRole = guild.roles.cache.find(role => 
            role.name === config.name || 
            role.name.includes(config.name.replace(/[^\w\s]/g, '')) // Remove emojis for matching
        );
        
        if (existingRole) {
            console.log(`[TITLE ROLES] Found existing role: ${existingRole.name}`);
            
            // Update cache
            guildRoleCache.set(cacheKey, {
                role: existingRole,
                timestamp: Date.now()
            });
            
            return existingRole;
        }
        
        // Create new role
        console.log(`[TITLE ROLES] Creating new role: ${config.name}`);
        const newRole = await guild.roles.create({
            name: config.name,
            color: config.color,
            position: config.position,
            hoist: false, // Don't display separately in member list
            mentionable: false,
            reason: `Mining title role for ${titleId}`
        });
        
        // Update cache
        guildRoleCache.set(cacheKey, {
            role: newRole,
            timestamp: Date.now()
        });
        
        console.log(`[TITLE ROLES] Created role: ${newRole.name} (${newRole.hexColor})`);
        return newRole;
        
    } catch (error) {
        console.error(`[TITLE ROLES] Error getting/creating role for ${titleId}:`, error);
        return null;
    }
}

/**
 * Equip a title role to a player (removes other title roles)
 */
async function equipTitleRole(member, titleId) {
    try {
        const guild = member.guild;
        
        // Get the role for this title
        const titleRole = await getOrCreateTitleRole(guild, titleId);
        if (!titleRole) {
            return { success: false, message: 'Could not create role for title' };
        }
        
        // Remove all other title roles from the player
        const titleRoleIds = new Set(Object.values(TITLE_ROLE_CONFIGS).map(config => config.name));
        const rolesToRemove = member.roles.cache.filter(role => {
            return titleRoleIds.has(role.name) || 
                   role.name.includes('⚫') || role.name.includes('⭐') || role.name.includes('💠') ||
                   role.name.includes('🌳') || role.name.includes('🌋') || role.name.includes('🖤') ||
                   role.name.includes('🌠') || role.name.includes('⚡') || role.name.includes('🔩') ||
                   role.name.includes('💫') || role.name.includes('🦕') || role.name.includes('👑') ||
                   role.name.includes('👤') || role.name.includes('💰') || role.name.includes('🔥') ||
                   role.name.includes('⛏️') || role.name.includes('💎') || role.name.includes('🛡️');
        });
        
        // Remove old title roles
        if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove, 'Removing old title roles');
            console.log(`[TITLE ROLES] Removed ${rolesToRemove.size} old title roles from ${member.displayName}`);
        }
        
        // Add new title role
        if (!member.roles.cache.has(titleRole.id)) {
            await member.roles.add(titleRole, `Equipped title: ${titleId}`);
            console.log(`[TITLE ROLES] Added role ${titleRole.name} to ${member.displayName}`);
        }
        
        return { 
            success: true, 
            message: `Role ${titleRole.name} equipped!`,
            role: titleRole
        };
        
    } catch (error) {
        console.error(`[TITLE ROLES] Error equipping title role:`, error);
        return { success: false, message: 'Failed to equip title role' };
    }
}

/**
 * Remove all title roles from a player
 */
async function removeAllTitleRoles(member) {
    try {
        const guild = member.guild;
        
        // Find all title roles on this member
        const titleRoleIds = new Set(Object.values(TITLE_ROLE_CONFIGS).map(config => config.name));
        const titleRoles = member.roles.cache.filter(role => {
            return titleRoleIds.has(role.name) || 
                   role.name.includes('⚫') || role.name.includes('⭐') || role.name.includes('💠') ||
                   role.name.includes('🌳') || role.name.includes('🌋') || role.name.includes('🖤') ||
                   role.name.includes('🌠') || role.name.includes('⚡') || role.name.includes('🔩') ||
                   role.name.includes('💫') || role.name.includes('🦕') || role.name.includes('👑') ||
                   role.name.includes('👤') || role.name.includes('💰') || role.name.includes('🔥') ||
                   role.name.includes('⛏️') || role.name.includes('💎') || role.name.includes('🛡️');
        });
        
        if (titleRoles.size > 0) {
            await member.roles.remove(titleRoles, 'Removing all title roles');
            console.log(`[TITLE ROLES] Removed ${titleRoles.size} title roles from ${member.displayName}`);
            return titleRoles.size;
        }
        
        return 0;
        
    } catch (error) {
        console.error(`[TITLE ROLES] Error removing title roles:`, error);
        return 0;
    }
}

/**
 * Get title role information for a guild
 */
async function getTitleRoleInfo(guild) {
    try {
        const titleRoles = [];
        
        for (const [titleId, config] of Object.entries(TITLE_ROLE_CONFIGS)) {
            const role = guild.roles.cache.find(role => role.name === config.name);
            
            titleRoles.push({
                titleId,
                config,
                role: role || null,
                memberCount: role ? role.members.size : 0,
                exists: !!role
            });
        }
        
        return titleRoles;
        
    } catch (error) {
        console.error(`[TITLE ROLES] Error getting title role info:`, error);
        return [];
    }
}

/**
 * Clean up unused title roles (roles with no members)
 */
async function cleanupUnusedTitleRoles(guild) {
    try {
        let deletedCount = 0;
        
        const titleRoleNames = Object.values(TITLE_ROLE_CONFIGS).map(config => config.name);
        
        for (const role of guild.roles.cache.values()) {
            if (titleRoleNames.includes(role.name) && role.members.size === 0) {
                // Role exists but has no members, delete it
                await role.delete('Cleaning up unused title role');
                console.log(`[TITLE ROLES] Deleted unused role: ${role.name}`);
                deletedCount++;
                
                // Remove from cache
                for (const [cacheKey, cached] of guildRoleCache.entries()) {
                    if (cached.role.id === role.id) {
                        guildRoleCache.delete(cacheKey);
                        break;
                    }
                }
            }
        }
        
        return deletedCount;
        
    } catch (error) {
        console.error(`[TITLE ROLES] Error cleaning up roles:`, error);
        return 0;
    }
}

/**
 * Clear role cache for a guild
 */
function clearRoleCache(guildId = null) {
    if (guildId) {
        // Clear cache for specific guild
        for (const [key, value] of guildRoleCache.entries()) {
            if (key.startsWith(guildId)) {
                guildRoleCache.delete(key);
            }
        }
    } else {
        // Clear all cache
        guildRoleCache.clear();
    }
}

module.exports = {
    TITLE_ROLE_CONFIGS,
    getOrCreateTitleRole,
    equipTitleRole,
    removeAllTitleRoles,
    getTitleRoleInfo,
    cleanupUnusedTitleRoles,
    clearRoleCache,
    guildRoleCache
};
