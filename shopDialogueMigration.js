// shopDialogueMigration.js
// Helper script to show how to integrate the pool into your shop dialogue generator

const fs = require('fs').promises;
const path = require('path');

// Template for updating shop dialogue methods
const integrationTemplates = {
    generateIdleDialogue: `
async generateIdleDialogue(shop, options = {}) {
    const shopkeeper = shop.shopkeeper;
    if (!shopkeeper) {
        return shop.idleDialogue?.[Math.floor(Math.random() * shop.idleDialogue.length)] || "Welcome to my shop!";
    }
    
    // Load active VCs if needed
    if (options.guildId) {
        await this.loadActiveVCs(options.guildId);
    }
    
    // Create context for pooling
    const shopType = this.getShopType(shop);
    const mood = options.mood || this.getShopkeeperMood(shop);
    const contextKey = \`idle-\${shopType}-\${mood}\`;
    const contextData = {
        shopkeeper: shopkeeper.name,
        shopType: shopType,
        mood: mood,
        priceStatus: options.shopContext?.overallPriceStatus || 'normal'
    };
    
    // Use unified pool
    const dialogue = await UnifiedDialoguePool.getDialogue(
        'shop',
        'idle',
        contextKey,
        async () => {
            // YOUR EXISTING AI GENERATION CODE HERE
            if (!this.isAvailable()) return null;
            return await this.generateIdleWithAI(shop, shopkeeper, options);
        },
        contextData
    );
    
    if (dialogue) return this.truncateDialogue(dialogue);
    
    // Fallback
    if (shop.idleDialogue && shop.idleDialogue.length > 0) {
        return shop.idleDialogue[Math.floor(Math.random() * shop.idleDialogue.length)];
    }
    return "Welcome to my shop, traveler!";
}`,

    generatePurchaseDialogue: `
async generatePurchaseDialogue(shop, item, price, buyer = {}, quantity = 1, playerContext = null) {
    const shopkeeper = shop.shopkeeper;
    if (!shopkeeper) {
        return shop.successBuy?.[0] || "A pleasure doing business!";
    }
    
    // Create context for pooling
    const shopType = this.getShopType(shop);
    const wealthTier = playerContext?.wealthTier || 'normal';
    const contextKey = \`purchase-\${shopType}-\${wealthTier}\`;
    const contextData = {
        shopkeeper: shopkeeper.name,
        shopType: shopType,
        quantity: quantity > 5 ? 'bulk' : quantity === 1 ? 'single' : 'moderate',
        wealthTier: wealthTier
    };
    
    // Use unified pool
    const dialogue = await UnifiedDialoguePool.getDialogue(
        'shop',
        'purchase',
        contextKey,
        async () => {
            // YOUR EXISTING AI GENERATION CODE HERE
            if (!this.isAvailable()) return null;
            return await this.generatePurchaseWithAI(shop, shopkeeper, item, price, buyer, quantity, playerContext);
        },
        contextData
    );
    
    if (dialogue) return this.truncateDialogue(dialogue);
    return shop.successBuy?.[0] || "A pleasure doing business!";
}`,

    generateSellDialogue: `
async generateSellDialogue(shop, item, price, quantity = 1, playerContext = null, seller = null) {
    const shopkeeper = shop.shopkeeper;
    if (!shopkeeper) {
        return shop.successSell?.[0] || "I'll take that off your hands.";
    }
    
    // Create context for pooling
    const shopType = this.getShopType(shop);
    const wealthTier = playerContext?.wealthTier || 'normal';
    const contextKey = \`sell-\${shopType}-\${wealthTier}\`;
    const contextData = {
        shopkeeper: shopkeeper.name,
        shopType: shopType,
        quantity: quantity > 5 ? 'bulk' : 'single',
        wealthTier: wealthTier
    };
    
    // Use unified pool
    const dialogue = await UnifiedDialoguePool.getDialogue(
        'shop',
        'sell',
        contextKey,
        async () => {
            // YOUR EXISTING AI GENERATION CODE HERE
            if (!this.isAvailable()) return null;
            return await this.generateSellWithAI(shop, shopkeeper, item, price, quantity, playerContext, seller);
        },
        contextData
    );
    
    if (dialogue) return this.truncateDialogue(dialogue);
    return shop.successSell?.[0] || "I'll take that off your hands.";
}`,

    generatePoorDialogue: `
async generatePoorDialogue(shop, item = null, shortBy = 0) {
    const shopkeeper = shop.shopkeeper;
    if (!shopkeeper) {
        return shop.failureTooPoor?.[0] || "You need more coins!";
    }
    
    // Create context for pooling
    const shopType = this.getShopType(shop);
    const contextKey = \`poor-\${shopType}\`;
    const contextData = {
        shopkeeper: shopkeeper.name,
        shopType: shopType
    };
    
    // Use unified pool
    const dialogue = await UnifiedDialoguePool.getDialogue(
        'shop',
        'poor',
        contextKey,
        async () => {
            // YOUR EXISTING AI GENERATION CODE HERE
            if (!this.isAvailable()) return null;
            
            const prompt = \`You are \${shopkeeper.name}, proprietor of \${shop.name} in HELLUNGI.
            A customer cannot afford \${item ? item.name : 'an item'}\${shortBy > 0 ? \`, they're \${shortBy} coins short\` : ''}.
            Generate SHORT rejection. MAXIMUM 150 CHARACTERS.\`;
            
            return await this.generateWithAI(prompt);
        },
        contextData
    );
    
    if (dialogue) return this.truncateDialogue(dialogue);
    return shop.failureTooPoor?.[0] || "You need more coins!";
}`,

    generateNoItemDialogue: `
async generateNoItemDialogue(shop, item = null, quantity = 0, available = 0) {
    const shopkeeper = shop.shopkeeper;
    if (!shopkeeper) {
        if (available === 0) {
            return shop.failureOther?.[0] || "You don't seem to have that item.";
        }
        return shop.failureOther?.[0] || \`You only have \${available} of those.\`;
    }
    
    // Create context for pooling
    const contextKey = \`noitem-\${available === 0 ? 'none' : 'insufficient'}\`;
    const contextData = {
        shopkeeper: shopkeeper.name,
        shopType: this.getShopType(shop),
        available: available
    };
    
    // Use unified pool
    const dialogue = await UnifiedDialoguePool.getDialogue(
        'shop',
        'noItem',
        contextKey,
        async () => {
            // YOUR EXISTING AI GENERATION CODE HERE
            if (!this.isAvailable()) return null;
            
            const prompt = \`You are \${shopkeeper.name}, proprietor of \${shop.name}.
            A customer is trying to sell \${quantity} x \${item ? item.name : 'an item'} but they only have \${available}.
            Generate VERY SHORT response. MAXIMUM 200 CHARACTERS.\`;
            
            return await this.generateWithAI(prompt);
        },
        contextData
    );
    
    if (dialogue) return this.truncateDialogue(dialogue);
    
    if (available === 0) {
        return shop.failureOther?.[0] || "You don't seem to have that item.";
    }
    return shop.failureOther?.[0] || \`You only have \${available} of those.\`;
}`
};

// Helper function to add required imports
const requiredImports = `const UnifiedDialoguePool = require('./UnifiedDialoguePool');`;

// Helper method to add getShopType if it doesn't exist
const getShopTypeMethod = `
    /**
     * Get shop type from shop data
     */
    getShopType(shop) {
        const name = shop.name.toLowerCase();
        if (name.includes('coal')) return 'coal';
        if (name.includes('topaz')) return 'topaz';
        if (name.includes('diamond')) return 'diamond';
        if (name.includes('emerald')) return 'emerald';
        if (name.includes('ruby')) return 'ruby';
        if (name.includes('obsidian')) return 'obsidian';
        if (name.includes('mythril')) return 'mythril';
        if (name.includes('adamantite')) return 'adamantite';
        if (name.includes('copper')) return 'copper';
        if (name.includes('iron')) return 'iron';
        if (name.includes('crystal')) return 'crystal';
        if (name.includes('fossil')) return 'fossil';
        if (name.includes('inn') || name.includes('tavern')) return 'inn';
        if (name.includes('hunter') || name.includes('lodge')) return 'hunter';
        if (name.includes('noble')) return 'noble';
        return 'general';
    }`;

async function showMigrationGuide() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           SHOP DIALOGUE GENERATOR MIGRATION GUIDE              ║
╚════════════════════════════════════════════════════════════════╝

This guide will help you integrate the Unified Dialogue Pool into
your existing aiShopDialogueGenerator.js file.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: Add Import at the Top
──────────────────────────────
Add this line after your other require statements:

${requiredImports}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 2: Add Helper Method (if not exists)
──────────────────────────────────────────
Add this method to your class if you don't have it:
${getShopTypeMethod}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 3: Update Each Generation Method
──────────────────────────────────────
Replace your existing methods with the pool-integrated versions.
The key change is wrapping your AI generation in UnifiedDialoguePool.getDialogue()

Here are the updated methods:
`);
    
    for (const [methodName, template] of Object.entries(integrationTemplates)) {
        console.log(`\n📝 ${methodName}:`);
        console.log('─'.repeat(60));
        console.log(template);
        console.log();
    }
    
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 4: Initialize Pool in Constructor
────────────────────────────────────────
Add this to your constructor:

    constructor() {
        // ... existing code ...
        
        // Initialize the pool
        this.initializePool();
    }
    
    async initializePool() {
        await UnifiedDialoguePool.initialize();
        console.log('[ShopAI] Pool initialized');
    }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 5: Test Your Integration
──────────────────────────────
1. Save your changes
2. Run: node testUnifiedPool.js test
3. Start your bot and verify shops work correctly
4. Check pool growth: node testUnifiedPool.js analyze

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NOTES:
• The pool wraps your existing AI generation code
• Your existing code goes in the async function passed to getDialogue
• Fallbacks are handled automatically
• The pool decides when to generate new vs reuse existing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Need help? Check DIALOGUE_POOL_README.md for more details.
`);
}

async function createBackup() {
    const shopPath = path.join(__dirname, 'patterns', 'aiShopDialogueGenerator.js');
    const backupPath = path.join(__dirname, 'patterns', `aiShopDialogueGenerator.backup.${Date.now()}.js`);
    
    try {
        const content = await fs.readFile(shopPath, 'utf8');
        await fs.writeFile(backupPath, content);
        console.log(`✅ Backup created: ${backupPath}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to create backup:', error.message);
        return false;
    }
}

// Main execution
const command = process.argv[2];

switch (command) {
    case 'backup':
        createBackup().then(success => {
            if (success) {
                console.log('\nYou can now safely modify your shop dialogue generator.');
            }
        });
        break;
    
    case 'guide':
    default:
        showMigrationGuide();
        console.log(`
To create a backup of your current shop dialogue generator:
  node shopDialogueMigration.js backup
`);
        break;
}
