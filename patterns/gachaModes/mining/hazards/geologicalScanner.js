// geologicalScanner.js - Geological Analysis and Hazard Detection System
const { EmbedBuilder } = require('discord.js');
const Cooldown = require('../../../../models/coolDowns');

// Server data mapping for geological properties
const GEOLOGICAL_PROFILES = {
    "coalMines": {
        rockHardness: { min: 15, max: 35, reinforced: 5 },
        oreDensity: { common: 45, uncommon: 25, rare: 5 },
        hazardProfile: "Ancient coal seams, dormant earth spirits detected",
        dangerLevel: 1
    },
    "copperQuarry": {
        rockHardness: { min: 25, max: 45, reinforced: 10 },
        oreDensity: { common: 40, uncommon: 30, rare: 8 },
        hazardProfile: "Verdigris-touched stone, moderate elemental activity",
        dangerLevel: 2
    },
    "topazMine": {
        rockHardness: { min: 35, max: 55, reinforced: 15 },
        oreDensity: { common: 35, uncommon: 35, rare: 12 },
        hazardProfile: "Crystal harmonics detected, arcane energy fluctuations",
        dangerLevel: 2
    },
    "ironStronghold": {
        rockHardness: { min: 45, max: 65, reinforced: 20 },
        oreDensity: { common: 30, uncommon: 40, rare: 15 },
        hazardProfile: "Lodestone veins present, dwarven rune-wards detected",
        dangerLevel: 3
    },
    "fossilExcavation": {
        rockHardness: { min: 30, max: 50, reinforced: 12 },
        oreDensity: { common: 25, uncommon: 35, rare: 20 },
        hazardProfile: "Ancient bone fields, echoes of primordial beasts linger",
        dangerLevel: 3
    },
    "diamondMines": {
        rockHardness: { min: 55, max: 75, reinforced: 25 },
        oreDensity: { common: 20, uncommon: 40, rare: 25 },
        hazardProfile: "Starlight-forged depths, crystallized mana formations",
        dangerLevel: 4
    },
    "emeraldCaverns": {
        rockHardness: { min: 50, max: 70, reinforced: 22 },
        oreDensity: { common: 18, uncommon: 42, rare: 28 },
        hazardProfile: "Fey-touched stone, verdant energies pulse through the walls",
        dangerLevel: 4
    },
    "rubyDepths": {
        rockHardness: { min: 60, max: 80, reinforced: 30 },
        oreDensity: { common: 15, uncommon: 45, rare: 32 },
        hazardProfile: "Dragon-scorched tunnels, lingering heat from ancient flames",
        dangerLevel: 5
    },
    "crystalGrottos": {
        rockHardness: { min: 65, max: 85, reinforced: 35 },
        oreDensity: { common: 12, uncommon: 48, rare: 35 },
        hazardProfile: "Singing crystals resonate, planar boundaries grow thin",
        dangerLevel: 5
    },
    "obsidianForge": {
        rockHardness: { min: 70, max: 90, reinforced: 40 },
        oreDensity: { common: 10, uncommon: 50, rare: 38 },
        hazardProfile: "Volcanic glass from the First Forge, primordial fire awakens",
        dangerLevel: 6
    },
    "mythrilSanctum": {
        rockHardness: { min: 75, max: 95, reinforced: 45 },
        oreDensity: { common: 8, uncommon: 52, rare: 42 },
        hazardProfile: "Moonsilver veins detected, reality bends around ancient metals",
        dangerLevel: 6
    },
    "adamantiteAbyss": {
        rockHardness: { min: 80, max: 100, reinforced: 50 },
        oreDensity: { common: 5, uncommon: 55, rare: 45 },
        hazardProfile: "Void-touched adamant, the Abyss gazes back through the stone",
        dangerLevel: 7
    }
};

// Simplified hazard types that actually exist in the game
const ACTUAL_HAZARDS = {
    1: [
        { type: 'rocks', name: 'Falling Rocks', desc: 'Loose stone that may stun miners' },
        { type: 'gas', name: 'Gas Pocket', desc: 'Toxic fumes that disorient' }
    ],
    2: [
        { type: 'water', name: 'Water Leak', desc: 'Underground flooding hazard' },
        { type: 'collapse', name: 'Cave-in Risk', desc: 'Unstable ceiling zones' }
    ],
    3: [
        { type: 'explosion', name: 'Volatile Gas', desc: 'Explosive pockets in walls' },
        { type: 'portal', name: 'Strange Portal', desc: 'Teleports miners randomly' }
    ],
    4: [
        { type: 'monster', name: 'Cave Creature', desc: 'Hostile entity in the depths' }
    ],
    5: [
        { type: 'curse', name: 'Ancient Curse', desc: 'Weakens mining efficiency' }
    ],
    6: [
        { type: 'lava', name: 'Magma Veins', desc: 'Extreme heat zones' }
    ],
    7: [
        { type: 'void', name: 'Void Zones', desc: 'Areas of extreme danger' }
    ]
};

// Get server key from name
function getServerKey(serverName) {
    const nameToKey = {
        "Coal Mines": "coalMines",
        "Copper Quarry": "copperQuarry",
        "Topaz Mine": "topazMine",
        "Iron Stronghold": "ironStronghold",
        "Fossil Excavation": "fossilExcavation",
        "Diamond Mines": "diamondMines",
        "Emerald Caverns": "emeraldCaverns",
        "Ruby Depths": "rubyDepths",
        "Crystal Grottos": "crystalGrottos",
        "Obsidian Forge": "obsidianForge",
        "Mythril Sanctum": "mythrilSanctum",
        "Adamantite Abyss": "adamantiteAbyss"
    };
    
    const cleanName = serverName.replace(/⛏️|️/g, '').trim();
    return nameToKey[cleanName] || null;
}

// Get hazards for power level
function getHazardsForLevel(powerLevel) {
    const hazards = [];
    for (let level = 1; level <= Math.min(powerLevel, 7); level++) {
        if (ACTUAL_HAZARDS[level]) {
            hazards.push(...ACTUAL_HAZARDS[level]);
        }
    }
    return hazards;
}

// Calculate hazard probability based on power level
function getHazardProbability(powerLevel) {
    const baseProbability = 0.05; // 5% base
    const scaleFactor = Math.pow(1.4, powerLevel - 1); // Exponential scaling
    return Math.min(baseProbability * scaleFactor, 0.65); // Cap at 65%
}

// Check and set geological scan cooldown
async function checkAndSetGeologicalCooldown(channelId) {
    try {
        const COOLDOWN_HOURS = 2;
        const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;
        
        // Use channel ID as the "user" ID for channel-based cooldowns
        const cooldownKey = `geological_scan_${channelId}`;
        
        // Find or create cooldown document for this channel
        let cooldownDoc = await Cooldown.findOne({ userId: `channel_${channelId}` });
        
        if (!cooldownDoc) {
            // Create new cooldown document for this channel
            cooldownDoc = new Cooldown({
                userId: `channel_${channelId}`,
                cooldowns: new Map()
            });
        }
        
        // Check if geological scan is on cooldown
        const lastScanTime = cooldownDoc.cooldowns.get('geological_scan');
        
        if (lastScanTime) {
            const timeSinceLastScan = Date.now() - new Date(lastScanTime).getTime();
            
            if (timeSinceLastScan < COOLDOWN_MS) {
                const remainingTime = COOLDOWN_MS - timeSinceLastScan;
                const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));
                console.log(`[GEOLOGICAL] Scan on cooldown for ${channelId}. ${remainingMinutes} minutes remaining.`);
                return {
                    onCooldown: true,
                    remainingMinutes: remainingMinutes
                };
            }
        }
        
        // Set new cooldown
        cooldownDoc.cooldowns.set('geological_scan', new Date());
        await cooldownDoc.save();
        
        return {
            onCooldown: false,
            remainingMinutes: 0
        };
        
    } catch (error) {
        console.error('[GEOLOGICAL] Error checking cooldown:', error);
        // If error, allow scan to proceed
        return {
            onCooldown: false,
            remainingMinutes: 0
        };
    }
}

// Main geological scan function
async function performGeologicalScan(channel, dbEntry, powerLevel, serverName) {
    try {
        // Check cooldown first (2 hour cooldown per channel)
        const cooldownStatus = await checkAndSetGeologicalCooldown(channel.id);
        
        if (cooldownStatus.onCooldown) {
            console.log(`[GEOLOGICAL] Scan on cooldown for channel ${channel.id}, ${cooldownStatus.remainingMinutes} minutes remaining`);
            return null;
        }
        
        // Check if scan already performed for this mining session (backup check)
        if (dbEntry.gameData?.geologicalScanDone) {
            console.log(`[GEOLOGICAL] Scan already performed for channel ${channel.id} this session, skipping...`);
            return null;
        }
        
        const serverKey = getServerKey(serverName);
        const profile = GEOLOGICAL_PROFILES[serverKey] || GEOLOGICAL_PROFILES.coalMines;
        const hazards = getHazardsForLevel(powerLevel);
        const hazardProbability = getHazardProbability(powerLevel);
        
        // Create the scan embed
        const embed = new EmbedBuilder()
            .setTitle(`📊 GEOLOGICAL SURVEY - ${serverName}`)
            .setColor(getColorByPowerLevel(powerLevel))
            .setDescription(`*Depth Analysis Complete - Power Level ${powerLevel} Detected*`)
            .setTimestamp();
        
        // Add rock composition data
        embed.addFields({
            name: '🪨 ROCK COMPOSITION',
            value: [
                `**Hardness Range:** ${profile.rockHardness.min}-${profile.rockHardness.max}`,
                `**Reinforced Walls:** ${profile.rockHardness.reinforced}% of area`,
                `**Wall Strength:** ${getStructuralRating(profile.rockHardness.reinforced)}`,
                `**Break Difficulty:** ${getBreakDifficulty(profile.rockHardness.max)}`
            ].join('\n'),
            inline: false
        });
        
        // Add ore density data
        embed.addFields({
            name: '⛏️ ORE DISTRIBUTION',
            value: [
                `**Common Ores:** ${profile.oreDensity.common}%`,
                `**Uncommon Ores:** ${profile.oreDensity.uncommon}%`,
                `**Rare Ores:** ${profile.oreDensity.rare}%`,
                `**Empty Stone:** ${100 - profile.oreDensity.common - profile.oreDensity.uncommon - profile.oreDensity.rare}%`
            ].join('\n'),
            inline: true
        });
        
        // Add danger assessment
        embed.addFields({
            name: '⚠️ DANGER ASSESSMENT',
            value: [
                `**Danger Level:** ${profile.dangerLevel}/7`,
                `**Hazard Chance:** ${Math.round(hazardProbability * 100)}%`,
                `**Risk Rating:** ${getDangerClass(powerLevel)}`
            ].join('\n'),
            inline: true
        });
        
        // Add detected hazards (if any)
        if (hazards.length > 0) {
            const hazardList = hazards.map(h => 
                `• **${h.name}** - ${h.desc}`
            );
            
            embed.addFields({
                name: '🚨 POTENTIAL HAZARDS',
                value: hazardList.slice(0, 6).join('\n'),
                inline: false
            });
        }
        
        // Add geological profile
        embed.addFields({
            name: '📜 GEOLOGICAL NOTES',
            value: `*${profile.hazardProfile}*`,
            inline: false
        });
        
        // Add mining recommendation
        const recommendation = getMiningRecommendation(powerLevel);
        embed.setFooter({
            text: recommendation
        });
        
        // Mark scan as done BEFORE sending to prevent duplicates
        dbEntry.gameData.geologicalScanDone = true;
        dbEntry.gameData.lastGeologicalScan = Date.now();
        dbEntry.gameData.hazardProbability = hazardProbability;
        dbEntry.gameData.serverProfile = serverKey;
        dbEntry.markModified('gameData');
        await dbEntry.save();
        
        // Send the scan results
        await channel.send({ embeds: [embed] });
        
        console.log(`[GEOLOGICAL] Scan completed and sent for ${channel.id}: Level ${powerLevel}, ${hazards.length} hazard types`);
        
        return embed;
        
    } catch (error) {
        console.error('[GEOLOGICAL] Error performing scan:', error);
        return null;
    }
}

// Helper functions
function getColorByPowerLevel(level) {
    const colors = [
        0x808080, // 1 - Gray
        0x8B4513, // 2 - Brown
        0xFF8C00, // 3 - Dark Orange
        0xFF4500, // 4 - Orange Red
        0xDC143C, // 5 - Crimson
        0x8B0000, // 6 - Dark Red
        0x4B0082  // 7 - Indigo
    ];
    return colors[Math.min(level - 1, 6)];
}

function getStructuralRating(reinforcedPercent) {
    if (reinforcedPercent < 10) return 'Minimal reinforcement';
    if (reinforcedPercent < 20) return 'Light reinforcement';
    if (reinforcedPercent < 30) return 'Moderate reinforcement';
    if (reinforcedPercent < 40) return 'Heavy reinforcement';
    return 'Maximum reinforcement';
}

function getBreakDifficulty(hardness) {
    if (hardness < 40) return 'Easy to break';
    if (hardness < 60) return 'Moderate difficulty';
    if (hardness < 80) return 'Hard to break';
    return 'Extremely difficult';
}

function getDangerClass(level) {
    const classes = [
        'SAFE',
        'CAUTION',
        'WARNING', 
        'DANGER',
        'EXTREME',
        'CRITICAL',
        'MAXIMUM'
    ];
    return classes[Math.min(level - 1, 6)];
}

function getMiningRecommendation(level) {
    const recommendations = [
        'Safe for novice miners',
        'Experience recommended',
        'Caution advised - bring backup',
        'Dangerous - veteran miners only',
        'Extreme risk - elite team required',
        'Critical danger - legendary gear needed',
        'Maximum peril - enter at your own risk'
    ];
    return recommendations[Math.min(level - 1, 6)];
}

// Reset geological scan flag (call this when mining session ends or server changes)
async function resetGeologicalScan(channelId) {
    try {
        const gachaVC = require('../../../../models/activevcs');
        await gachaVC.updateOne(
            { channelId },
            { 
                $unset: { 
                    'gameData.geologicalScanDone': 1
                }
            }
        );
        console.log(`[GEOLOGICAL] Reset scan flag for channel ${channelId}`);
        
        // Note: We don't reset the cooldown here - it remains for 2 hours regardless
        // This prevents spam even if mining sessions restart frequently
        
        return true;
    } catch (error) {
        console.error('[GEOLOGICAL] Error resetting scan flag:', error);
        return false;
    }
}

// Force reset cooldown (admin use or special cases)
async function forceResetGeologicalCooldown(channelId) {
    try {
        const cooldownDoc = await Cooldown.findOne({ userId: `channel_${channelId}` });
        
        if (cooldownDoc) {
            cooldownDoc.cooldowns.delete('geological_scan');
            await cooldownDoc.save();
            console.log(`[GEOLOGICAL] Force reset cooldown for channel ${channelId}`);
        }
        
        return true;
    } catch (error) {
        console.error('[GEOLOGICAL] Error force resetting cooldown:', error);
        return false;
    }
}

// Check if we should reset scan flag (e.g., if server/mine type changed)
// Note: This only resets the session flag, not the 2-hour cooldown
function shouldResetScan(dbEntry, currentServerName) {
    const lastServerProfile = dbEntry.gameData?.serverProfile;
    const currentServerKey = getServerKey(currentServerName);
    
    // Reset flag if server changed (but cooldown remains)
    if (lastServerProfile && lastServerProfile !== currentServerKey) {
        console.log(`[GEOLOGICAL] Server changed from ${lastServerProfile} to ${currentServerKey}, will reset scan flag`);
        return true;
    }
    
    // No longer checking for 24 hours - using 2-hour cooldown system instead
    
    return false;
}

// Export the main function and helpers
module.exports = {
    performGeologicalScan,
    resetGeologicalScan,
    forceResetGeologicalCooldown,
    shouldResetScan,
    checkAndSetGeologicalCooldown,
    getHazardsForLevel,
    getHazardProbability,
    GEOLOGICAL_PROFILES,
    HAZARD_CATALOG: ACTUAL_HAZARDS
};
