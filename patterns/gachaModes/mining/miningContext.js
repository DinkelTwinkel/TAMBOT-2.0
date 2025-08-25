// Global context for mining session
// This helps pass the mineTypeId to all functions that need it without modifying every function signature

let currentMiningContext = {
    mineTypeId: null,
    channelId: null,
    serverPowerLevel: 1
};

/**
 * Set the current mining context
 * Call this at the start of each mining cycle
 */
function setMiningContext(mineTypeId, channelId, serverPowerLevel = 1) {
    currentMiningContext = {
        mineTypeId,
        channelId,
        serverPowerLevel
    };
    console.log(`[MINING CONTEXT] Set context for channel ${channelId}: mine type ${mineTypeId}, power level ${serverPowerLevel}`);
}

/**
 * Get the current mining context
 */
function getMiningContext() {
    return currentMiningContext;
}

/**
 * Clear the mining context (call at end of processing)
 */
function clearMiningContext() {
    currentMiningContext = {
        mineTypeId: null,
        channelId: null,
        serverPowerLevel: 1
    };
}

module.exports = {
    setMiningContext,
    getMiningContext,
    clearMiningContext
};
