// Testing configuration override for unique item drops
// Toggle TESTING_MODE to enable/disable increased drop rates

const TESTING_MODE = true; // Set to false for production

// Testing configuration
const TEST_CONFIG = {
    // Your Discord user ID for testing (replace with your actual ID)
    TEST_USER_ID: 'YOUR_DISCORD_ID_HERE',
    TEST_USER_TAG: 'YourName#1234',
    
    // Multipliers for testing
    DROP_CHANCE_MULTIPLIER: 100,    // Multiply all drop chances by this
    UNIQUE_WEIGHT_MULTIPLIER: 50,   // Multiply unique item weights by this
    FORCE_UNIQUE_ROLLS: true,        // Always roll for unique instead of regular
    
    // Override specific probabilities
    OVERRIDE_BASE_FIND_CHANCE: 0.8,  // 80% chance to find something
    OVERRIDE_UNIQUE_CHANCE: 0.9,     // 90% chance for unique vs regular
    
    // Debug logging
    LOG_ALL_ROLLS: true,
    LOG_DETAILED_WEIGHTS: true
};

// Function to apply testing overrides to drop weights
function applyTestingOverrides(weights) {
    if (!TESTING_MODE) return weights;
    
    return weights.map(w => ({
        ...w,
        weight: w.weight * TEST_CONFIG.UNIQUE_WEIGHT_MULTIPLIER
    }));
}

// Function to check if user is in test mode
function isTestUser(userId, userTag) {
    if (!TESTING_MODE) return false;
    
    return userId === TEST_CONFIG.TEST_USER_ID || 
           userTag === TEST_CONFIG.TEST_USER_TAG;
}

// Function to override find chance for testing
function getTestingFindChance(originalChance, userId, userTag) {
    if (!TESTING_MODE) return originalChance;
    
    if (isTestUser(userId, userTag)) {
        if (TEST_CONFIG.LOG_ALL_ROLLS) {
            console.log(`[TEST MODE] Overriding find chance from ${originalChance} to ${TEST_CONFIG.OVERRIDE_BASE_FIND_CHANCE}`);
        }
        return TEST_CONFIG.OVERRIDE_BASE_FIND_CHANCE;
    }
    
    return originalChance * TEST_CONFIG.DROP_CHANCE_MULTIPLIER;
}

// Function to override unique vs regular roll
function shouldRollUnique(originalChance, userId, userTag) {
    if (!TESTING_MODE) return Math.random() < originalChance;
    
    if (isTestUser(userId, userTag)) {
        if (TEST_CONFIG.FORCE_UNIQUE_ROLLS) {
            if (TEST_CONFIG.LOG_ALL_ROLLS) {
                console.log('[TEST MODE] Forcing unique item roll');
            }
            return true;
        }
        return Math.random() < TEST_CONFIG.OVERRIDE_UNIQUE_CHANCE;
    }
    
    return Math.random() < (originalChance * TEST_CONFIG.DROP_CHANCE_MULTIPLIER);
}

// Function to log testing information
function logTestRoll(type, result, userId, userTag) {
    if (!TESTING_MODE || !TEST_CONFIG.LOG_ALL_ROLLS) return;
    
    const timestamp = new Date().toISOString();
    const userInfo = isTestUser(userId, userTag) ? ' [TEST USER]' : '';
    
    console.log(`[${timestamp}]${userInfo} Roll type: ${type}, Result: ${result ? result.item?.name || result : 'Nothing'}`);
}

// Export individual items you can import and use
module.exports = {
    TESTING_MODE,
    TEST_CONFIG,
    applyTestingOverrides,
    isTestUser,
    getTestingFindChance,
    shouldRollUnique,
    logTestRoll,
    
    // Quick toggle functions
    enableTestMode: () => {
        module.exports.TESTING_MODE = true;
        console.log('🧪 Testing mode ENABLED - Drop rates increased!');
    },
    
    disableTestMode: () => {
        module.exports.TESTING_MODE = false;
        console.log('📦 Testing mode DISABLED - Normal drop rates restored');
    },
    
    // Preset testing configurations
    presets: {
        // Maximum drop rates for testing
        maximum: {
            DROP_CHANCE_MULTIPLIER: 1000,
            UNIQUE_WEIGHT_MULTIPLIER: 1000,
            OVERRIDE_BASE_FIND_CHANCE: 1.0,
            OVERRIDE_UNIQUE_CHANCE: 1.0,
            FORCE_UNIQUE_ROLLS: true
        },
        
        // Moderate increase for realistic testing
        moderate: {
            DROP_CHANCE_MULTIPLIER: 10,
            UNIQUE_WEIGHT_MULTIPLIER: 10,
            OVERRIDE_BASE_FIND_CHANCE: 0.3,
            OVERRIDE_UNIQUE_CHANCE: 0.5,
            FORCE_UNIQUE_ROLLS: false
        },
        
        // Slight increase for production-like testing
        slight: {
            DROP_CHANCE_MULTIPLIER: 2,
            UNIQUE_WEIGHT_MULTIPLIER: 2,
            OVERRIDE_BASE_FIND_CHANCE: 0.1,
            OVERRIDE_UNIQUE_CHANCE: 0.2,
            FORCE_UNIQUE_ROLLS: false
        }
    },
    
    // Apply a preset configuration
    applyPreset: (presetName) => {
        const preset = module.exports.presets[presetName];
        if (!preset) {
            console.error(`❌ Preset '${presetName}' not found. Available: maximum, moderate, slight`);
            return;
        }
        
        Object.assign(TEST_CONFIG, preset);
        console.log(`✅ Applied '${presetName}' testing preset`);
    }
};

// Auto-apply testing overrides if in test mode
if (TESTING_MODE) {
    console.log('=' .repeat(50));
    console.log('🧪 UNIQUE ITEM TESTING MODE ACTIVE 🧪');
    console.log('Drop rates are artificially increased!');
    console.log('Remember to set TESTING_MODE = false before production!');
    console.log('=' .repeat(50));
}
