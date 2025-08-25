/**
 * Migration script to fix the duplicate key errors in UserStats and DailyStats collections
 * This script:
 * 1. Drops the old unique index on userId in UserStats and creates a compound unique index on userId + guildId
 * 2. Drops the old compound index on userId + date in DailyStats and creates a new one on userId + guildId + date
 */

const mongoose = require('mongoose');
const { UserStats } = require('./models/statsSchema');

async function fixIndexes() {
    try {
        // Connect to MongoDB (update this with your connection string if needed)
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tam2';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Fix UserStats collection
        console.log('\n=== FIXING USERSTATS COLLECTION ===');
        await fixUserStatsIndexes();

        // Fix DailyStats collection
        console.log('\n=== FIXING DAILYSTATS COLLECTION ===');
        await fixDailyStatsIndexes();

        console.log('\n✅ All index migrations completed successfully!');
        console.log('You can now restart your bot.');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

async function fixUserStatsIndexes() {
    try {
        const collection = mongoose.connection.collection('userstats');

        // List existing indexes
        console.log('\n📋 Current indexes:');
        const currentIndexes = await collection.indexes();
        console.log(JSON.stringify(currentIndexes, null, 2));

        // Drop the old unique index on userId if it exists
        try {
            await collection.dropIndex('userId_1');
            console.log('\n✅ Dropped old unique index on userId');
        } catch (error) {
            if (error.codeName === 'IndexNotFound') {
                console.log('\n⚠️ Old unique index on userId not found (already removed)');
            } else {
                console.error('❌ Error dropping index:', error);
            }
        }

        // Create the new compound unique index
        try {
            await collection.createIndex(
                { userId: 1, guildId: 1 }, 
                { unique: true }
            );
            console.log('✅ Created new compound unique index on userId + guildId');
        } catch (error) {
            if (error.code === 11000 || error.code === 85) {
                console.log('⚠️ Compound index already exists');
            } else {
                throw error;
            }
        }

        // List final indexes
        console.log('\n📋 Final indexes:');
        const finalIndexes = await collection.indexes();
        console.log(JSON.stringify(finalIndexes, null, 2));

        // Check for duplicate userId+guildId combinations
        console.log('\n🔍 Checking for duplicate userId+guildId combinations...');
        const duplicates = await collection.aggregate([
            {
                $group: {
                    _id: { userId: '$userId', guildId: '$guildId' },
                    count: { $sum: 1 },
                    ids: { $push: '$_id' }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ]).toArray();

        if (duplicates.length > 0) {
            console.log(`\n⚠️ Found ${duplicates.length} duplicate userId+guildId combinations:`);
            for (const dup of duplicates) {
                console.log(`  - userId: ${dup._id.userId}, guildId: ${dup._id.guildId}, count: ${dup.count}`);
                
                // Keep the first document, remove the rest
                const idsToRemove = dup.ids.slice(1);
                if (idsToRemove.length > 0) {
                    await collection.deleteMany({ _id: { $in: idsToRemove } });
                    console.log(`    Removed ${idsToRemove.length} duplicate documents`);
                }
            }
        } else {
            console.log('✅ No duplicate userId+guildId combinations found');
        }

    } catch (error) {
        throw error;
    }
}

async function fixDailyStatsIndexes() {
    try {
        const collection = mongoose.connection.collection('dailystats');

        // List existing indexes
        console.log('\n📋 Current indexes:');
        const currentIndexes = await collection.indexes();
        console.log(JSON.stringify(currentIndexes, null, 2));

        // Drop the old compound index on userId + date if it exists
        try {
            await collection.dropIndex('userId_1_date_1');
            console.log('\n✅ Dropped old compound index on userId + date');
        } catch (error) {
            if (error.codeName === 'IndexNotFound') {
                console.log('\n⚠️ Old compound index on userId + date not found (already removed)');
            } else {
                console.error('❌ Error dropping index:', error);
            }
        }

        // Create the new compound unique index
        try {
            await collection.createIndex(
                { userId: 1, guildId: 1, date: 1 }, 
                { unique: true }
            );
            console.log('✅ Created new compound unique index on userId + guildId + date');
        } catch (error) {
            if (error.code === 11000 || error.code === 85) {
                console.log('⚠️ Compound index already exists');
            } else {
                throw error;
            }
        }

        // List final indexes
        console.log('\n📋 Final indexes:');
        const finalIndexes = await collection.indexes();
        console.log(JSON.stringify(finalIndexes, null, 2));

        // Check for duplicate userId+guildId+date combinations
        console.log('\n🔍 Checking for duplicate userId+guildId+date combinations...');
        const duplicates = await collection.aggregate([
            {
                $group: {
                    _id: { userId: '$userId', guildId: '$guildId', date: '$date' },
                    count: { $sum: 1 },
                    ids: { $push: '$_id' }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ]).toArray();

        if (duplicates.length > 0) {
            console.log(`\n⚠️ Found ${duplicates.length} duplicate userId+guildId+date combinations:`);
            for (const dup of duplicates) {
                console.log(`  - userId: ${dup._id.userId}, guildId: ${dup._id.guildId}, date: ${dup._id.date}, count: ${dup.count}`);
                
                // Keep the first document, remove the rest
                const idsToRemove = dup.ids.slice(1);
                if (idsToRemove.length > 0) {
                    await collection.deleteMany({ _id: { $in: idsToRemove } });
                    console.log(`    Removed ${idsToRemove.length} duplicate documents`);
                }
            }
        } else {
            console.log('✅ No duplicate userId+guildId+date combinations found');
        }

    } catch (error) {
        throw error;
    }
}

// Run the migration
console.log('🚀 Starting UserStats index migration...\n');
fixIndexes().catch(console.error);
