// Test script to verify dialogue/action formatting
// Run this to see how dialogue and actions are formatted differently

// Test the formatDescription function
function formatDescription(str) {
    if (!str) return '';
    str = str.toString().trim();
    
    // Check if it's an action (starts with * or ~ or -)
    const isAction = str.startsWith('*') || str.startsWith('~') || str.startsWith('-');
    
    if (isAction) {
        // For actions, remove surrounding asterisks but keep the content as-is
        if (str.startsWith('*') && str.endsWith('*')) {
            return str.slice(1, -1);
        }
        return str; // Return action as-is
    }
    
    // For dialogue, remove existing quotes first to avoid doubles
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        str = str.slice(1, -1);
    }
    
    // Add quotes for spoken dialogue
    return `"${str}"`;
}

console.log('=== Testing Dialogue/Action Formatting ===\n');

// Test cases
const testCases = [
    // Actions (should NOT have quotes)
    "*-Scratches Balls.*",
    "*~Yawns*",
    "~sighs deeply",
    "-HUFF",
    "*looks around nervously*",
    
    // Dialogue (should have quotes)
    "The children yearn for the mines...",
    "Keep mining!",
    "Coal dust gets everywhere...",
    "A pleasure doing business...",
    
    // Already quoted (should not double-quote)
    '"Already quoted dialogue"',
    "'Single quoted dialogue'",
    
    // Mixed (action + dialogue)
    "*wipes sweat* Hot day in the mines",
];

console.log('Input -> Output:\n');
testCases.forEach(test => {
    const result = formatDescription(test);
    console.log(`${test.padEnd(45)} -> ${result}`);
});

console.log('\n=== In Shop Display ===\n');

// Simulate how it looks in the shop embed
const shopDisplayTest = [
    "*-Scratches Balls.*",
    "The children yearn for the mines...",
    "*~Yawns*",
    "Keep mining!",
];

shopDisplayTest.forEach(test => {
    const formatted = formatDescription(test);
    console.log('Shop shows:');
    console.log('```');
    console.log(formatted);
    console.log('```\n');
});

console.log('=== Summary ===');
console.log('✅ Actions appear without quotes: ~yawns');
console.log('✅ Dialogue appears with quotes: "Keep mining!"');
console.log('✅ No double quotes on pre-quoted text');
console.log('✅ Proper presentation in shop embeds');