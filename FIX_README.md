# Fix for MongoDB Duplicate Key Error in TAMBOT 2.0

## Problem
The bot was experiencing a MongoDB duplicate key error when trying to track user statistics:
```
MongoServerError: E11000 duplicate key error collection: tam2.userstats index: userId_1 dup key: { userId: "865147754358767627" }
```

This occurred because the `UserStats` collection had a unique index on `userId` alone, but the bot needs to track stats per user **per guild** (server). This means the same user can have different stats in different Discord servers.

## Solution Applied

### 1. **Schema Changes** (`models/statsSchema.js`)
- Removed `unique: true` from `userId` field in UserStats schema
- Added a compound unique index on `userId + guildId` combination
- Fixed DailyStats index to be `userId + guildId + date` instead of just `userId + date`

### 2. **Stat Tracking Updates** (`patterns/statTracking.js`)
- Added `$setOnInsert` operations to all `findOneAndUpdate` calls to properly set fields only on document creation
- Ensured all queries consistently use both `userId` and `guildId` as the compound key
- This prevents trying to insert duplicate documents when updating

### 3. **Migration Script** (`fix-stats-index.js`)
- Created a migration script to update existing database indexes
- Drops old problematic indexes
- Creates new compound indexes
- Cleans up any existing duplicate documents

## How to Apply the Fix

1. **Stop your bot** to prevent any new database operations during migration

2. **Run the migration script**:
   ```bash
   node fix-stats-index.js
   ```
   
   This will:
   - Connect to your MongoDB database
   - Drop the old unique index on `userId`
   - Create a new compound unique index on `userId + guildId`
   - Fix the DailyStats indexes as well
   - Clean up any duplicate documents if they exist

3. **Restart your bot** - The new code will now properly handle users across multiple guilds

## What Changed

### Before:
- UserStats had unique constraint on `userId` only
- Same user couldn't have stats in multiple servers
- Caused duplicate key errors when user joined second server

### After:
- UserStats has compound unique constraint on `userId + guildId`
- Same user can have separate stats in each server
- Proper use of `$setOnInsert` prevents duplicate key errors

## Testing

After applying the fix, test by:
1. Having a user join a voice channel in Server A
2. Having the same user join a voice channel in Server B
3. Both should work without errors

## Additional Notes

- The migration script backs up nothing - consider backing up your database before running it
- The script will show you what indexes exist before and after the migration
- If you see any "duplicate combinations found" messages, the script will automatically clean them up
- The fix maintains all existing functionality while solving the multi-guild tracking issue
