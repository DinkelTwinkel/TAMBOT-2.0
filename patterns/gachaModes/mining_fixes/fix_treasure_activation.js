// fix_treasure_activation.js - Fix for treasure chest hazards not activating

/**
 * PROBLEM DIAGNOSIS:
 * 1. Treasure hazards are created with type: "treasure" 
 * 2. ENCOUNTER_TYPES.TREASURE = "treasure" (they match!)
 * 3. BUT processEncounterTrigger() is never being called when players move
 */

// Add this debug wrapper to hazardEffects.js temporarily to verify the issue:
const DEBUG_WRAPPER = `
// Add at the top of processEncounterTrigger function:
console.log('[HAZARD DEBUG] processEncounterTrigger called for position:', position.x, position.y);
console.log('[HAZARD DEBUG] Hazard type:', triggeredEncounter?.type);
console.log('[HAZARD DEBUG] ENCOUNTER_TYPES.TREASURE value:', ENCOUNTER_TYPES.TREASURE);
console.log('[HAZARD DEBUG] Type match check:', triggeredEncounter?.type === ENCOUNTER_TYPES.TREASURE);
`;

/**
 * THE REAL FIX:
 * Add hazard checking in the player movement code.
 * This needs to be added wherever player positions are updated.
 */
async function addHazardCheckingToPlayerMovement(
    member,
    position,
    mapData,
    hazardsData,
    dbEntry,
    transaction,
    eventLogs,
    serverPowerLevel,
    mineTypeId
) {
    // Import required modules
    const hazardStorage = require('./mining/hazardStorage');
    const hazardEffects = require('./mining/hazardEffects');
    
    // Check if there's a hazard at the player's new position
    const hazard = hazardStorage.getHazard(hazardsData, position.x, position.y);
    
    if (hazard && !hazard.triggered) {
        console.log(`[HAZARD TRIGGER] ${member.displayName} stepped on ${hazard.type} at (${position.x}, ${position.y})`);
        
        // Process the encounter (this handles both hazards and treasures)
        const result = await hazardEffects.processEncounterTrigger(
            member,
            position,
            mapData,
            hazardsData,
            dbEntry,
            transaction,
            eventLogs,
            serverPowerLevel || 1,
            mineTypeId || null
        );
        
        if (result) {
            console.log(`[HAZARD RESULT] ${hazard.type} triggered:`, {
                treasureFound: result.treasureFound,
                itemsFound: result.itemsFound?.length || 0,
                message: result.message
            });
            
            return result;
        }
    }
    
    return null;
}

/**
 * INTEGRATION INSTRUCTIONS:
 * 
 * In mining_optimized_v5_performance.js, find the processPlayerActionsEnhanced function
 * or wherever player movement is handled. Look for code patterns like:
 * 
 * 1. position.x = newX;
 * 2. position.y = newY;
 * 3. mapData.playerPositions[member.id] = {...}
 * 
 * After EACH position update, add:
 */
const INTEGRATION_CODE = `
    // Check for hazards at new position
    if (hazardsData) {
        const hazard = hazardStorage.getHazard(hazardsData, position.x, position.y);
        
        if (hazard && !hazard.triggered) {
            console.log(\`[HAZARD] \${member.displayName} triggered \${hazard.type} at (\${position.x}, \${position.y})\`);
            
            const hazardResult = await hazardEffects.processEncounterTrigger(
                member,
                position,
                mapData,
                hazardsData,
                dbEntry,
                transaction,
                eventLogs,
                serverPowerLevel,
                mineTypeId
            );
            
            if (hazardResult) {
                // Update game state based on result
                if (hazardResult.mapChanged) {
                    mapChanged = true;
                }
                if (hazardResult.playerMoved) {
                    // Position already updated by hazard
                }
                if (hazardResult.playerDisabled) {
                    // Player knocked out, skip rest of turn
                    break; // or continue depending on loop structure
                }
                if (hazardResult.treasureFound) {
                    treasuresFound++;
                    console.log(\`[TREASURE] \${member.displayName} found treasure with \${hazardResult.itemsFound.length} items!\`);
                }
            }
        }
    }
`;

/**
 * VERIFICATION TEST:
 * Add this temporary logging to verify hazards are being generated correctly
 */
function verifyHazardGeneration(hazardsData) {
    if (!hazardsData || !hazardsData.hazards) {
        console.log('[HAZARD VERIFY] No hazards data!');
        return;
    }
    
    let treasureCount = 0;
    let otherCount = 0;
    
    for (const [key, hazard] of hazardsData.hazards) {
        if (hazard.type === 'treasure' || hazard.type === 'rare_treasure') {
            treasureCount++;
            console.log(`[HAZARD VERIFY] Treasure at ${key}: type="${hazard.type}"`);
        } else {
            otherCount++;
        }
    }
    
    console.log(`[HAZARD VERIFY] Total hazards: ${hazardsData.hazards.size} (${treasureCount} treasures, ${otherCount} other)`);
}

/**
 * QUICK FIX TEST:
 * Run this to manually test treasure chest handling
 */
async function testTreasureChestHandling() {
    const { ENCOUNTER_TYPES } = require('../mining/miningConstants_unified');
    const hazardEffects = require('../mining/hazardEffects');
    
    // Create mock objects for testing
    const mockMember = {
        id: 'test123',
        displayName: 'TestPlayer'
    };
    
    const mockPosition = { x: 5, y: 5 };
    
    const mockDbEntry = {
        gameData: {
            minecart: {
                items: {},
                contributors: {}
            }
        },
        markModified: () => {},
        save: async () => {}
    };
    
    const mockEventLogs = [];
    
    console.log('[TEST] Testing treasure chest handling...');
    console.log('[TEST] ENCOUNTER_TYPES.TREASURE =', ENCOUNTER_TYPES.TREASURE);
    
    // Test the handleTreasureChest function directly
    const result = await hazardEffects.handleTreasureChest(
        mockMember,
        mockPosition,
        mockDbEntry,
        mockEventLogs,
        ENCOUNTER_TYPES.TREASURE, // This should be "treasure"
        7, // powerLevel
        null // mineTypeId
    );
    
    console.log('[TEST] Result:', result);
    console.log('[TEST] Items found:', result.itemsFound);
    
    return result;
}

module.exports = {
    addHazardCheckingToPlayerMovement,
    verifyHazardGeneration,
    testTreasureChestHandling,
    INTEGRATION_CODE,
    DEBUG_WRAPPER
};
