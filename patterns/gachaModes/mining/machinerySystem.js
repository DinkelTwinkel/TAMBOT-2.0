// machinerySystem.js - Machinery and Rail Interaction System
// Handles interactions between unique items and mining machinery/rails

const MACHINERY_TYPES = {
    RAIL: 'rail',
    MINECART: 'minecart',
    PUMP: 'pump',
    GENERATOR: 'generator',
    CONVEYOR: 'conveyor'
};

const MACHINERY_CONFIGS = {
    [MACHINERY_TYPES.RAIL]: {
        name: 'Mining Rail',
        description: 'Transports minecarts and conducts electricity',
        interactions: {
            overcharge: 'Increases rail speed and capacity',
            conduct: 'Conducts electricity to power other machinery',
            magnetize: 'Attracts ore automatically to rails'
        }
    },
    [MACHINERY_TYPES.MINECART]: {
        name: 'Minecart',
        description: 'Stores and transports mined materials',
        interactions: {
            overcharge: 'Increases storage capacity',
            magnetize: 'Automatically collects nearby ore',
            conduct: 'Powers electric sorting systems'
        }
    },
    [MACHINERY_TYPES.PUMP]: {
        name: 'Water Pump',
        description: 'Removes water hazards and cools machinery',
        interactions: {
            overcharge: 'Increases pumping speed and range',
            conduct: 'Powers pump with electricity'
        }
    },
    [MACHINERY_TYPES.GENERATOR]: {
        name: 'Power Generator',
        description: 'Generates electricity for mining operations',
        interactions: {
            overcharge: 'Increases power output',
            conduct: 'Distributes power through rails'
        }
    },
    [MACHINERY_TYPES.CONVEYOR]: {
        name: 'Ore Conveyor',
        description: 'Automatically moves ore to processing areas',
        interactions: {
            magnetize: 'Attracts ore to conveyor belt',
            overcharge: 'Increases conveyor speed'
        }
    }
};

// Track machinery state per channel
const machineryState = new Map();

/**
 * Initialize machinery system for a channel
 */
function initializeMachinery(channelId, mapData) {
    if (!machineryState.has(channelId)) {
        machineryState.set(channelId, {
            rails: new Map(),
            machines: new Map(),
            powerGrid: {
                generators: [],
                conductors: [],
                totalPower: 0
            },
            magneticFields: new Map(),
            overchargedSystems: new Map()
        });
    }
    
    // Scan map for existing rails and machinery
    scanForMachinery(channelId, mapData);
}

/**
 * Scan map for rails and machinery
 */
function scanForMachinery(channelId, mapData) {
    const machinery = machineryState.get(channelId);
    if (!machinery) return;
    
    // Clear existing data
    machinery.rails.clear();
    machinery.machines.clear();
    
    // Scan the map for rails (assuming rails are stored in mapData.rails)
    if (mapData.rails) {
        for (const [position, railData] of Object.entries(mapData.rails)) {
            const [x, y] = position.split(',').map(Number);
            machinery.rails.set(position, {
                x, y,
                type: railData.type || 'standard',
                powered: false,
                overcharged: false,
                magnetized: false
            });
        }
    }
}

/**
 * Apply machinery interactions from unique items
 */
async function processMachineryInteractions(playerId, playerPosition, uniqueBonuses, channelId, mapData, eventLogs) {
    if (!uniqueBonuses.machinerySystem) return { mapChanged: false, bonuses: {} };
    
    const machinery = machineryState.get(channelId);
    if (!machinery) {
        initializeMachinery(channelId, mapData);
        return { mapChanged: false, bonuses: {} };
    }
    
    const bonuses = {};
    let mapChanged = false;
    
    // Iron Lord's Gauntlets - Magnetization
    if (uniqueBonuses.machinerySystem.canMagnetize) {
        const magneticResult = await applyMagnetization(playerId, playerPosition, machinery, mapData, eventLogs);
        if (magneticResult.oreAttracted > 0) {
            bonuses.magneticOreBonus = magneticResult.oreAttracted;
            eventLogs.push(`🧲 Your gauntlets attracted ${magneticResult.oreAttracted} ore to nearby rails!`);
        }
    }
    
    // Copper Conductor - Electricity Conduction
    if (uniqueBonuses.machinerySystem.canConductElectricity) {
        const conductionResult = await applyConductivity(playerId, playerPosition, machinery, mapData, eventLogs);
        if (conductionResult.systemsPowered > 0) {
            bonuses.electricEfficiency = 0.1; // 10% efficiency bonus
            eventLogs.push(`⚡ You conducted electricity through ${conductionResult.systemsPowered} systems!`);
        }
    }
    
    // Stormcaller's Gauntlets - Overcharging
    if (uniqueBonuses.machinerySystem.canOvercharge) {
        const overchargeResult = await applyOvercharge(playerId, playerPosition, machinery, mapData, eventLogs);
        if (overchargeResult.systemsOvercharged > 0) {
            bonuses.overchargeBonus = 0.15; // 15% bonus to all actions
            eventLogs.push(`⚡ You overcharged ${overchargeResult.systemsOvercharged} systems!`);
        }
    }
    
    return { mapChanged, bonuses };
}

/**
 * Apply magnetization effects
 */
async function applyMagnetization(playerId, playerPosition, machinery, mapData, eventLogs) {
    let oreAttracted = 0;
    
    // Find nearby rails within range
    const magnetRange = 3;
    
    for (const [position, rail] of machinery.rails.entries()) {
        const distance = Math.abs(rail.x - playerPosition.x) + Math.abs(rail.y - playerPosition.y);
        
        if (distance <= magnetRange) {
            // Magnetize the rail
            rail.magnetized = true;
            
            // Chance to attract ore to this rail
            if (Math.random() < 0.1) { // 10% chance per rail per cycle
                oreAttracted++;
                
                // Create magnetic ore attraction effect
                machinery.magneticFields.set(position, {
                    strength: 1.0,
                    duration: 30000, // 30 seconds
                    createdAt: Date.now()
                });
            }
        }
    }
    
    return { oreAttracted };
}

/**
 * Apply electrical conduction
 */
async function applyConductivity(playerId, playerPosition, machinery, mapData, eventLogs) {
    let systemsPowered = 0;
    
    // Find connected rail network
    const conductionRange = 5;
    const connectedRails = findConnectedRails(playerPosition, machinery.rails, conductionRange);
    
    for (const rail of connectedRails) {
        if (!rail.powered) {
            rail.powered = true;
            systemsPowered++;
            
            // Add to power grid
            machinery.powerGrid.conductors.push({
                position: `${rail.x},${rail.y}`,
                playerId,
                timestamp: Date.now()
            });
        }
    }
    
    return { systemsPowered };
}

/**
 * Apply overcharge effects
 */
async function applyOvercharge(playerId, playerPosition, machinery, mapData, eventLogs) {
    let systemsOvercharged = 0;
    
    // Find nearby machinery to overcharge
    const overchargeRange = 2;
    
    for (const [position, rail] of machinery.rails.entries()) {
        const distance = Math.abs(rail.x - playerPosition.x) + Math.abs(rail.y - playerPosition.y);
        
        if (distance <= overchargeRange && rail.powered && !rail.overcharged) {
            rail.overcharged = true;
            systemsOvercharged++;
            
            // Set overcharge timer
            machinery.overchargedSystems.set(position, {
                playerId,
                expiresAt: Date.now() + 60000, // 1 minute
                bonusMultiplier: 1.5
            });
        }
    }
    
    return { systemsOvercharged };
}

/**
 * Find connected rails within range
 */
function findConnectedRails(startPosition, railsMap, maxRange) {
    const connectedRails = [];
    const visited = new Set();
    const queue = [{ x: startPosition.x, y: startPosition.y, distance: 0 }];
    
    while (queue.length > 0) {
        const current = queue.shift();
        const posKey = `${current.x},${current.y}`;
        
        if (visited.has(posKey) || current.distance > maxRange) continue;
        visited.add(posKey);
        
        const rail = railsMap.get(posKey);
        if (rail) {
            connectedRails.push(rail);
            
            // Add adjacent positions to queue
            const adjacent = [
                { x: current.x + 1, y: current.y, distance: current.distance + 1 },
                { x: current.x - 1, y: current.y, distance: current.distance + 1 },
                { x: current.x, y: current.y + 1, distance: current.distance + 1 },
                { x: current.x, y: current.y - 1, distance: current.distance + 1 }
            ];
            
            queue.push(...adjacent);
        }
    }
    
    return connectedRails;
}

/**
 * Clean up expired overcharges and effects
 */
function cleanupMachineryEffects(channelId) {
    const machinery = machineryState.get(channelId);
    if (!machinery) return;
    
    const now = Date.now();
    
    // Clean up overcharged systems
    for (const [position, overcharge] of machinery.overchargedSystems.entries()) {
        if (now > overcharge.expiresAt) {
            machinery.overchargedSystems.delete(position);
            
            // Remove overcharge from rail
            const rail = machinery.rails.get(position);
            if (rail) {
                rail.overcharged = false;
            }
        }
    }
    
    // Clean up magnetic fields
    for (const [position, field] of machinery.magneticFields.entries()) {
        if (now > field.createdAt + field.duration) {
            machinery.magneticFields.delete(position);
            
            // Remove magnetization from rail
            const rail = machinery.rails.get(position);
            if (rail) {
                rail.magnetized = false;
            }
        }
    }
}

/**
 * Get machinery status for a channel
 */
function getMachineryStatus(channelId) {
    const machinery = machineryState.get(channelId);
    if (!machinery) return null;
    
    return {
        railCount: machinery.rails.size,
        poweredRails: Array.from(machinery.rails.values()).filter(rail => rail.powered).length,
        overchargedSystems: machinery.overchargedSystems.size,
        magneticFields: machinery.magneticFields.size,
        totalPower: machinery.powerGrid.totalPower
    };
}

module.exports = {
    MACHINERY_TYPES,
    MACHINERY_CONFIGS,
    initializeMachinery,
    processMachineryInteractions,
    cleanupMachineryEffects,
    getMachineryStatus,
    machineryState
};
