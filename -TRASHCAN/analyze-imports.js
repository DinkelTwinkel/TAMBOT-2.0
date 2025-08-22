const fs = require('fs');
const path = require('path');

// Configuration
const PROJECT_ROOT = 'D:\\CODE\\TAMBOT 2.0';
const PATTERNS_DIR = path.join(PROJECT_ROOT, 'patterns');

// Function to scan all imports in a file
function scanFileImports(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const imports = [];
        
        // Match require statements
        const requireRegex = /require\s*\(\s*['"`]([^'"`;]+)['"`]\s*\)/g;
        let match;
        
        while ((match = requireRegex.exec(content)) !== null) {
            imports.push({
                type: 'require',
                path: match[1],
                line: content.substring(0, match.index).split('\n').length
            });
        }
        
        // Match ES6 imports
        const importRegex = /(?:import|from)\s+['"`]([^'"`;]+)['"`]/g;
        while ((match = importRegex.exec(content)) !== null) {
            imports.push({
                type: 'import',
                path: match[1],
                line: content.substring(0, match.index).split('\n').length
            });
        }
        
        return imports;
    } catch (error) {
        console.error(`Error reading ${filePath}: ${error.message}`);
        return [];
    }
}

// Recursively scan directory for JS files
function scanDirectory(dir, baseDir = dir) {
    const results = {};
    
    function scan(currentDir) {
        const files = fs.readdirSync(currentDir);
        
        for (const file of files) {
            const fullPath = path.join(currentDir, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                scan(fullPath);
            } else if (stat.isFile() && file.endsWith('.js')) {
                const relativePath = path.relative(baseDir, fullPath);
                const imports = scanFileImports(fullPath);
                
                if (imports.length > 0) {
                    results[relativePath] = {
                        fullPath,
                        imports,
                        relativeImports: imports.filter(i => i.path.startsWith('.')),
                        absoluteImports: imports.filter(i => !i.path.startsWith('.'))
                    };
                }
            }
        }
    }
    
    scan(dir);
    return results;
}

// Analyze import patterns
function analyzeImports() {
    console.log('🔍 Analyzing imports in TAMBOT 2.0...\n');
    
    const results = scanDirectory(PATTERNS_DIR, PROJECT_ROOT);
    
    // Statistics
    let totalFiles = 0;
    let totalImports = 0;
    let relativeImports = 0;
    let crossFolderImports = 0;
    const importDepth = {};
    
    // Track which files import which
    const dependencyMap = {};
    
    for (const [file, data] of Object.entries(results)) {
        totalFiles++;
        totalImports += data.imports.length;
        relativeImports += data.relativeImports.length;
        
        // Analyze import depths
        data.relativeImports.forEach(imp => {
            const depth = (imp.path.match(/\.\.\//g) || []).length;
            importDepth[depth] = (importDepth[depth] || 0) + 1;
            
            if (depth > 1) {
                crossFolderImports++;
            }
        });
        
        // Build dependency map
        data.imports.forEach(imp => {
            if (!dependencyMap[imp.path]) {
                dependencyMap[imp.path] = [];
            }
            dependencyMap[imp.path].push(file);
        });
    }
    
    // Display results
    console.log('📊 IMPORT STATISTICS:');
    console.log('─'.repeat(50));
    console.log(`Total files scanned: ${totalFiles}`);
    console.log(`Total imports found: ${totalImports}`);
    console.log(`Relative imports: ${relativeImports} (${Math.round(relativeImports/totalImports*100)}%)`);
    console.log(`Cross-folder imports (../../): ${crossFolderImports}`);
    console.log('');
    
    console.log('📈 IMPORT DEPTH DISTRIBUTION:');
    console.log('─'.repeat(50));
    for (const [depth, count] of Object.entries(importDepth).sort()) {
        const dots = '../'.repeat(parseInt(depth)) || './';
        console.log(`${dots.padEnd(15)} : ${count} imports`);
    }
    console.log('');
    
    // Find most imported files
    const mostImported = Object.entries(dependencyMap)
        .map(([path, importers]) => ({ path, count: importers.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    console.log('🎯 TOP 10 MOST IMPORTED MODULES:');
    console.log('─'.repeat(50));
    mostImported.forEach((item, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. ${item.path} (${item.count} imports)`);
    });
    console.log('');
    
    // Find files with most dependencies
    const filesByDependencies = Object.entries(results)
        .map(([file, data]) => ({ file, count: data.imports.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    console.log('📦 FILES WITH MOST DEPENDENCIES:');
    console.log('─'.repeat(50));
    filesByDependencies.forEach((item, i) => {
        console.log(`${(i + 1).toString().padStart(2)}. ${item.file} (${item.count} imports)`);
    });
    console.log('');
    
    // Identify problem areas
    console.log('⚠️  POTENTIAL ISSUES:');
    console.log('─'.repeat(50));
    
    let issues = 0;
    for (const [file, data] of Object.entries(results)) {
        const deepImports = data.relativeImports.filter(imp => 
            (imp.path.match(/\.\.\//g) || []).length > 2
        );
        
        if (deepImports.length > 0) {
            issues++;
            console.log(`\n❌ ${file}`);
            deepImports.forEach(imp => {
                console.log(`   Line ${imp.line}: ${imp.path}`);
            });
        }
    }
    
    if (issues === 0) {
        console.log('✅ No deep cross-folder imports found!');
    }
    
    // Save detailed report
    const report = {
        timestamp: new Date().toISOString(),
        statistics: {
            totalFiles,
            totalImports,
            relativeImports,
            crossFolderImports
        },
        importDepth,
        mostImported,
        filesByDependencies,
        fullResults: results
    };
    
    const reportPath = path.join(PROJECT_ROOT, 'import-analysis.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n');
    console.log('📝 Detailed report saved to: import-analysis.json');
    console.log('');
    console.log('💡 RECOMMENDATIONS:');
    console.log('─'.repeat(50));
    
    if (crossFolderImports > 20) {
        console.log('• High number of cross-folder imports detected');
        console.log('  Consider creating index.js files for cleaner imports');
    }
    
    if (Object.keys(importDepth)[3]) {
        console.log('• Very deep imports (../../../) detected');
        console.log('  Consider using module aliases or reorganizing structure');
    }
    
    console.log('• Use VS Code\'s "Move" refactoring for safe file relocation');
    console.log('• Create a backup before major reorganization');
    console.log('• Test incrementally after each change');
}

// Run the analysis
analyzeImports();