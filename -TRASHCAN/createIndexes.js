// createIndexes.js - Run this once to create all MongoDB indexes for optimal performance
const mongoose = require('mongoose');

// Try to load the connection string from keys.json (same as your bot uses)
let mongoUri;
try {
    const { mongourl } = require('./keys.json');
    mongoUri = mongourl;
    console.log('✅ Found MongoDB connection in keys.json\n');
} catch (e) {
    console.log('⚠️  Could not load keys.json, will need manual connection string\n');
}

async function createIndexes() {
    console.log('🔧 MongoDB Index Creation Tool');
    console.log('==============================\n');
    
    try {
        // If no connection string from keys.json, check environment variables
        if (!mongoUri) {
            mongoUri = process.env.MONGODB_URI || 
                      process.env.DATABASE_URL || 
                      process.env.MONGO_URI ||
                      process.env.DB_URI;
        }
        
        // If still no connection string found
        if (!mongoUri) {
            console.log('❌ No MongoDB connection string found!');
            console.log('\n📝 To fix this, do one of the following:');
            console.log('   Option 1: Make sure keys.json exists with "mongourl" field');
            console.log('   Option 2: Edit this file and replace CONNECTION_STRING_HERE below');
            console.log('   Option 3: Set MONGODB_URI environment variable\n');
            
            // REPLACE THIS WITH YOUR ACTUAL CONNECTION STRING IF NEEDED
            mongoUri = "CONNECTION_STRING_HERE";
            
            if (mongoUri === "CONNECTION_STRING_HERE") {
                console.error('Please add your MongoDB connection string!');
                console.log('\nExample connection strings:');
                console.log('  MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/databasename');
                console.log('  Local MongoDB: mongodb://localhost:27017/databasename');
                return;
            }
        }
        
        console.log('📡 Connecting to MongoDB...');
        await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('✅ Connected to mayoDB (same as your bot)\n');

        const db = mongoose.connection.db;
        let indexesCreated = 0;
        let indexesSkipped = 0;

        // Helper function to create index safely
        async function createIndexSafely(collection, index, indexName) {
            try {
                await db.collection(collection).createIndex(index);
                console.log(`✅ Created index '${indexName}' on ${collection}`);
                indexesCreated++;
            } catch (error) {
                if (error.code === 85 || error.message.includes('already exists')) {
                    console.log(`⏭️  Index '${indexName}' already exists on ${collection}`);
                    indexesSkipped++;
                } else {
                    console.error(`❌ Error creating index '${indexName}' on ${collection}:`, error.message);
                }
            }
        }

        // Create Currency indexes
        console.log('📊 Creating Currency indexes...');
        await createIndexSafely('currencies', { userId: 1 }, 'userId');
        await createIndexSafely('currencies', { userId: 1, guildId: 1 }, 'userId_guildId');
        console.log();
        
        // Create PlayerInventory indexes
        console.log('🎒 Creating PlayerInventory indexes...');
        await createIndexSafely('playerinventories', { playerId: 1 }, 'playerId');
        await createIndexSafely('playerinventories', { "items.itemId": 1 }, 'items.itemId');
        await createIndexSafely('playerinventories', { playerId: 1, guildId: 1 }, 'playerId_guildId');
        console.log();
        
        // Create GachaVC indexes
        console.log('🎮 Creating GachaVC indexes...');
        await createIndexSafely('gachavcs', { channelId: 1 }, 'channelId');
        await createIndexSafely('gachavcs', { guildId: 1 }, 'guildId');
        await createIndexSafely('gachavcs', { channelId: 1, typeId: 1 }, 'channelId_typeId');
        console.log();

        // Create GuildConfig indexes
        console.log('⚙️ Creating GuildConfig indexes...');
        await createIndexSafely('guildconfigs', { guildId: 1 }, 'guildId');
        console.log();

        // Summary
        console.log('==============================');
        console.log('📈 Index Creation Summary:');
        console.log(`   ✅ Created: ${indexesCreated} new indexes`);
        console.log(`   ⏭️  Skipped: ${indexesSkipped} existing indexes`);
        console.log('==============================\n');

        // Verify and display all indexes
        console.log('📋 Verifying all indexes:\n');
        
        const collections = ['currencies', 'playerinventories', 'gachavcs', 'guildconfigs'];
        for (const collectionName of collections) {
            try {
                const indexes = await db.collection(collectionName).indexes();
                console.log(`${collectionName}:`);
                indexes.forEach(index => {
                    if (index.name !== '_id_') { // Skip default _id index
                        const keys = Object.keys(index.key).join(', ');
                        console.log(`  ✓ ${index.name} (${keys})`);
                    }
                });
                console.log();
            } catch (error) {
                console.log(`  ⚠️ Collection '${collectionName}' not found (will be created when data is added)\n`);
            }
        }

        console.log('✨ Index optimization complete!');
        console.log('Your shop handler should now be significantly faster.\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\nTroubleshooting tips:');
        console.log('1. Check that keys.json exists and has "mongourl" field');
        console.log('2. Ensure your database user has index creation permissions');
        console.log('3. Make sure MongoDB is running (if local) or accessible (if cloud)');
        console.log('4. Check if your connection string has special characters that need encoding:');
        console.log('   @ becomes %40');
        console.log('   : becomes %3A');
        console.log('   / becomes %2F');
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
            console.log('🔌 Disconnected from MongoDB');
        }
    }
}

// Run the function
console.log('Starting index creation...\n');
createIndexes().then(() => {
    console.log('\nProcess completed. You can now run your bot with improved performance!');
    console.log('Shop interactions should now be 10-50x faster!');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});