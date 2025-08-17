const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const emptyvccheck = require('./emptyVoiceCheck');
const GuildConfig = require('../models/GuildConfig');

// Load gacha server data
const gachaServersPath = path.join(__dirname, '../data/gachaServers.json');
const gachaServers = JSON.parse(fs.readFileSync(gachaServersPath, 'utf8'));

module.exports = async (guild) => {

    // --- INITIAL CLEANUP ---
    const channels = await guild.channels.fetch();
    const activeVCs = await ActiveVCS.find().lean();
    const activeVCIds = new Set(activeVCs.map(vc => vc.channelId));

    channels.forEach(channel => {
        if (activeVCIds.has(channel.id)) {
            console.log(`Found active VC in DB: ${channel.name} (${channel.id})`);
            emptyvccheck(channel);
        }
    });

    // --- INTERVAL CHECK ---
    setInterval(async () => {


        const now = Date.now();

        // global Shop price shift KEY change update.
        const guildDb = await GuildConfig.findOne({guildId: guild.id});
        if (now > guildDb.updatedAt) {
            const msToAdd = 1000 * 60 * 60; // add 60 minutes

            await GuildConfig.updateOne(
            { guildId: guild.id },
            { $set: { updatedAt: new Date(guildDb.updatedAt.getTime() + msToAdd) } }
            );
        }

        // // begin vc check cycle.

        const activeVCs = await ActiveVCS.find(); // Fetch live DB entries


        for (const vc of activeVCs) {
            const nextTrigger = vc.nextTrigger ? new Date(vc.nextTrigger).getTime() : 0;

            // Trigger if current time has passed nextTrigger
            if (!vc.nextTrigger || now >= nextTrigger) {

                // Find corresponding gacha server data
                const serverData = gachaServers.find(s => s.id === vc.typeId);
                if (!serverData) continue;

                try {
                // Load and run the script
                const scriptPath = path.join(__dirname, './gachaModes', serverData.script);
                const gameScript = require(scriptPath);

                // Fetch the channel globally via client, not just the guild
                const gachaVC = await guild.channels.fetch(vc.channelId).catch(() => null);
                if (!gachaVC) {
                    // console.warn(`VC ${vc.channelId} not found or not accessible`);
                    continue;
                }

                console.log('running gameVC script');

                const now = Date.now();
                vc.nextTrigger = new Date((now + 30 * 1000 * Math.random()) + 5000);
                await vc.save();

                await gameScript(gachaVC, vc, serverData);

                console.log(`Triggered ${serverData.name} for VC ${vc.channelId}`);
            } catch (err) {
                console.error(`Error running script for VC ${vc.channelId}:`, err);
            }
            }
        }

    }, 5 * 1000); // Check every 30 seconds
};
