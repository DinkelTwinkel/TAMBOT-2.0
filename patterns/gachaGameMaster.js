const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const emptyvccheck = require('./emptyVoiceCheck');

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

        const activeVCs = await ActiveVCS.find(); // Fetch live DB entries
        const now = Date.now();

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

                    const gachaVC = await guild.channels.fetch(vc.channelId);
                    console.log('running gameVC script');
                    await gameScript(gachaVC, vc, serverData);

                    // let gameScript set next trigger time.

                    console.log(`Triggered ${serverData.name} for VC ${vc.channelId}`);
                } catch (err) {
                    console.error(`Error running script for VC ${vc.channelId}:`, err);
                }
            }
        }

    }, 5 * 1000); // Check every 5 seconds
};
