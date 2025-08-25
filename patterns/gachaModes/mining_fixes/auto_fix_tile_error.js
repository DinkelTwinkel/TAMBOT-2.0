// Automated fix for the undefined 'tile' error at line 2816
// Run this script to fix the issue in mining_optimized_v5_performance.js

const fs = require('fs').promises;
const path = require('path');

async function fixUndefinedTileError() {
    const filePath = path.join(__dirname, 'mining_optimized_v5_performance.js');
    
    try {
        console.log('Reading mining_optimized_v5_performance.js...');
        let content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        
        console.log(`Total lines in file: ${lines.length}`);
        
        // Check line 2816 (index 2815)
        const errorLine = 2815; // Line 2816 in 0-based index
        
        console.log(`\nLine 2816 content:`);
        console.log(lines[errorLine]);
        
        // Look for patterns where tile is used without being defined
        // Common patterns to fix:
        const patternsToFix = [
            /if\s*\(\s*tile\.type\s*===\s*TILE_TYPES/,
            /if\s*\(\s*tile\s*&&\s*tile\.type/,
            /tile\.discovered\s*=/,
            /tile\.minedBy/,
            /tile\.mined\s*=/,
            /tile\.breaking/
        ];
        
        let fixApplied = false;
        
        // Check the specific error line and surrounding context
        for (let i = Math.max(0, errorLine - 10); i <= Math.min(lines.length - 1, errorLine + 10); i++) {
            const line = lines[i];
            
            // Check if this line references 'tile' without defining it
            if (i === errorLine || (i >= errorLine - 5 && i <= errorLine + 5)) {
                for (const pattern of patternsToFix) {
                    if (pattern.test(line) && !line.includes('const tile') && !line.includes('let tile')) {
                        console.log(`\nFound undefined tile reference at line ${i + 1}:`);
                        console.log(`  ${line}`);
                        
                        // Look for position variables in nearby lines
                        let targetX = 'targetPos.x';
                        let targetY = 'targetPos.y';
                        
                        // Search for actual position variable names in surrounding code
                        for (let j = Math.max(0, i - 5); j < i; j++) {
                            if (lines[j].includes('const targetX') || lines[j].includes('let targetX')) {
                                targetX = 'targetX';
                            }
                            if (lines[j].includes('const targetY') || lines[j].includes('let targetY')) {
                                targetY = 'targetY';
                            }
                            if (lines[j].includes('targetPos')) {
                                targetX = 'targetPos.x';
                                targetY = 'targetPos.y';
                            }
                            if (lines[j].includes('newX') && lines[j].includes('newY')) {
                                targetX = 'newX';
                                targetY = 'newY';
                            }
                        }
                        
                        // Insert tile definition before the line that uses it
                        const tileDefinition = `                    const tile = mapData.tiles[${targetY}]?.[${targetX}];`;
                        
                        // Find the right indentation
                        const indent = line.match(/^(\s*)/)[1];
                        const fixedDefinition = indent + `const tile = mapData.tiles[${targetY}]?.[${targetX}];`;
                        
                        // Insert the tile definition
                        lines.splice(i, 0, fixedDefinition);
                        
                        // Update the condition to include null check if needed
                        if (line.includes('if (tile.type')) {
                            lines[i + 1] = lines[i + 1].replace('if (tile.type', 'if (tile && tile.type');
                        }
                        
                        console.log(`\nApplied fix:`);
                        console.log(`  Added: ${fixedDefinition}`);
                        if (lines[i + 1] !== line) {
                            console.log(`  Modified: ${lines[i + 1]}`);
                        }
                        
                        fixApplied = true;
                        break;
                    }
                }
            }
            
            if (fixApplied) break;
        }
        
        if (!fixApplied) {
            // Fallback: Try to find and fix the specific error pattern
            console.log('\nApplying fallback fix for line 2816...');
            
            // Check if the error line contains a tile reference
            if (lines[errorLine].includes('tile')) {
                // Get the indentation of the error line
                const indent = lines[errorLine].match(/^(\s*)/)[1];
                
                // Determine the likely position variables based on context
                let hasTargetPos = false;
                let hasNewXY = false;
                let hasTargetXY = false;
                
                // Check previous lines for position variable patterns
                for (let i = Math.max(0, errorLine - 20); i < errorLine; i++) {
                    if (lines[i].includes('targetPos')) hasTargetPos = true;
                    if (lines[i].includes('newX') && lines[i].includes('newY')) hasNewXY = true;
                    if (lines[i].includes('targetX') && lines[i].includes('targetY')) hasTargetXY = true;
                }
                
                // Choose the appropriate position variables
                let tileDefinition;
                if (hasTargetPos) {
                    tileDefinition = `${indent}const tile = mapData.tiles[targetPos.y]?.[targetPos.x];`;
                } else if (hasNewXY) {
                    tileDefinition = `${indent}const tile = mapData.tiles[newY]?.[newX];`;
                } else if (hasTargetXY) {
                    tileDefinition = `${indent}const tile = mapData.tiles[targetY]?.[targetX];`;
                } else {
                    // Default fallback
                    tileDefinition = `${indent}const tile = mapData.tiles[position.y]?.[position.x];`;
                }
                
                // Insert the tile definition before the error line
                lines.splice(errorLine, 0, tileDefinition);
                
                // Fix the condition to include null check
                if (lines[errorLine + 1].includes('if (tile.')) {
                    lines[errorLine + 1] = lines[errorLine + 1].replace(/if\s*\(\s*tile\./, 'if (tile && tile.');
                }
                
                console.log(`Added tile definition: ${tileDefinition}`);
                fixApplied = true;
            }
        }
        
        if (fixApplied) {
            // Write the fixed content back to the file
            const fixedContent = lines.join('\n');
            
            // Create a backup first
            const backupPath = filePath + '.backup_' + Date.now();
            await fs.writeFile(backupPath, content);
            console.log(`\nCreated backup at: ${backupPath}`);
            
            // Write the fixed content
            await fs.writeFile(filePath, fixedContent);
            console.log('Successfully applied fix to mining_optimized_v5_performance.js');
            
            console.log('\n✅ The undefined tile error should now be fixed!');
            console.log('If the error persists, please check the specific context around line 2816.');
        } else {
            console.log('\n⚠️ Could not automatically apply fix.');
            console.log('Please manually add the following before line 2816:');
            console.log('  const tile = mapData.tiles[targetPos.y]?.[targetPos.x];');
            console.log('And change any "if (tile.type" to "if (tile && tile.type"');
        }
        
    } catch (error) {
        console.error('Error fixing file:', error);
        
        console.log('\n📝 Manual fix instructions:');
        console.log('1. Open mining_optimized_v5_performance.js');
        console.log('2. Go to line 2816');
        console.log('3. Add this line before the tile reference:');
        console.log('   const tile = mapData.tiles[y]?.[x]; // Use actual position variables');
        console.log('4. Change "if (tile.type" to "if (tile && tile.type"');
    }
}

// Run the fix
fixUndefinedTileError().catch(console.error);
