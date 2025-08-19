const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const emptyvccheck = require('./emptyVoiceCheck');
const GuildConfig = require('../models/GuildConfig');

// Load gacha server data
const gachaServersPath = path.join(__dirname, '../data/gachaServers.json');
const gachaServers = JSON.parse(fs.readFileSync(gachaServersPath, 'utf8'));

// Locks to prevent overlapping executions per VC
const vcLocks = new Set();

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

        // begin vc check cycle
        const activeVCs = await ActiveVCS.find(); // Fetch live DB entries

        console.log('1');

        for (const vc of activeVCs) {
            const nextTrigger = vc.nextTrigger ? new Date(vc.nextTrigger).getTime() : 0;

            // Skip if not time yet
            if (vc.nextTrigger && now < nextTrigger) continue;

            // Skip if VC is already running something
            if (vcLocks.has(vc.channelId)) {
                console.log(`Skipping VC ${vc.channelId}, still running previous cycle`);
                continue;
            }

            // Find corresponding gacha server data
            const serverData = gachaServers.find(s => s.id === vc.typeId);
            if (!serverData) continue;

            try {
                vcLocks.add(vc.channelId); // Lock this VC

                const scriptPath = path.join(__dirname, './gachaModes', serverData.script);
                const gameScript = require(scriptPath);

                const gachaVC = await guild.channels.fetch(vc.channelId).catch(() => null);
                if (!gachaVC) continue;

                console.log('running gameVC script');

                const now = Date.now();
                vc.nextTrigger = new Date(now + 15 * 1000);
                await vc.save();

                await gameScript(gachaVC, vc, serverData);

                console.log(`Triggered ${serverData.name} for VC ${vc.channelId}`);
            } catch (err) {
                console.error(`Error running script for VC ${vc.channelId}:`, err);
            } finally {
                vcLocks.delete(vc.channelId); // Always unlock
            }
        }
    }, 5 * 1000); // Check every 5 seconds
};
