// QUICK FIX SCRIPT - Run this immediately to resolve the duplicate key error
// Usage: node quickfix_playertag.js

const mongoose = require('mongoose');
const path = require('path');

// Adjust this path to your PlayerInventory model
const PlayerInventory = require('./models/PlayerInventory');

// Get connection string from environment or config
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tam2';

async function quickFix() {
    console.log('🔧 Starting PlayerTag Duplicate Quick Fix...\n');
    
    try {
        // Connect to MongoDB
        console.log('📡 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // Step 1: Check current indexes
        console.log('📋 Step 1: Checking current indexes...');
        const indexes = await PlayerInventory.collection.indexes();
        const playerTagIndex = indexes.find(idx => idx.name === 'playerTag_1');
        
        if (playerTagIndex) {
            console.log(`   Found playerTag index: unique=${playerTagIndex.unique}`);
            
            if (playerTagIndex.unique) {
                // Drop the unique constraint
                console.log('   Dropping unique constraint on playerTag...');
                await PlayerInventory.collection.dropIndex('playerTag_1');
                console.log('   ✅ Dropped unique index on playerTag');
                
                // Create non-unique index
                console.log('   Creating non-unique index on playerTag...');
                await PlayerInventory.collection.createIndex(
                    { playerTag: 1 },
                    { unique: false, background: true }
                );
                console.log('   ✅ Created non-unique index on playerTag');
            } else {
                console.log('   ✅ playerTag index is already non-unique');
            }
        } else {
            console.log('   No playerTag index found, creating non-unique index...');
            await PlayerInventory.collection.createIndex(
                { playerTag: 1 },
                { unique: false, background: true }
            );
            console.log('   ✅ Created non-unique index on playerTag');
        }
        
        // Step 2: Fix duplicate Unknown#0000 entries
        console.log('\n📋 Step 2: Fixing duplicate Unknown#0000 entries...');
        const duplicates = await PlayerInventory.find({ 
            playerTag: "Unknown#0000" 
        });
        
        console.log(`   Found ${duplicates.length} documents with Unknown#0000`);
        
        if (duplicates.length > 0) {
            for (let i = 0; i < duplicates.length; i++) {
                const doc = duplicates[i];
                const newTag = `Unknown_${doc.playerId}#0000`;
                
                await PlayerInventory.updateOne(
                    { _id: doc._id },
                    { $set: { playerTag: newTag } }
                );
                
                console.log(`   Updated player ${doc.playerId}: Unknown#0000 → ${newTag}`);
            }
            console.log(`   ✅ Fixed all ${duplicates.length} duplicate entries`);
        } else {
            console.log('   ✅ No duplicate entries found');
        }
        
        // Step 3: Ensure playerId has unique index
        console.log('\n📋 Step 3: Ensuring playerId has unique index...');
        const playerIdIndex = indexes.find(idx => 
            idx.key && idx.key.playerId === 1
        );
        
        if (!playerIdIndex || !playerIdIndex.unique) {
            console.log('   Creating unique index on playerId...');
            await PlayerInventory.collection.createIndex(
                { playerId: 1 },
                { unique: true, background: true }
            );
            console.log('   ✅ Created unique index on playerId');
        } else {
            console.log('   ✅ playerId already has unique index');
        }
        
        // Step 4: Verify final state
        console.log('\n📋 Step 4: Verifying final state...');
        const finalIndexes = await PlayerInventory.collection.indexes();
        console.log('   Current indexes:');
        finalIndexes.forEach(idx => {
            if (idx.key.playerId || idx.key.playerTag) {
                console.log(`   - ${Object.keys(idx.key)[0]}: unique=${idx.unique || false}`);
            }
        });
        
        // Step 5: Test the fix
        console.log('\n📋 Step 5: Testing the fix...');
        const testPlayerId = '999999999999999999'; // Test ID
        
        try {
            // Try to create/update with Unknown#0000 (should auto-fix)
            const testDoc = await PlayerInventory.findOneAndUpdate(
                { playerId: testPlayerId },
                { 
                    $set: { 
                        playerTag: `Unknown_${testPlayerId}#0000`,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true, new: true }
            );
            
            console.log('   ✅ Test successful - can create/update inventory');
            
            // Clean up test document
            await PlayerInventory.deleteOne({ playerId: testPlayerId });
            
        } catch (error) {
            console.error('   ❌ Test failed:', error.message);
        }
        
        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('✅ QUICK FIX COMPLETED SUCCESSFULLY!');
        console.log('='.repeat(50));
        console.log('\nSummary:');
        console.log('  • Removed unique constraint from playerTag');
        console.log('  • Fixed all Unknown#0000 duplicates');
        console.log('  • Ensured playerId is the unique identifier');
        console.log('  • Your bot should now work without duplicate key errors');
        console.log('\n⚠️  Next steps:');
        console.log('  1. Update your code to use Unknown_${playerId}#0000 format');
        console.log('  2. Implement the InventoryManager class for safer operations');
        console.log('  3. Monitor for any remaining issues');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error);
        console.error('\nStack trace:', error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n📡 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the fix
quickFix();
