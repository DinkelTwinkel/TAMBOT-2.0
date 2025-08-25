// testSimpleHazardScanner.js - Test the simplified hazard scanner
const simpleHazardScanner = require('./simpleHazardScanner');

// Mock hazards data (simulating what hazardStorage would return)
function createMockHazardsData() {
    const hazards = new Map();
    
    // Add some test hazards
    hazards.set('5,5', { type: 'bomb_trap', triggered: false });
    hazards.set('10,10', { type: 'portal_trap', triggered: false });
    hazards.set('15,15', { type: 'green_fog', triggered: false });
    hazards.set('20,20', { type: 'wall_trap', triggered: true }); // Already triggered
    hazards.set('25,25', { type: 'fire_blast', triggered: false });
    hazards.set('6,5', { type: 'bomb_trap', triggered: false }); // Cluster with first bomb
    hazards.set('5,6', { type: 'bomb_trap', triggered: false }); // Cluster with first bomb
    
    return {
        hazards: hazards,
        version: 1
    };
}

// Mock map data
function createMockMapData() {
    return {
        width: 50,
        height: 50,
        tiles: [], // Not needed for this test
        entranceX: 25,
        entranceY: 25
    };
}

// Test 1: Scan active hazards
console.log('=== TEST 1: Scanning Active Hazards ===');
const mockHazards = createMockHazardsData();
const scanResult = simpleHazardScanner.scanActiveHazards(mockHazards);

console.log('Scan Results:');
console.log(`  Total hazards: ${scanResult.total}`);
console.log(`  Active hazards: ${scanResult.active}`);
console.log(`  Triggered hazards: ${scanResult.triggered}`);
console.log('  Hazard counts by type:');
for (const [type, count] of Object.entries(scanResult.counts)) {
    if (count > 0) {
        const info = simpleHazardScanner.HAZARD_INFO[type];
        console.log(`    ${info.emoji} ${info.name}: ${count}`);
    }
}

// Test 2: Get allowed hazards for different mines
console.log('\n=== TEST 2: Allowed Hazards by Mine ===');
const testMines = [
    { id: '1', name: 'Coal Mines' },
    { id: '3', name: 'Diamond Mines' },
    { id: '5', name: 'Ruby Depths' },
    { id: '16', name: "???'s Gullet" }
];

for (const mine of testMines) {
    const allowed = simpleHazardScanner.getAllowedHazards(mine.id);
    console.log(`${mine.name} (ID: ${mine.id}):`);
    if (allowed.length > 0) {
        for (const type of allowed) {
            const info = simpleHazardScanner.HAZARD_INFO[type];
            console.log(`  - ${info.emoji} ${info.name}`);
        }
    } else {
        console.log('  - No hazards configured');
    }
}

// Test 3: Quick hazard summary
console.log('\n=== TEST 3: Quick Hazard Summary ===');
const summary = simpleHazardScanner.getQuickHazardSummary(mockHazards);
console.log('Summary:', summary);

// Test 4: Check specific positions
console.log('\n=== TEST 4: Check Specific Positions ===');
const positionsToCheck = [
    { x: 5, y: 5 },   // Has bomb trap
    { x: 10, y: 10 }, // Has portal trap
    { x: 20, y: 20 }, // Has triggered wall trap
    { x: 30, y: 30 }  // No hazard
];

for (const pos of positionsToCheck) {
    const hazard = simpleHazardScanner.getHazardAtPosition(mockHazards, pos.x, pos.y);
    if (hazard) {
        console.log(`  (${pos.x}, ${pos.y}): ${hazard.info.emoji} ${hazard.info.name} - ${hazard.triggered ? 'TRIGGERED' : 'ACTIVE'}`);
    } else {
        console.log(`  (${pos.x}, ${pos.y}): No hazard`);
    }
}

// Test 5: Hazard distribution
console.log('\n=== TEST 5: Hazard Distribution ===');
const mockMap = createMockMapData();
const distribution = simpleHazardScanner.getHazardDistribution(mockHazards, mockMap);
console.log('Distribution stats:');
console.log(`  Map coverage: ${distribution.coverage}`);
console.log(`  Average density: 1 hazard per ${distribution.density} tiles`);
console.log(`  Hazard clusters: ${distribution.clusters}`);
console.log(`  Largest cluster size: ${distribution.largestCluster} hazards`);

// Test 6: Simulate a Discord embed (console output)
console.log('\n=== TEST 6: Simulated Scan Output ===');
console.log('┌─────────────────────────────────────┐');
console.log('│  ⚠️ HAZARD SCAN - Test Mine         │');
console.log('├─────────────────────────────────────┤');
console.log(`│ Active Hazards: ${scanResult.active}/${scanResult.total}              │`);
console.log('├─────────────────────────────────────┤');
console.log('│ 🎯 Detected Hazard Types:           │');
for (const [type, count] of Object.entries(scanResult.counts)) {
    if (count > 0) {
        const info = simpleHazardScanner.HAZARD_INFO[type];
        console.log(`│   ${info.emoji} ${info.name.padEnd(15)} ${count} active │`);
    }
}
console.log('├─────────────────────────────────────┤');
console.log('│ ⚡ Danger Level: Power Level 4       │');
console.log('│    Spawn Rate: Moderate (15% chance)│');
console.log('└─────────────────────────────────────┘');

console.log('\n=== All Tests Complete ===');