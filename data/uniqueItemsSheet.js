// data/uniqueItemsSheet.js
// Static data for all unique/legendary items
// Only one player can own each item at a time

const UNIQUE_ITEMS = [
    {
        id: 9, // Unique numerical ID
        name: "Blue Breeze",
        type: "tool",
        slot: "mining",
        rarity: "legendary",
        description: "A legendary pickaxe forged from crystallized wind essence. Its ethereal blue glow pulses with each swing, and the sound of gentle breeze follows its movements.",
        lore: "Crafted by the Sky Smiths of the floating city of Aetherium, this pickaxe was said to be blessed by the Wind Goddess herself. It cuts through stone as easily as air moves through fingers.",
        value: 50000,
        vendable: false, // Unique items cannot be sold
        
        // Abilities that affect player stats
        abilities: [
            { name: "mining", powerlevel: 30 },
            { name: "luck", powerlevel: 50 },
            { name: "speed", powerlevel: 10 }
        ],
        
        // Visual/Display properties
        image: "blue_breeze_legendary",
        glowColor: "#00BFFF", // Deep Sky Blue
        particleEffect: "wind_swirl",
        
        // Maintenance configuration
        maintenanceType: "coins", // Type of maintenance required
        maintenanceCost: 5000, // Cost per maintenance (for coins type)
        maintenanceDecayRate: 1, // How much maintenance decreases per day
        requiresMaintenance: true,
        maintenanceDescription: "The ethereal energies require regular infusion of wealth to maintain their connection to this plane.",
        
        // Special properties
        specialEffects: [
            "Chance to find double ore on lucky strikes",
            "Generates a protective wind barrier reducing hazard damage",
            "Creates updrafts that increase movement speed in mines"
        ],
        
        // Mysterious rumored effects shown to players
        rumoredEffects: [
            "Sometimes multiplies rewards beyond expectation",
            "Offers mysterious protection from the earth's wrath",
            "Hastens your movements through ancient winds"
        ],
        
        // Drop configuration
        dropWeight: 1, // Lower weight = rarer
        minPowerLevel: 3, // Minimum power level where this can drop
        preferredBiomes: ["windswept_peaks", "crystal_caverns"],
        
        // Item durability (different from maintenance)
        baseDurability: 500, // Much higher than normal items
        durabilityLossReduction: 0.5 // Takes 50% less durability damage
    },
    
    {
        id: 10,
        name: "Midas' Burden",
        type: "charm",
        slot: "charm",
        rarity: "legendary",
        description: "A golden weight that bears the curse of King Midas himself. Fortune's favor is as fickle as fate.",
        lore: "When King Midas begged the gods to remove his golden touch, they condensed his curse into this charm. It grants incredible luck to those wealthy enough to bear its weight, but the blessing is unstable - sometimes multiplying fortune a hundredfold, other times leaving the bearer with nothing. Only the richest soul in the realm can possess it, for poverty would shatter the charm instantly. Many have killed for it, only to lose it the moment their wealth diminished. The charm seems to mock its owners, reminding them that all gold is temporary, and even the mightiest fortune can vanish in an instant. Those who wear it report dreams of golden halls that crumble to dust, and wake to find their luck has either made them legends... or fools.",
        value: 500000,
        vendable: false,
        
        abilities: [
            { name: "luck", powerlevel: 50 }, // Base luck (will be multiplied)
            { name: "greed", powerlevel: 25 },
            { name: "curse", powerlevel: -10 } // Negative stat as drawback
        ],
        
        image: "midas_burden_legendary",
        glowColor: "#FFD700", // Gold
        particleEffect: "gold_dust",
        
        maintenanceType: "wealthiest",
        maintenanceCost: 1, // Not coins, but represents needing to be wealthiest
        maintenanceDecayRate: 3, // Loses 3 maintenance per cycle when not wealthiest (vanishes after ~3 cycles)
        requiresMaintenance: true,
        maintenanceDescription: "The burden only recognizes the wealthiest. When another surpasses your fortune, the charm begins to abandon you.",
        
        specialEffects: [
            "Luck randomly becomes either 0x or 100x on each calculation",
            "Can only be owned by the richest player in the guild",
            "Automatically transfers when someone becomes richer",
            "All coin gains have 10% chance to double",
            "All coin losses have 10% chance to double",
            "Shows golden aura visible to all players"
        ],
        
        rumoredEffects: [
            "Fortune's favor shifts like desert sands",
            "Only the wealthiest soul may bear its weight",
            "The burden seeks its rightful master",
            "Multiplies both blessing and curse alike",
            "Marks its bearer with heaven's golden light"
        ],
        
        // Conditional drop settings
        dropWeight: 5, // Somewhat not rare when conditions are met.
        minPowerLevel: 1, // Can appear at any power level
        preferredBiomes: ["golden_vault", "treasure_room", "midas_tomb"],
        conditional: true, // Marks this as a conditional item
        condition: "richest_player", // Specific condition required
        
        baseDurability: 999, // Charms don't break
        durabilityLossReduction: 1.0 // Immune to durability damage
    },
    
    {
        id: 1,
        name: "THE ONE PICK",
        type: "tool",
        slot: "mining",
        rarity: "mythic",
        description: "A pickaxe of impossible perfection, its very existence questioned by scholars and miners alike.",
        lore: "Legend speaks of the Miner King, first of his name, who delved so deep into the earth that he found its beating heart. With metals unknown to mortal kind, he forged The One Pick - a tool of such perfect balance and power that it could cleave mountains with a whisper and find veins of ore that exist between dimensions. The pick has been lost for a thousand generations, and many believe it to be nothing more than a tale told to inspire young miners. Yet still, in the deepest shafts and loneliest tunnels, miners swear they sometimes hear its distinctive ring echoing from somewhere far below... or perhaps far above. Some say the pick chooses its wielder, appearing only to one worthy of the Miner King's legacy. Others claim it never existed at all, merely a metaphor for the perfect unity of miner and mountain. But those who have dedicated their lives to the search know better - The One Pick is real, waiting somewhere in the infinite dark, and it will reveal itself when the cosmos deems it time.",
        value: 1000000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 100 },
            { name: "luck", powerlevel: 100 },
            { name: "speed", powerlevel: 50 },
            { name: "sight", powerlevel: 50 },
            { name: "cosmic_resonance", powerlevel: 999 }
        ],
        
        image: "the_one_pick_mythic",
        glowColor: "#FFFFFF", // Pure white light
        particleEffect: "reality_fracture",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 1, // Mine just 1 block per day
        maintenanceDecayRate: 0, // Never decays
        requiresMaintenance: false, // The pick maintains itself
        maintenanceDescription: "The One Pick requires no maintenance from mortals. It exists outside the laws of entropy.",
        
        specialEffects: [
            "Every strike mines all connected ore veins instantly",
            "Reveals the entire map upon first use",
            "Immune to all hazards and traps",
            "Can mine through bedrock and reality itself",
            "Transmutes common ore to its rare equivalent",
            "Grants the title 'Heir of the Miner King'",
            "Other miners in the session receive +50% all stats"
        ],
        
        rumoredEffects: [
            "Shatters the earth with divine precision",
            "Reveals all secrets hidden in stone",
            "Defies the mountain's ancient defenses",
            "Cuts through the fabric of reality itself",
            "Transforms base metal into noble treasure",
            "Bestows the crown of the first delver",
            "Blesses all who toil in its presence"
        ],
        
        dropWeight: 0, // 0% drop chance - cannot be found normally
        minPowerLevel: 7, // Requires maximum power level even to have a chance
        preferredBiomes: ["the_void_between", "miner_kings_throne", "dimension_zero"],
        
        baseDurability: 999999, // Essentially infinite
        durabilityLossReduction: 1.0 // Takes no durability damage
    },
    
    {
        id: 2,
        name: "Earthshaker",
        type: "tool",
        slot: "mining",
        rarity: "legendary",
        description: "A massive warhammer-pickaxe hybrid that causes minor tremors with each strike. The head is carved from a single piece of volcanic obsidian.",
        lore: "Wielded by the Titan King Gorthak during the War of the Depths. Each strike is said to echo through the earth's core.",
        value: 75000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 50 },
            { name: "strength", powerlevel: 30 },
            { name: "sight", powerlevel: -10 } // Negative stat as drawback
        ],
        
        image: "earthshaker_legendary",
        glowColor: "#8B4513", // Saddle Brown
        particleEffect: "earth_crack",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 100, // Need to mine 100 blocks per cycle
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "This weapon feeds on the destruction of earth and stone. Without regular use, it grows dormant.",
        
        specialEffects: [
            "Area damage - breaks adjacent walls with 30% chance",
            "Intimidation aura - reduces encounter spawn rate",
            "Earth sense - highlights rare ore through walls"
        ],
        
        rumoredEffects: [
            "The earth trembles at its touch",
            "Lesser creatures flee from its presence",
            "Reveals treasures hidden deep below"
        ],
        
        dropWeight: 0.8,
        minPowerLevel: 4,
        preferredBiomes: ["volcanic_tunnels", "deep_caverns"],
        
        baseDurability: 750,
        durabilityLossReduction: 0.3
    },
    
    {
        id: 3,
        name: "Whisper of the Void",
        type: "tool",
        slot: "sight",
        rarity: "legendary",
        description: "An ancient monocle that reveals hidden truths. Looking through it shows not just what is, but what could be.",
        lore: "Found in the ruins of the Observatory of Infinite Paths. Its previous owner saw too much and vanished into possibilities.",
        value: 60000,
        vendable: false,
        
        abilities: [
            { name: "sight", powerlevel: 100 },
            { name: "luck", powerlevel: 25 },
            { name: "sanity", powerlevel: -20 } // Custom negative stat
        ],
        
        image: "whisper_void_legendary",
        glowColor: "#4B0082", // Indigo
        particleEffect: "void_ripple",
        
        maintenanceType: "voice_activity",
        maintenanceCost: 60, // Need 60 minutes in voice per cycle
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "The lens requires the energy of human communication to maintain its connection to reality.",
        
        specialEffects: [
            "Reveals all hazards and treasures within sight range",
            "Can see through walls up to 2 tiles thick",
            "Occasionally shows glimpses of parallel timelines"
        ],
        
        rumoredEffects: [
            "Nothing remains hidden from its gaze",
            "Pierces through stone as if it were glass",
            "Shows visions of what might have been"
        ],
        
        dropWeight: 0.5,
        minPowerLevel: 5,
        preferredBiomes: ["void_touched", "ancient_ruins"],
        
        baseDurability: 200, // Fragile
        durabilityLossReduction: 0.8
    },
    
    {
        id: 4,
        name: "Greed's Embrace",
        type: "equipment",
        slot: "chest",
        rarity: "legendary",
        description: "Golden armor that seems to pulse with an inner hunger. Coins and gems are magnetically drawn to its surface.",
        lore: "Forged from the melted treasures of a thousand dragon hoards. It whispers promises of endless wealth to its wearer.",
        value: 100000,
        vendable: false,
        
        abilities: [
            { name: "luck", powerlevel: 75 },
            { name: "defense", powerlevel: 40 },
            { name: "speed", powerlevel: -15 } // Heavy armor
        ],
        
        image: "greeds_embrace_legendary",
        glowColor: "#FFD700", // Gold
        particleEffect: "coin_sparkle",
        
        maintenanceType: "coins",
        maintenanceCost: 10000, // Very expensive maintenance
        maintenanceDecayRate: 2, // Decays faster
        requiresMaintenance: true,
        maintenanceDescription: "The armor's greed is insatiable. It demands regular tribute of wealth or it will abandon you.",
        
        specialEffects: [
            "Enemies drop 50% more loot",
            "Shops offer 20% better prices",
            "Attracts treasure hazards and rare encounters"
        ],
        
        rumoredEffects: [
            "Compels the fallen to yield their treasures",
            "Merchants bow to its golden influence",
            "Draws both fortune and misfortune near"
        ],
        
        dropWeight: 0.3,
        minPowerLevel: 6,
        preferredBiomes: ["dragon_hoards", "treasure_vaults"],
        
        baseDurability: 400,
        durabilityLossReduction: 0.6
    },
    
    {
        id: 5,
        name: "Phoenix Feather Charm",
        type: "charm",
        rarity: "legendary",
        description: "A single feather that burns with eternal flame, yet is cool to the touch. It grants its bearer the power of rebirth.",
        lore: "Plucked from the tail of the last Phoenix during its thousand-year rebirth cycle. It remembers the taste of resurrection.",
        value: 80000,
        vendable: false,
        
        abilities: [
            { name: "vitality", powerlevel: 50 },
            { name: "fire_resistance", powerlevel: 100 },
            { name: "luck", powerlevel: 15 }
        ],
        
        image: "phoenix_feather_legendary",
        glowColor: "#FF4500", // Orange Red
        particleEffect: "flame_wisp",
        
        maintenanceType: "combat_activity",
        maintenanceCost: 5, // Need 5 combat victories per cycle
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "The Phoenix spirit requires the heat of battle to maintain its flame.",
        
        specialEffects: [
            "Once per day auto-revive with 50% health",
            "Immunity to fire-based hazards",
            "Heals 1% health every minute"
        ],
        
        rumoredEffects: [
            "Grants one chance to rise from ash",
            "Fire bows before the eternal flame",
            "Slowly mends wounds with phoenix warmth"
        ],
        
        dropWeight: 0.4,
        minPowerLevel: 7,
        preferredBiomes: ["volcanic_core", "phoenix_nest"],
        
        baseDurability: 999, // Nearly indestructible
        durabilityLossReduction: 0.9
    },
    
    {
        id: 6,
        name: "Shadowstep Boots",
        type: "equipment",
        slot: "feet",
        rarity: "legendary",
        description: "Boots woven from solidified shadows. Your footsteps make no sound, and you leave no trace.",
        lore: "Worn by the legendary thief who stole the moon. They say he's still running.",
        value: 45000,
        vendable: false,
        
        abilities: [
            { name: "speed", powerlevel: 60 },
            { name: "stealth", powerlevel: 40 },
            { name: "defense", powerlevel: -5 } // Light armor trade-off
        ],
        
        image: "shadowstep_boots_legendary",
        glowColor: "#2F4F4F", // Dark Slate Gray
        particleEffect: "shadow_trail",
        
        maintenanceType: "social_activity",
        maintenanceCost: 10, // Need 10 social interactions per cycle
        maintenanceDecayRate: 1,
        requiresMaintenance: false, // This item doesn't require maintenance
        maintenanceDescription: "These boots feed on social energy and connections.",
        
        specialEffects: [
            "25% chance to dodge any hazard",
            "Can phase through walls once every 10 minutes",
            "Invisible on minimap to other players"
        ],
        
        rumoredEffects: [
            "Dances between danger and safety",
            "Steps through solid stone like shadow",
            "Vanishes from mortal sight and memory"
        ],
        
        dropWeight: 0.6,
        minPowerLevel: 4,
        preferredBiomes: ["shadow_realm", "thieves_den"],
        
        baseDurability: 300,
        durabilityLossReduction: 0.7
    },
    
    {
        id: 7,
        name: "Crown of the Forgotten King",
        type: "equipment",
        slot: "head",
        rarity: "legendary",
        description: "A tarnished crown that whispers forgotten names. Those who wear it command respect, but lose themselves.",
        lore: "The last crown of the Nameless Dynasty. Each king who wore it accomplished great deeds, then vanished from history.",
        value: 120000,
        vendable: false,
        
        abilities: [
            { name: "leadership", powerlevel: 80 },
            { name: "sight", powerlevel: 30 },
            { name: "mining", powerlevel: 20 },
            { name: "memory", powerlevel: -30 } // Curse effect
        ],
        
        image: "forgotten_crown_legendary",
        glowColor: "#4B0082", // Indigo
        particleEffect: "forgotten_whispers",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 50,
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "The crown demands constant conquest and expansion of territory.",
        
        specialEffects: [
            "All nearby players gain +10% mining speed",
            "Can command one NPC helper per day",
            "Randomly forget one item's location each hour"
        ],
        
        rumoredEffects: [
            "Inspires those who labor in your realm",
            "Commands loyalty from the forgotten",
            "The crown's curse steals memories away"
        ],
        
        dropWeight: 0.2,
        minPowerLevel: 6,
        preferredBiomes: ["ancient_throne", "royal_tombs"],
        
        baseDurability: 600,
        durabilityLossReduction: 0.5
    },
    
    {
        id: 8,
        name: "Stormcaller's Gauntlets",
        type: "equipment",
        slot: "hands",
        rarity: "legendary",
        description: "Gauntlets crackling with perpetual lightning. The wearer's touch carries the fury of the storm.",
        lore: "Forged in the eye of the Eternal Storm by the Thunder Shamans. They contain a fragment of the first lightning bolt.",
        value: 55000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 25 },
            { name: "strength", powerlevel: 35 },
            { name: "electric_power", powerlevel: 50 }
        ],
        
        image: "stormcaller_gauntlets_legendary",
        glowColor: "#00FFFF", // Cyan
        particleEffect: "lightning_spark",
        
        maintenanceType: "voice_activity",
        maintenanceCost: 30,
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "The storm within requires the energy of communication to maintain its power.",
        
        specialEffects: [
            "Mining strikes have 20% chance to chain to nearby walls",
            "Immune to electric hazards",
            "Can overcharge machinery and rails"
        ],
        
        rumoredEffects: [
            "Lightning spreads from every strike",
            "The storm's fury cannot harm its master",
            "Breathes electric life into dead machines"
        ],
        
        dropWeight: 0.5,
        minPowerLevel: 5,
        preferredBiomes: ["storm_peaks", "electric_caverns"],
        
        baseDurability: 450,
        durabilityLossReduction: 0.4
    }
];

// Helper function to get item by ID
function getUniqueItemById(id) {
    return UNIQUE_ITEMS.find(item => item.id === id);
}

// Helper function to get items available at a power level
function getAvailableUniqueItems(powerLevel) {
    return UNIQUE_ITEMS.filter(item => item.minPowerLevel <= powerLevel);
}

// Helper function to calculate drop weights
function calculateUniqueItemDropWeights(powerLevel, biome = null) {
    const available = getAvailableUniqueItems(powerLevel);
    
    return available.map(item => {
        let weight = item.dropWeight;
        
        // Bonus weight if in preferred biome
        if (biome && item.preferredBiomes.includes(biome)) {
            weight *= 2;
        }
        
        // Reduce weight for items far below power level
        const levelDiff = powerLevel - item.minPowerLevel;
        if (levelDiff > 2) {
            weight *= 0.5;
        }
        
        return {
            item,
            weight
        };
    });
}

module.exports = {
    UNIQUE_ITEMS,
    getUniqueItemById,
    getAvailableUniqueItems,
    calculateUniqueItemDropWeights
};
