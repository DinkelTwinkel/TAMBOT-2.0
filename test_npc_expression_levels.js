// Test script for NPC expression level calculation
// This tests the expression level system for various price ratios

// Mock the calculateExpressionLevel function from NPCSalesSystem
function calculateExpressionLevel(priceRatio) {
    if (priceRatio <= 0.1) return 1; // Nearly free - minimal reaction
    if (priceRatio <= 0.3) return 2; // Very cheap - slight surprise
    if (priceRatio <= 0.5) return 3; // Good deal - pleased
    if (priceRatio <= 0.7) return 4; // Fair price - satisfied
    if (priceRatio <= 0.9) return 5; // Slightly overpriced - neutral
    if (priceRatio <= 1.1) return 6; // Market price - normal
    if (priceRatio <= 1.5) return 7; // Overpriced - concerned
    if (priceRatio <= 2.0) return 8; // Very overpriced - frustrated
    if (priceRatio <= 5.0) return 9; // Extremely overpriced - angry
    return 10; // Absurdly overpriced (10000%+) - outraged
}

// Test cases with various price ratios
const testCases = [
    { ratio: 0.05, description: "Nearly free (5% of market value)" },
    { ratio: 0.2, description: "Very cheap (20% of market value)" },
    { ratio: 0.4, description: "Good deal (40% of market value)" },
    { ratio: 0.6, description: "Fair price (60% of market value)" },
    { ratio: 0.8, description: "Slightly overpriced (80% of market value)" },
    { ratio: 1.0, description: "Market price (100% of market value)" },
    { ratio: 1.2, description: "Overpriced (120% of market value)" },
    { ratio: 1.8, description: "Very overpriced (180% of market value)" },
    { ratio: 3.0, description: "Extremely overpriced (300% of market value)" },
    { ratio: 10.0, description: "Absurdly overpriced (1000% of market value)" },
    { ratio: 100.0, description: "Insanely overpriced (10000% of market value)" }
];

console.log("🧪 Testing NPC Expression Level Calculation System");
console.log("=" .repeat(60));

testCases.forEach(testCase => {
    const expressionLevel = calculateExpressionLevel(testCase.ratio);
    const percentage = (testCase.ratio * 100).toFixed(1);
    
    let emotionalTone = '';
    if (expressionLevel <= 2) emotionalTone = 'Minimal reaction';
    else if (expressionLevel <= 4) emotionalTone = 'Pleased/Satisfied';
    else if (expressionLevel <= 6) emotionalTone = 'Neutral/Business-like';
    else if (expressionLevel <= 8) emotionalTone = 'Concerned/Frustrated';
    else if (expressionLevel <= 9) emotionalTone = 'Angry';
    else emotionalTone = 'Outraged';
    
    console.log(`📊 ${testCase.description}`);
    console.log(`   Price Ratio: ${percentage}% | Expression Level: ${expressionLevel}/10 | Tone: ${emotionalTone}`);
    console.log();
});

console.log("✅ Expression level calculation test completed!");
console.log("\n📝 Summary:");
console.log("- Levels 1-2: Minimal reaction (very cheap items)");
console.log("- Levels 3-4: Pleased/Satisfied (good deals)");
console.log("- Levels 5-6: Neutral/Business-like (fair prices)");
console.log("- Levels 7-8: Concerned/Frustrated (overpriced)");
console.log("- Levels 9-10: Angry/Outraged (extremely overpriced)");
