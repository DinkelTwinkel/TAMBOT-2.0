module.exports = async (channel, dbEntry, jsonEntry) => {
    const now = Date.now(); // current timestamp in milliseconds

    // Set nextTrigger to 60 seconds from now
    dbEntry.nextTrigger = new Date(now + 60 * 1000);
    await dbEntry.save();

    // Send the event message
    if (channel && channel.isTextBased()) {
        channel.send('MINING EVENT!');
    }

    
};
