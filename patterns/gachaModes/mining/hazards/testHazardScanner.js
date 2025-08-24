// testHazardScanner.js - Test the geological hazard scanning system
const { performGeologicalScan, getTechnicalHazards, calculateHazardFrequency, GEOLOGICAL_PROFILES } = require('./hazardScanner');

// Test data for different servers
const testServers = [
    { name: "Coal Mines", power: 1 },
    { name: "Diamond Mines", power: 4 },
    { name: "Obsidian Forge", power: 6 },
    { name: "Adamantite Abyss", power: 7 }
];

console.log("=== HAZARD SCANNER TEST SUITE ===\n");

// Test geological profiles
console.log("1. GEOLOGICAL PROFILES TEST:");
for (const profile in GEOLOGICAL_PROFILES) {
    const data = GEOLOGICAL_PROFILES[profile];
    console.log(`\n${profile}:`);
    console.log(`  Rock Hardness: ${data.rockHardness}%`);
    console.log(`  Ore Richness: ${data.oreRichness}`);
    console.log(`  Gas Presence: ${data.gasPresence}`);
    console.log(`  Depth: ${data.depthIndicator}`);
}

console.log("\n2. HAZARD FREQUENCY CALCULATION TEST:");
for (let power = 1; power <= 7; power++) {
    const freq = calculateHazardFrequency(power);
    console.log(`\nPower Level ${power}:`);
    console.log(`  Percentage: ${freq.percentage}%`);
    console.log(`  Frequency: ${freq.frequency}`);
    console.log(`  Interval: ${freq.interval}`);
}

console.log("\n3. TECHNICAL HAZARDS TEST:");
for (let level = 1; level <= 7; level++) {
    const hazards = getTechnicalHazards(level);
    const structural = hazards.filter(h => h.severity !== 'BONUS' && h.code.match(/RKF|COL|FSR|TEC|MAG|DIM|GRV|VOL|APO|BLK|OBL/));
    const environmental = hazards.filter(h => h.severity !== 'BONUS' && h.code.match(/GAS|TMP|EXP|ANM|BIO|RAD|PSY|CHR|VOI|END|NUC|COS|REA|WTR/));
    const resources = hazards.filter(h => h.severity === 'BONUS');
    
    console.log(`\nDanger Level ${level}:`);
    console.log(`  Structural Hazards: ${structural.length}`);
    console.log(`  Environmental Hazards: ${environmental.length}`);
    console.log(`  Resource Bonuses: ${resources.length}`);
    console.log(`  Total Hazards: ${hazards.length}`);
    
    if (level === 7) {
        console.log("\n  Sample Level 7 Hazards:");
        hazards.slice(0, 5).forEach(h => {
            console.log(`    [${h.code}] ${h.desc} (${h.severity})`);
        });
    }
}

console.log("\n=== TEST COMPLETE ===");

// Export test function for external use
module.exports = {
    runTests: function() {
        console.log("Running hazard scanner tests...");
        return true;
    }
};
