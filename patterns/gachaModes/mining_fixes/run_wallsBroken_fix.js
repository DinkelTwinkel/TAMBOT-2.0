// run_wallsBroken_fix.js
// Quick script to fix wallsBroken corruption issue
// Run this file directly: node run_wallsBroken_fix.js

const fixModule = require('./fix_wallsBroken_corruption');

async function runFix() {
    console.log('========================================');
    console.log('WALLS BROKEN STAT CORRUPTION FIX');
    console.log('========================================');
    console.log('This will fix values like: 950111[object Object]63263');
    console.log('');
    
    try {
        console.log('Starting fix process...\n');
        
        const result = await fixModule.fixAllCorruptedWallsBroken();
        
        console.log('\n========================================');
        console.log('FIX COMPLETE');
        console.log('========================================');
        console.log(`Fixed ${result.fixedCount} corrupted wallsBroken values`);
        
        if (result.corruptedChannels.length > 0) {
            console.log('\nChannels that were fixed:');
            result.corruptedChannels.forEach(channelId => {
                console.log(`  - ${channelId}`);
            });
        } else {
            console.log('\nNo corrupted values found. Database is clean!');
        }
        
        console.log('\n✅ Fix completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Error during fix:', error);
        console.error('Please check your database connection and try again.');
    }
}

// Run the fix
runFix().then(() => {
    console.log('\nExiting...');
    process.exit(0);
}).catch(error => {
    console.error('\nFatal error:', error);
    process.exit(1);
});
