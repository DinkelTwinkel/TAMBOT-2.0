// patterns/uniqueItems/solarForgeHammer.js
// Solar Forge Hammer team healing system

const PlayerHealth = require('../../models/PlayerHealth');
const UniqueItem = require('../../models/uniqueItems');
const PlayerBuffs = require('../../models/PlayerBuff');

/**
 * Process Solar Forge Hammer team healing for all voice channels in a guild
 * Restores +1 health per minute and gives 5-minute +100 sanity buff to all members
 * in voice channels where a Solar Forge Hammer owner is present
 */
async function processSolarForgeHealing(guild) {
    try {
        // Find all players with Solar Forge Hammer (item ID 13)
        const solarForgeOwners = await UniqueItem.find({ 
            itemId: 13, 
            ownerId: { $exists: true, $ne: null } 
        });
        
        if (solarForgeOwners.length === 0) return;
        
        console.log(`[SOLAR FORGE] Found ${solarForgeOwners.length} Solar Forge Hammer owner(s), checking voice chats...`);
        
        // Get all active voice channels in the guild
        const voiceChannels = guild.channels.cache.filter(channel => 
            channel.isVoiceBased() && channel.members.size > 0
        );
        
        for (const [channelId, voiceChannel] of voiceChannels) {
            // Check if any Solar Forge Hammer owner is in this voice channel
            const solarForgeInChannel = solarForgeOwners.find(owner => 
                voiceChannel.members.has(owner.ownerId)
            );
            
            if (solarForgeInChannel) {
                const ownerMember = voiceChannel.members.get(solarForgeInChannel.ownerId);
                console.log(`[SOLAR FORGE] ${ownerMember?.displayName || 'Unknown'} with Solar Forge Hammer is in voice channel ${voiceChannel.name} - healing ${voiceChannel.members.size} members`);
                
                // Heal all members in the voice channel
                const healingPromises = [];
                for (const [memberId, member] of voiceChannel.members) {
                    healingPromises.push(healAndBuffMember(memberId, member.displayName));
                }
                
                await Promise.allSettled(healingPromises);
                console.log(`[SOLAR FORGE] Healed and buffed ${voiceChannel.members.size} members in ${voiceChannel.name} thanks to ${ownerMember?.displayName}'s Solar Forge Hammer`);
            }
        }
        
    } catch (error) {
        console.error('[SOLAR FORGE] Error in health regeneration system:', error);
    }
}

/**
 * Heal a single member (health restoration + sanity buff)
 * @param {string} playerId - Discord user ID
 * @param {string} playerName - Display name for logging
 */
async function healAndBuffMember(playerId, playerName) {
    try {
        let healingMessage = `[SOLAR FORGE] ${playerName}:`;
        let hasChanges = false;
        
        // === HEALTH RESTORATION ===
        let playerHealth = await PlayerHealth.findOne({ playerId });
        
        if (!playerHealth) {
            // Create health record if it doesn't exist (default 100 health)
            playerHealth = await PlayerHealth.create({
                playerId,
                playerName,
                health: 100,
                maxHealth: 100
            });
        }
        
        // Heal health if not at max
        if (playerHealth.health < playerHealth.maxHealth) {
            const oldHealth = playerHealth.health;
            playerHealth.health = Math.min(playerHealth.maxHealth, playerHealth.health + 1);
            healingMessage += ` HP ${oldHealth} → ${playerHealth.health}`;
            hasChanges = true;
            await playerHealth.save();
        }
        
        // === SANITY BUFF ===
        // Use the same buff system as consumables
        try {
            let buffDoc = await PlayerBuffs.findOne({ playerId });
            
            const now = new Date();
            const buffExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
            const buffName = '🌞 Solar Warmth';
            
            if (!buffDoc) {
                buffDoc = new PlayerBuffs({
                    playerId,
                    buffs: []
                });
            }
            
            // Remove expired buffs
            buffDoc.buffs = buffDoc.buffs.filter(b => b.expiresAt > now);
            
            // Look for existing Solar Warmth buff
            const existingBuff = buffDoc.buffs.find(b => b.name === buffName);
            
            if (existingBuff) {
                // Refresh expiry time
                existingBuff.expiresAt = buffExpiry;
                healingMessage += ` | Refreshed Solar Warmth buff (+100 sanity for 5 min)`;
            } else {
                // Add new buff
                const newBuff = {
                    name: buffName,
                    effects: new Map([['sanity', 100]]),
                    expiresAt: buffExpiry
                };
                buffDoc.buffs.push(newBuff);
                healingMessage += ` | Applied Solar Warmth buff (+100 sanity for 5 min)`;
            }
            
            await buffDoc.save();
            hasChanges = true;
            
        } catch (buffError) {
            console.error(`[SOLAR FORGE] Error applying buff to ${playerName}:`, buffError);
            healingMessage += ` | Buff failed`;
        }
        
        if (hasChanges) {
            console.log(healingMessage);
        }
        
    } catch (error) {
        console.error(`[SOLAR FORGE] Error healing/buffing ${playerName}:`, error);
    }
}

/**
 * Initialize Solar Forge Hammer healing system for a guild
 * Sets up the 1-minute interval for team healing
 * @param {Guild} guild - Discord guild object
 * @returns {NodeJS.Timeout} - Interval ID for cleanup if needed
 */
function initializeSolarForgeHealing(guild) {
    console.log(`[SOLAR FORGE] Initializing team healing system for guild ${guild.name}`);
    
    return setInterval(async () => {
        try {
            await processSolarForgeHealing(guild);
        } catch (error) {
            console.error('[SOLAR FORGE] Error in healing interval:', error);
        }
    }, 60 * 1000); // Run every minute
}

module.exports = {
    processSolarForgeHealing,
    healAndBuffMember,
    initializeSolarForgeHealing
};
