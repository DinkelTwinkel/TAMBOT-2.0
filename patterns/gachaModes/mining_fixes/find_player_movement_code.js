// find_player_movement_code.js - Helper to locate where to add hazard checking

const fs = require('fs');
const path = require('path');

/**
 * This script helps find where player movement is handled in the mining code
 * so we know where to add hazard checking
 */

function findPlayerMovementPatterns() {
    const filePath = path.join(__dirname, '../../mining_optimized_v5_performance.js');
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Split into lines for analysis
    const lines = content.split('\n');
    
    // Patterns that indicate player movement
    const movementPatterns = [
        /position\.x\s*=\s*/,
        /position\.y\s*=\s*/,
        /playerPositions\[.*?\]\s*=\s*{/,
        /\.x\s*=\s*position\.x\s*[+-]/,
        /\.y\s*=\s*position\.y\s*[+-]/,
        /mapData\.playerPositions\[member\.id\]/,
        /updatePlayerPosition/,
        /movePlayer/,
        /handlePlayerMovement/
    ];
    
    const results = [];
    
    lines.forEach((line, index) => {
        for (const pattern of movementPatterns) {
            if (pattern.test(line)) {
                // Get context (5 lines before and after)
                const contextStart = Math.max(0, index - 5);
                const contextEnd = Math.min(lines.length - 1, index + 5);
                const context = lines.slice(contextStart, contextEnd + 1).join('\n');
                
                results.push({
                    lineNumber: index + 1,
                    line: line.trim(),
                    pattern: pattern.toString(),
                    context: context
                });
                break; // Only match first pattern per line
            }
        }
    });
    
    // Also look for the processPlayerActionsEnhanced function
    const functionPattern = /async\s+function\s+processPlayerActionsEnhanced|processPlayerActionsEnhanced\s*=|const\s+processPlayerActionsEnhanced/;
    lines.forEach((line, index) => {
        if (functionPattern.test(line)) {
            results.push({
                lineNumber: index + 1,
                line: line.trim(),
                pattern: 'processPlayerActionsEnhanced function',
                context: lines.slice(index, Math.min(index + 20, lines.length)).join('\n')
            });
        }
    });
    
    return results;
}

/**
 * Check if hazard checking already exists
 */
function checkForExistingHazardChecks() {
    const filePath = path.join(__dirname, '../../mining_optimized_v5_performance.js');
    const content = fs.readFileSync(filePath, 'utf8');
    
    const hazardPatterns = [
        /processEncounterTrigger/,
        /processHazardTrigger/,
        /hazardStorage\.getHazard/,
        /hazardEffects\.process/
    ];
    
    const results = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
        for (const pattern of hazardPatterns) {
            if (pattern.test(line)) {
                results.push({
                    lineNumber: index + 1,
                    line: line.trim(),
                    pattern: pattern.toString()
                });
            }
        }
    });
    
    return results;
}

// Run the analysis
console.log('=== FINDING PLAYER MOVEMENT CODE ===\n');
const movementLocations = findPlayerMovementPatterns();

if (movementLocations.length > 0) {
    console.log(`Found ${movementLocations.length} potential player movement locations:\n`);
    
    // Group by pattern type
    const byPattern = {};
    movementLocations.forEach(loc => {
        if (!byPattern[loc.pattern]) {
            byPattern[loc.pattern] = [];
        }
        byPattern[loc.pattern].push(loc);
    });
    
    // Show summary
    Object.keys(byPattern).forEach(pattern => {
        console.log(`Pattern: ${pattern}`);
        console.log(`  Found at lines: ${byPattern[pattern].map(l => l.lineNumber).join(', ')}`);
        console.log(`  Example: ${byPattern[pattern][0].line}`);
        console.log('');
    });
    
    // Show the most likely location (position.x = ... pattern)
    const positionUpdates = movementLocations.filter(l => l.pattern.includes('position.x'));
    if (positionUpdates.length > 0) {
        console.log('=== MOST LIKELY LOCATION FOR HAZARD CHECK ===');
        console.log(`Line ${positionUpdates[0].lineNumber}:`);
        console.log('Context:');
        console.log(positionUpdates[0].context);
        console.log('\nAdd hazard checking code AFTER this position update!');
    }
} else {
    console.log('No direct player movement patterns found.');
    console.log('The code might use a different pattern or be in a separate file.');
}

console.log('\n=== CHECKING FOR EXISTING HAZARD CHECKS ===\n');
const existingChecks = checkForExistingHazardChecks();

if (existingChecks.length > 0) {
    console.log(`Found ${existingChecks.length} existing hazard references:`);
    existingChecks.forEach(check => {
        console.log(`  Line ${check.lineNumber}: ${check.line}`);
    });
    console.log('\nNote: These are just imports/definitions, not actual usage in player movement!');
} else {
    console.log('No hazard checking found in player movement code (this is the problem!)');
}

console.log('\n=== RECOMMENDATION ===');
console.log('1. Look for where player positions are updated after movement');
console.log('2. Add hazard checking immediately after position updates');
console.log('3. The hazard check should call hazardEffects.processEncounterTrigger()');
console.log('4. Test by moving players and watching for [HAZARD] console messages');

module.exports = {
    findPlayerMovementPatterns,
    checkForExistingHazardChecks
};