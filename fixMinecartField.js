// fixMinecartField.js - Migration tool to fix minecarts -> minecart field name
const gachaVC = require('./models/activevcs');

async function fixMinecartFields() {
    console.log('========================================');
    console.log('Minecart Field Migration Tool');
    console.log('========================================\n');
    
    try {
        // Find all channels with the incorrect 'minecarts' field
        const incorrectChannels = await gachaVC.find({
            'gameData.minecarts': { $exists: true }
        });
        
        console.log(`Found ${incorrectChannels.length} channels with incorrect 'minecarts' field\n`);
        
        if (incorrectChannels.length === 0) {
            console.log('✅ No migration needed - all channels use correct field name');
            process.exit(0);
        }
        
        let fixed = 0;
        let failed = 0;
        
        for (const entry of incorrectChannels) {
            try {
                console.log(`Processing channel ${entry.channelId}...`);
                
                // Check if minecart already exists
                if (entry.gameData.minecart) {
                    console.log(`  ⚠️ Channel already has 'minecart' field, skipping minecarts migration`);
                    
                    // Just remove the incorrect field
                    await gachaVC.updateOne(
                        { channelId: entry.channelId },
                        { $unset: { 'gameData.minecarts': 1 } }
                    );
                } else {
                    // Migrate minecarts -> minecart
                    const minecartData = entry.gameData.minecarts;
                    
                    // Transform the data structure if needed
                    let newMinecart = { items: {}, contributors: {} };
                    
                    // Check if it's in the old per-player format
                    if (minecartData && typeof minecartData === 'object') {
                        // Check if this looks like player data (has user IDs as keys)
                        const keys = Object.keys(minecartData);
                        if (keys.length > 0 && keys[0].match(/^\d{17,19}$/)) {
                            // Old format: minecarts[playerId][itemId] = quantity
                            console.log(`  Converting from old per-player format...`);
                            
                            for (const [playerId, playerItems] of Object.entries(minecartData)) {
                                for (const [itemId, quantity] of Object.entries(playerItems)) {
                                    // Initialize item if needed
                                    if (!newMinecart.items[itemId]) {
                                        newMinecart.items[itemId] = {
                                            quantity: 0,
                                            contributors: {}
                                        };
                                    }
                                    
                                    // Add to totals
                                    newMinecart.items[itemId].quantity += quantity;
                                    newMinecart.items[itemId].contributors[playerId] = quantity;
                                    
                                    // Track contributor totals
                                    newMinecart.contributors[playerId] = (newMinecart.contributors[playerId] || 0) + quantity;
                                }
                            }
                        } else {
                            // Might already be in correct format, just copy
                            newMinecart = minecartData;
                        }
                    }
                    
                    // Update the database
                    await gachaVC.updateOne(
                        { channelId: entry.channelId },
                        {
                            $set: { 'gameData.minecart': newMinecart },
                            $unset: { 'gameData.minecarts': 1 }
                        }
                    );
                    
                    console.log(`  ✅ Migrated successfully`);
                    console.log(`     - Items: ${Object.keys(newMinecart.items).length}`);
                    console.log(`     - Contributors: ${Object.keys(newMinecart.contributors).length}`);
                }
                
                fixed++;
                
            } catch (error) {
                console.error(`  ❌ Failed to migrate channel ${entry.channelId}:`, error.message);
                failed++;
            }
        }
        
        console.log('\n========================================');
        console.log('Migration Complete:');
        console.log(`✅ Fixed: ${fixed} channels`);
        console.log(`❌ Failed: ${failed} channels`);
        console.log('========================================');
        
    } catch (error) {
        console.error('Fatal error during migration:', error);
    }
    
    process.exit(0);
}

// Run the migration
fixMinecartFields();
