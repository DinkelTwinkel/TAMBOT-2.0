// Required npm packages for the stat tracking system
// Add these to your package.json dependencies or install them:

/*
Run these commands in your terminal:

npm install mongoose
npm install discord.js

Or add to your package.json dependencies:

"dependencies": {
    "discord.js": "^14.14.1",
    "mongoose": "^8.0.0",
    "dotenv": "^16.3.1"
}

Environment variables to add to your .env file:

MONGODB_URI=mongodb://localhost:27017/tambot
# Or if using MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/tambot?retryWrites=true&w=majority

DISCORD_TOKEN=your_bot_token_here

*/

// Quick setup guide:

/*
1. Install dependencies:
   npm install mongoose discord.js dotenv

2. Set up MongoDB:
   - Option A: Install MongoDB locally (https://www.mongodb.com/docs/manual/installation/)
   - Option B: Use MongoDB Atlas free tier (https://www.mongodb.com/cloud/atlas)

3. Add MongoDB URI to your .env file

4. In your main index.js, import and initialize the tracker:
   const StatTracker = require('./patterns/statTracking');
   const tracker = new StatTracker(process.env.MONGODB_URI);

5. Connect to database when bot is ready:
   client.once('ready', async () => {
       await tracker.connect();
   });

6. Add the event listeners from statTrackingExample.js

7. For easy data access, use the StatsUtility:
   const StatsUtility = require('./statsUtility');
   const stats = new StatsUtility(process.env.MONGODB_URI);

   // Then you can easily get any stats:
   const totalJoins = await stats.getTotalVCJoins(guildId);
   const userHours = await stats.getEachUserHoursInVC(guildId);
   // etc.

*/

// MongoDB connection options for production:
const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4, // Use IPv4
    maxPoolSize: 10,
    minPoolSize: 2,
    retryWrites: true,
    w: 'majority'
};

// Example connection with error handling:
const mongoose = require('mongoose');

async function connectToMongoDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
        console.log('✅ Connected to MongoDB');
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconnected');
        });
        
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        // Retry connection after 5 seconds
        setTimeout(connectToMongoDB, 5000);
    }
}

module.exports = { connectToMongoDB, mongooseOptions };
