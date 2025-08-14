
const ActiveVCS =  require ('../models/activevcs');
const emptyvccheck = require ('./emptyVoiceCheck');

module.exports = async (guild) => {

    // first this code will perform a check across all channels and delete left over or empty channels upon first being run.
    // then it will start a interval timer to check every active channel, read the type it is and run the relevant game event code. This will happen every 5mins.
    // It will then store it all on a mongodb database as a event stack. / The event stack will have events and the right utc time to run them. another section of this code will be checking every 10 seconds for all the events it needs to run. and executing.

    const channels = await guild.channels.fetch();

    // Get all active VC entries from the database
    const activeVCs = await ActiveVCS.find().lean();

    // Create a Set for quick channelId lookups
    const activeVCIds = new Set(activeVCs.map(vc => vc.channelid));

    // Iterate through all channels in the guild
    channels.forEach(channel => {
        // Check if it's in the database and still exists
        if (activeVCIds.has(channel.id)) {
            console.log(`Found active VC in DB: ${channel.name} (${channel.id})`);
            
            // Run your empty VC check function
            emptyvccheck(channel);
        }
    });

    /////////////////////// ABOVE ^ is my clean up code... ///////////////



};