
const ActiveVCS =  require ('../models/activevcs');

module.exports = async (channel) => {

        try {
            // Look up the VC in MongoDB
            const vcRecord = await ActiveVCS.findOne({ channelid: channel.id});

            if (vcRecord) {

                if (channel && channel.members.size === 0) {
                    console.log(`Deleting empty tracked VC: ${channel.name}`);

                    // Delete from Discord
                    await channel.delete('Empty gacha VC, removing');

                    // Mark inactive or remove from DB
                    await ActiveVCS.deleteOne({ channelid: channel.id});
                }
            }
        } catch (err) {
            console.error('Error checking/deleting VC:', err);
        }

};
