// hazardIntegration.js - Quick reference for integrating hazard scanner

/**
 * INTEGRATION GUIDE FOR HAZARD SCANNER
 * =====================================
 * 
 * This file shows how to integrate the new hazard scanner
 * with your existing mining system.
 */

// 1. IMPORT THE SCANNER
// Replace old hazard imports with:
const { performGeologicalScan } = require('./mining/hazards/hazardScanner');

// 2. REPLACE OLD FUNCTION CALLS
// Old way (deprecated):
// await performInitialHazardRoll(channel, dbEntry, serverPowerLevel);

// New way:
// await performGeologicalScan(channel, dbEntry, serverPowerLevel, serverName);

// 3. EXAMPLE INTEGRATION
async function miningEventWithHazardScan(channel, dbEntry, json, client) {
    // Get server information
    const serverPowerLevel = json?.power || 1;
    const serverName = json?.name || 'Unknown Mine';
    
    // Perform geological scan (once per session)
    const scanResult = await performGeologicalScan(
        channel, 
        dbEntry, 
        serverPowerLevel, 
        serverName
    );
    
    if (scanResult) {
        console.log(`Scan completed: ${scanResult.scanId}`);
        console.log(`Rock hardness: ${scanResult.geologicalProfile.rockHardness}%`);
        console.log(`Hazard seed: ${scanResult.hazardSeed}`);
    }
    
    // Continue with normal mining logic...
}

// 4. ACCESSING SCAN DATA
// After a scan is performed, the data is stored in the database:
async function getStoredScanData(channelId) {
    const gachaVC = require('../../../models/activevcs');
    const dbEntry = await gachaVC.findOne({ channelId });
    
    if (dbEntry?.gameData?.hazardRollDone) {
        return {
            scanId: dbEntry.gameData.scanId,
            dangerLevel: dbEntry.gameData.dangerLevel,
            hazardSeed: dbEntry.gameData.hazardSeed,
            geologicalProfile: dbEntry.gameData.geologicalProfile
        };
    }
    
    return null;
}

// 5. USING GEOLOGICAL DATA IN MINING
function adjustMiningBasedOnGeology(geologicalProfile, baseMiningPower) {
    // Rock hardness affects mining speed
    const hardnessModifier = (100 - geologicalProfile.rockHardness) / 100;
    const adjustedPower = baseMiningPower * hardnessModifier;
    
    console.log(`Mining power adjusted from ${baseMiningPower} to ${adjustedPower.toFixed(2)}`);
    console.log(`Due to ${geologicalProfile.rockHardness}% reinforced walls`);
    
    return adjustedPower;
}

// 6. HAZARD FREQUENCY CALCULATION
function shouldSpawnHazard(powerLevel) {
    const { calculateHazardFrequency } = require('./hazards/hazardScanner');
    const frequency = calculateHazardFrequency(powerLevel);
    
    const roll = Math.random() * 100;
    const spawns = roll < frequency.percentage;
    
    console.log(`Hazard check: ${roll.toFixed(1)} vs ${frequency.percentage}% = ${spawns ? 'HAZARD!' : 'Safe'}`);
    
    return spawns;
}

// 7. DISPLAY FORMATTING
function formatGeologicalDataForDisplay(geologicalProfile) {
    return {
        rockAnalysis: `${geologicalProfile.rockHardness}% reinforced walls`,
        environment: geologicalProfile.gasPresence,
        orePresence: geologicalProfile.oreRichness,
        danger: geologicalProfile.seismicActivity,
        depth: geologicalProfile.depthIndicator
    };
}

// 8. MIGRATION CHECKLIST
const MIGRATION_STEPS = `
MIGRATION CHECKLIST:
[x] Import new hazard scanner module
[x] Replace performInitialHazardRoll with performGeologicalScan
[x] Pass serverName parameter to scan function
[x] Update any references to old hazard functions
[x] Test with different power level servers
[x] Verify scan reports display correctly
[x] Check database storage of scan results
[ ] Update any dependent systems that use hazard data
[ ] Remove deprecated hazard functions after testing
`;

// 9. EXAMPLE OUTPUT STRUCTURE
const EXAMPLE_SCAN_OUTPUT = {
    embed: "Discord.Embed object with scan report",
    scanId: "SCAN-1234567890-5678",
    hazardSeed: 1234567890,
    geologicalProfile: {
        rockHardness: 45,
        oreRichness: "High-pressure carbon deposits",
        geologicalType: "Kimberlite pipes detected",
        seismicActivity: "Significant tectonic stress",
        depthIndicator: "◈◈◈◈◇◇◇",
        gasPresence: "Hydrogen sulfide: 11.3%"
    }
};

// 10. ERROR HANDLING
async function safeHazardScan(channel, dbEntry, powerLevel, serverName) {
    try {
        const result = await performGeologicalScan(channel, dbEntry, powerLevel, serverName);
        if (!result) {
            console.log("Scan already performed or skipped");
        }
        return result;
    } catch (error) {
        console.error("Hazard scan failed:", error);
        // Fallback to default geological profile
        return {
            geologicalProfile: {
                rockHardness: 20,
                oreRichness: "Standard ore distribution",
                geologicalType: "Unknown formations",
                seismicActivity: "Unmeasured",
                depthIndicator: "◇◇◇◇◇◇◇",
                gasPresence: "Unknown"
            }
        };
    }
}

module.exports = {
    miningEventWithHazardScan,
    getStoredScanData,
    adjustMiningBasedOnGeology,
    shouldSpawnHazard,
    formatGeologicalDataForDisplay,
    safeHazardScan,
    MIGRATION_STEPS,
    EXAMPLE_SCAN_OUTPUT
};
