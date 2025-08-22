const fs = require('fs');
const path = require('path');

// Safe Backup and Reorganization Helper for TAMBOT 2.0
// Run this before making any changes!

const PROJECT_ROOT = 'D:\\CODE\\TAMBOT 2.0';
const BACKUP_ROOT = 'D:\\CODE\\TAMBOT 2.0_BACKUP_' + new Date().toISOString().replace(/[:.]/g, '-');

console.log('🛡️  TAMBOT 2.0 - Safe Reorganization Helper');
console.log('='.repeat(60));

// Function to copy directory recursively
function copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            // Skip node_modules and .git
            if (entry.name === 'node_modules' || entry.name === '.git') {
                continue;
            }
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Function to create a safe move operation
function createSafeMoveOperation(oldPath, newPath) {
    const operations = [];
    
    // Find all files that import the old path
    function findImports(dir, target) {
        const imports = [];
        
        function scan(currentDir) {
            const files = fs.readdirSync(currentDir);
            
            for (const file of files) {
                const fullPath = path.join(currentDir, file);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                    scan(fullPath);
                } else if (stat.isFile() && file.endsWith('.js')) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    
                    // Check if this file imports our target
                    if (content.includes(target)) {
                        imports.push(fullPath);
                    }
                }
            }
        }
        
        scan(dir);
        return imports;
    }
    
    const affectedFiles = findImports(PROJECT_ROOT, path.basename(oldPath, '.js'));
    
    operations.push({
        type: 'move',
        from: oldPath,
        to: newPath,
        affectedFiles: affectedFiles
    });
    
    return operations;
}

// Main menu
function showMenu() {
    console.log('\n📋 MAIN MENU:');
    console.log('─'.repeat(40));
    console.log('1. Create full backup');
    console.log('2. Analyze current structure');
    console.log('3. Generate reorganization plan');
    console.log('4. Create module index files');
    console.log('5. Test import paths');
    console.log('6. Exit');
    console.log('');
}

// Create backup
function createBackup() {
    console.log(`\n📦 Creating backup to: ${BACKUP_ROOT}`);
    console.log('This may take a moment...\n');
    
    try {
        copyDirectory(PROJECT_ROOT, BACKUP_ROOT);
        console.log('✅ Backup created successfully!');
        console.log(`📍 Location: ${BACKUP_ROOT}`);
        
        // Create restore script
        const restoreScript = `
@echo off
echo Restoring TAMBOT 2.0 from backup...
xcopy /E /I /Y "${BACKUP_ROOT}" "${PROJECT_ROOT}"
echo Restore complete!
pause
`;
        fs.writeFileSync(path.join(BACKUP_ROOT, 'RESTORE.bat'), restoreScript);
        console.log('📝 Restore script created: RESTORE.bat');
        
    } catch (error) {
        console.error('❌ Backup failed:', error.message);
    }
}

// Analyze structure
function analyzeStructure() {
    console.log('\n🔍 Analyzing folder structure...\n');
    
    const patterns = path.join(PROJECT_ROOT, 'patterns');
    
    function countFiles(dir, level = 0) {
        let fileCount = 0;
        let folderCount = 0;
        const indent = '  '.repeat(level);
        
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                if (item !== 'node_modules' && !item.startsWith('.')) {
                    folderCount++;
                    console.log(`${indent}📁 ${item}/`);
                    const subCounts = countFiles(fullPath, level + 1);
                    fileCount += subCounts.files;
                    folderCount += subCounts.folders;
                }
            } else if (item.endsWith('.js')) {
                fileCount++;
            }
        }
        
        if (level === 0) {
            console.log(`\n📊 Total: ${fileCount} JS files in ${folderCount} folders`);
        }
        
        return { files: fileCount, folders: folderCount };
    }
    
    countFiles(patterns);
}

// Generate reorganization plan
function generateReorganizationPlan() {
    console.log('\n📝 Generating reorganization plan...\n');
    
    const plan = {
        timestamp: new Date().toISOString(),
        operations: []
    };
    
    // Suggested new structure
    const suggestions = [
        {
            category: 'Core Gacha System',
            files: ['gachaGameMaster.js', 'gachaMachine.js'],
            newPath: 'patterns/core/gacha/'
        },
        {
            category: 'Mining Game',
            files: ['mining_optimized_v5_performance.js', 'miningDebugUtils.js'],
            newPath: 'patterns/core/gacha/modes/mining/'
        },
        {
            category: 'Economy System',
            files: ['createCurrencyProfile.js', 'ensureMoneyProfile.js'],
            newPath: 'patterns/core/economy/currency/'
        },
        {
            category: 'Shop System',
            files: ['generateShop.js', 'generateShopImage.js', 'shopHandler.js'],
            newPath: 'patterns/core/economy/shops/'
        },
        {
            category: 'Image Generators',
            files: ['generateLocationImage.js', 'generateMinecartImage.js'],
            newPath: 'patterns/utilities/imageGenerators/'
        },
        {
            category: 'Message Handlers',
            files: ['botMessageCleaner.js', 'registerBotMessage.js', 'emptyVoiceCheck.js'],
            newPath: 'patterns/utilities/messageHandlers/'
        }
    ];
    
    suggestions.forEach(suggestion => {
        console.log(`\n📂 ${suggestion.category}:`);
        console.log(`   Target: ${suggestion.newPath}`);
        console.log(`   Files to move:`);
        suggestion.files.forEach(file => {
            console.log(`   • ${file}`);
        });
    });
    
    // Save plan
    const planPath = path.join(PROJECT_ROOT, 'reorganization-plan.json');
    fs.writeFileSync(planPath, JSON.stringify(suggestions, null, 2));
    console.log(`\n💾 Plan saved to: reorganization-plan.json`);
}

// Create module index files
function createIndexFiles() {
    console.log('\n📄 Creating module index files...\n');
    
    const indexContent = `// Auto-generated index file
// Created: ${new Date().toISOString()}

module.exports = {
    // Add your exports here
    // Example:
    // gachaGameMaster: require('./gachaGameMaster'),
    // gachaMachine: require('./gachaMachine'),
};
`;
    
    const directories = [
        'patterns',
        'patterns/currency',
        'patterns/gachaModes',
        'patterns/gachaModes/mining',
        'patterns/shops',
        'patterns/itemSystem',
        'patterns/systemUtils'
    ];
    
    directories.forEach(dir => {
        const fullPath = path.join(PROJECT_ROOT, dir);
        const indexPath = path.join(fullPath, 'index.js');
        
        if (fs.existsSync(fullPath) && !fs.existsSync(indexPath)) {
            fs.writeFileSync(indexPath, indexContent);
            console.log(`✅ Created: ${dir}/index.js`);
        } else if (fs.existsSync(indexPath)) {
            console.log(`⏭️  Skipped: ${dir}/index.js (already exists)`);
        }
    });
}

// Test import paths
function testImportPaths() {
    console.log('\n🧪 Testing import paths...\n');
    
    const testFile = path.join(PROJECT_ROOT, 'patterns', 'test-imports.js');
    const testContent = `
// Test file for import validation
console.log('Testing imports...');

try {
    // Test relative imports
    const gachaGameMaster = require('./gachaGameMaster');
    console.log('✅ gachaGameMaster loaded');
} catch (e) {
    console.log('❌ gachaGameMaster failed:', e.message);
}

try {
    const mining = require('./gachaModes/mining_optimized_v5_performance');
    console.log('✅ mining module loaded');
} catch (e) {
    console.log('❌ mining module failed:', e.message);
}

console.log('Test complete!');
`;
    
    fs.writeFileSync(testFile, testContent);
    console.log('📝 Test file created: patterns/test-imports.js');
    console.log('Run: node patterns/test-imports.js');
}

// Interactive CLI
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function promptUser() {
    showMenu();
    rl.question('Enter your choice (1-6): ', (answer) => {
        switch(answer) {
            case '1':
                createBackup();
                setTimeout(promptUser, 2000);
                break;
            case '2':
                analyzeStructure();
                setTimeout(promptUser, 2000);
                break;
            case '3':
                generateReorganizationPlan();
                setTimeout(promptUser, 2000);
                break;
            case '4':
                createIndexFiles();
                setTimeout(promptUser, 2000);
                break;
            case '5':
                testImportPaths();
                setTimeout(promptUser, 2000);
                break;
            case '6':
                console.log('\n👋 Goodbye! Remember to test after any changes!');
                rl.close();
                process.exit(0);
                break;
            default:
                console.log('Invalid choice. Please try again.');
                promptUser();
        }
    });
}

// Start the program
console.log('\n⚠️  IMPORTANT: This tool helps you safely reorganize your code.');
console.log('Always create a backup before making changes!');
promptUser();