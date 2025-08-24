/**
 * Example integration for using hazard data in mining map generation
 * This shows how to integrate the hazard system with your existing mining scripts
 */

const { getHazardDataForChannel, shouldSpawnHazard } = require('./hazardDataHelper');
const { ENCOUNTER_CONFIG, ENCOUNTER_TYPES } = require('./miningConstants');

/**
 * Example function to place hazards on a mining map based on rolled hazard data
 * @param {Array} map - The 2D array representing the mining map
 * @param {string} channelId - The voice channel ID
 * @returns {Array} - The map with hazards placed
 */
async function placeHazardsOnMap(map, channelId) {
    // Get the hazard data for this channel
    const hazardData = await getHazardDataForChannel(channelId);
    
    if (!hazardData || !hazardData.hazards || hazardData.hazards.length === 0) {
        console.log('No hazards to place for this map');
        return map;
    }
    
    console.log(`Placing hazards for level ${hazardData.hazardLevel} map`);
    console.log(`Hazards present: ${hazardData.hazards.map(h => h.name).join(', ')}`);
    
    // Track placed hazards
    const placedHazards = [];
    
    // Iterate through the map to potentially place hazards
    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            // Only place hazards on floor tiles
            if (map[y][x].type !== 'floor') continue;
            
            // Don't place hazards at the entrance
            if (map[y][x].type === 'entrance') continue;
            
            // Check each hazard type present in the rolled data
            for (const hazard of hazardData.hazards) {
                // Check if we've already placed enough of this hazard
                const placedCount = placedHazards.filter(h => h.type === hazard.type).length;
                if (placedCount >= hazard.count) continue;
                
                // Roll to see if we should place this hazard here
                if (shouldSpawnHazard(hazardData, hazard.type)) {
                    // Place the hazard
                    map[y][x] = {
                        ...map[y][x],
                        hazard: {
                            type: hazard.type,
                            name: hazard.name,
                            symbol: hazard.symbol,
                            color: hazard.color,
                            intensity: hazard.intensity
                        }
                    };
                    
                    placedHazards.push({
                        type: hazard.type,
                        x: x,
                        y: y
                    });
                    
                    console.log(`Placed ${hazard.name} at (${x}, ${y})`);
                    break; // Only one hazard per tile
                }
            }
        }
    }
    
    // Ensure minimum hazard placement (at least 1 of each rolled hazard type)
    for (const hazard of hazardData.hazards) {
        const placedCount = placedHazards.filter(h => h.type === hazard.type).length;
        if (placedCount === 0) {
            // Force place at least one of this hazard
            const floorTiles = [];
            for (let y = 0; y < map.length; y++) {
                for (let x = 0; x < map[y].length; x++) {
                    if (map[y][x].type === 'floor' && !map[y][x].hazard && map[y][x].type !== 'entrance') {
                        floorTiles.push({ x, y });
                    }
                }
            }
            
            if (floorTiles.length > 0) {
                const randomTile = floorTiles[Math.floor(Math.random() * floorTiles.length)];
                map[randomTile.y][randomTile.x] = {
                    ...map[randomTile.y][randomTile.x],
                    hazard: {
                        type: hazard.type,
                        name: hazard.name,
                        symbol: hazard.symbol,
                        color: hazard.color,
                        intensity: hazard.intensity
                    }
                };
                console.log(`Force placed ${hazard.name} at (${randomTile.x}, ${randomTile.y})`);
            }
        }
    }
    
    return map;
}

/**
 * Example function to handle hazard triggers when a player steps on them
 * @param {Object} player - The player object
 * @param {Object} hazard - The hazard that was triggered
 * @param {Object} gameState - The current game state
 * @returns {Object} - Updated game state after hazard effect
 */
async function triggerHazard(player, hazard, gameState) {
    const hazardConfig = ENCOUNTER_CONFIG[hazard.type];
    
    if (!hazardConfig) {
        console.error(`Unknown hazard type: ${hazard.type}`);
        return gameState;
    }
    
    console.log(`${player.name} triggered ${hazard.name}!`);
    
    // Apply hazard effects based on type
    switch (hazard.type) {
        case ENCOUNTER_TYPES.PORTAL_TRAP:
            // Teleport player to random location
            const randomX = Math.floor(Math.random() * gameState.mapWidth);
            const randomY = Math.floor(Math.random() * gameState.mapHeight);
            player.x = randomX;
            player.y = randomY;
            gameState.message = `💫 ${player.name} was teleported by a portal trap!`;
            break;
            
        case ENCOUNTER_TYPES.BOMB_TRAP:
            // Explode surrounding walls and knock out player
            const blastRadius = Math.floor(hazardConfig.blastRadius * (hazard.intensity || 1));
            for (let dy = -blastRadius; dy <= blastRadius; dy++) {
                for (let dx = -blastRadius; dx <= blastRadius; dx++) {
                    const targetX = player.x + dx;
                    const targetY = player.y + dy;
                    if (targetX >= 0 && targetX < gameState.mapWidth && 
                        targetY >= 0 && targetY < gameState.mapHeight) {
                        // Convert walls to floors in blast radius
                        if (gameState.map[targetY][targetX].type === 'wall' || 
                            gameState.map[targetY][targetX].type === 'wall_ore') {
                            gameState.map[targetY][targetX].type = 'floor';
                        }
                    }
                }
            }
            // Apply knockout
            player.knockedOut = true;
            player.knockoutExpiry = Date.now() + hazardConfig.knockoutDuration;
            gameState.message = `💣 ${player.name} triggered a bomb trap! They're knocked out for 5 minutes!`;
            break;
            
        case ENCOUNTER_TYPES.GREEN_FOG:
            // Damage equipment durability
            const durabilityDamage = Math.floor(hazardConfig.durabilityDamage * (hazard.intensity || 1));
            if (player.equipment && player.equipment.pickaxe) {
                player.equipment.pickaxe.durability = Math.max(0, 
                    (player.equipment.pickaxe.durability || 100) - durabilityDamage * 10);
                gameState.message = `☁️ ${player.name} walked through toxic fog! Equipment damaged!`;
            }
            break;
            
        case ENCOUNTER_TYPES.WALL_TRAP:
            // Convert nearby floors to walls
            const wallRadius = 2;
            for (let dy = -wallRadius; dy <= wallRadius; dy++) {
                for (let dx = -wallRadius; dx <= wallRadius; dx++) {
                    if (dx === 0 && dy === 0) continue; // Don't trap the player
                    const targetX = player.x + dx;
                    const targetY = player.y + dy;
                    if (targetX >= 0 && targetX < gameState.mapWidth && 
                        targetY >= 0 && targetY < gameState.mapHeight) {
                        if (gameState.map[targetY][targetX].type === 'floor') {
                            gameState.map[targetY][targetX].type = 'wall';
                        }
                    }
                }
            }
            gameState.message = `🧱 ${player.name} triggered a wall trap! Paths are closing!`;
            break;
            
        case ENCOUNTER_TYPES.FIRE_BLAST:
        case 'fire_blast':
            // Fire trap - deals damage and spreads fire to adjacent tiles
            const fireConfig = hazardConfig || {
                damage: 20,
                spreadChance: 0.3,
                burnDuration: 10000,
                knockbackDistance: 2
            };
            
            // Apply damage to player
            const fireDamage = Math.floor(fireConfig.damage * (hazard.intensity || 1));
            player.health = Math.max(0, (player.health || 100) - fireDamage);
            
            // Apply knockback effect
            const knockbackDir = {
                x: Math.random() > 0.5 ? 1 : -1,
                y: Math.random() > 0.5 ? 1 : -1
            };
            const newX = Math.max(0, Math.min(gameState.mapWidth - 1, 
                player.x + knockbackDir.x * fireConfig.knockbackDistance));
            const newY = Math.max(0, Math.min(gameState.mapHeight - 1,
                player.y + knockbackDir.y * fireConfig.knockbackDistance));
            
            // Only move if target is a floor tile
            if (gameState.map[newY][newX].type === 'floor') {
                player.x = newX;
                player.y = newY;
            }
            
            // Apply burn status effect
            player.statusEffects = player.statusEffects || [];
            player.statusEffects.push({
                type: 'burn',
                damage: 5,
                duration: fireConfig.burnDuration,
                appliedAt: Date.now()
            });
            
            // Spread fire to adjacent tiles
            const fireSpreadRadius = 1;
            for (let dy = -fireSpreadRadius; dy <= fireSpreadRadius; dy++) {
                for (let dx = -fireSpreadRadius; dx <= fireSpreadRadius; dx++) {
                    if (dx === 0 && dy === 0) continue; // Skip center
                    
                    const spreadX = player.x + dx;
                    const spreadY = player.y + dy;
                    
                    if (spreadX >= 0 && spreadX < gameState.mapWidth && 
                        spreadY >= 0 && spreadY < gameState.mapHeight) {
                        
                        // Chance to spread fire
                        if (Math.random() < fireConfig.spreadChance) {
                            // Mark tile as temporarily on fire
                            if (!gameState.map[spreadY][spreadX].hazard && 
                                gameState.map[spreadY][spreadX].type === 'floor') {
                                
                                gameState.map[spreadY][spreadX].temporaryHazard = {
                                    type: 'fire_spread',
                                    duration: 5000,
                                    createdAt: Date.now(),
                                    damage: fireDamage * 0.5
                                };
                            }
                        }
                    }
                }
            }
            
            // Clear out walls in immediate vicinity (fire melts through)
            const meltRadius = 1;
            for (let dy = -meltRadius; dy <= meltRadius; dy++) {
                for (let dx = -meltRadius; dx <= meltRadius; dx++) {
                    const meltX = player.x + dx;
                    const meltY = player.y + dy;
                    
                    if (meltX >= 0 && meltX < gameState.mapWidth && 
                        meltY >= 0 && meltY < gameState.mapHeight) {
                        
                        // Fire can melt through regular walls (not reinforced)
                        if (gameState.map[meltY][meltX].type === 'wall' || 
                            gameState.map[meltY][meltX].type === 'wall_ore') {
                            
                            // 50% chance to melt wall
                            if (Math.random() < 0.5) {
                                gameState.map[meltY][meltX].type = 'floor';
                                gameState.map[meltY][meltX].scorched = true;
                            }
                        }
                    }
                }
            }
            
            gameState.message = `🔥 ${player.name} triggered a FIRE TRAP! They took ${fireDamage} damage and are burning!`;
            break;
    }
    
    return gameState;
}

/**
 * Example function to get hazard warnings for display
 * @param {string} channelId - The voice channel ID
 * @returns {string} - Formatted warning message
 */
async function getHazardWarnings(channelId) {
    const hazardData = await getHazardDataForChannel(channelId);
    
    if (!hazardData || !hazardData.hazards || hazardData.hazards.length === 0) {
        return '✅ No hazards detected in this area.';
    }
    
    const warnings = [];
    
    for (const hazard of hazardData.hazards) {
        let warning = `${hazard.symbol} **${hazard.name}**`;
        if (hazard.intensity > 1.5) {
            warning += ' ⚠️ *HIGH INTENSITY*';
        }
        warnings.push(warning);
    }
    
    return `⚠️ **Active Hazards:** ${warnings.join(', ')}`;
}

module.exports = {
    placeHazardsOnMap,
    triggerHazard,
    getHazardWarnings
};
