// data/uniqueItemsSheet.js
// Static data for all unique/legendary items
// Only one player can own each item at a time

const UNIQUE_ITEMS = [
    {
        id: 9, // Unique numerical ID
        name: "🌊 Blue Breeze",
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
            "Generates a powerful protective wind barrier (80% hazard resistance)",
            "Creates updrafts that increase movement speed in mines",
            "Summons a Water Elemental familiar that mines alongside you",
            "Water Elemental has 80% of your mining stats and lasts 8 minutes",
            "Elemental can find rare Water Crystals and cleanse hazards"
        ],
        
        // Mysterious rumored effects shown to players
        rumoredEffects: [
            "Sometimes multiplies rewards beyond expectation",
            "Offers legendary protection from the earth's wrath",
            "Hastens your movements through ancient winds",
            "Whispers speak of water spirits bound to the breeze"
        ],
        
        // Drop configuration
        dropWeight: 1, // Lower weight = rarer
        minPowerLevel: 3, // Minimum power level where this can drop
        preferredBiomes: ["windswept_peaks", "crystal_caverns"],
        
        // Mine-specific drop rates (significantly increased in final mines)
        mineSpecificDropRates: {
            "114": 50, // The Sun Under (Topaz final) - 50x drop rate
            "122": 30  // Crystal Eternity (Crystal final) - 30x drop rate
        },
        
        // Item durability (different from maintenance)
        baseDurability: 500, // Much higher than normal items
        durabilityLossReduction: 0.5 // Takes 50% less durability damage
    },
    
    {
        id: 10,
        name: "🥇 Midas' Burden",
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
        maintenanceDecayRate: 5, // Loses 1 maintenance per cycle when not wealthiest (item breaks immediately)
        requiresMaintenance: true,
        maintenanceDescription: "The burden constantly demands tribute from all who bear it. Even the wealthiest must maintain their hold, but the truly rich are rewarded - those who remain the richest receive Midas' touch each cycle. Should maintenance reach zero while still wealthiest, the burden will cling to power with minimal strength rather than abandon you completely. Each maintenance cycle for the richest: 30% chance to bless you with 20% more gold, or curse you with 5-60% loss.",
        
        specialEffects: [
            "Luck randomly becomes either 0x or 100x on each calculation",
            "Can only be owned by the richest player in the guild",
            "Automatically transfers when someone becomes richer",
            "All coin gains have 10% chance to double",
            "All coin losses have 10% chance to double",
            "Shows golden aura visible to all players",
            "Each maintenance: 30% chance for +20% wealth, 70% chance to lose 5-60% wealth",
            "Clings to the wealthiest with minimal power even at 0 maintenance (but still decays)"
        ],
        
        rumoredEffects: [
            "Fortune's favor shifts like desert sands",
            "Only the wealthiest soul may bear its weight",
            "The burden seeks its rightful master",
            "Multiplies both blessing and curse alike",
            "Marks its bearer with heaven's golden light"
        ],
        
        // Conditional drop settings
        dropWeight: 50, // Somewhat not rare when conditions are met.
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
        name: "🐹 Earthshaker",
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
        
        dropWeight: 0.5,
        minPowerLevel: 4,
        preferredBiomes: ["volcanic_tunnels", "deep_caverns"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "117": 40, // Volcanica (Ruby final) - 40x drop rate
            "118": 35  // The Black Heart (Obsidian final) - 35x drop rate
        },
        
        baseDurability: 750,
        durabilityLossReduction: 0.3
    },
    
    {
        id: 3,
        name: "🌑 Whisper of the Void",
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
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "18": 45, // Abyssal Adamantite Depths (Adamantite final) - 45x drop rate
            "119": 25 // Blue Cosmos (Mythril final) - 25x drop rate
        },
        
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
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "115": 35, // The Diamond Crown (Diamond final) - 35x drop rate
            "116": 30  // Emerald World Tree (Emerald final) - 30x drop rate
        },
        
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
        
        dropWeight: 0.2,
        minPowerLevel: 7,
        preferredBiomes: ["volcanic_core", "phoenix_nest"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "117": 60, // Volcanica (Ruby final) - 60x drop rate
            "118": 40  // The Black Heart (Obsidian final) - 40x drop rate
        },
        
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
        
        maintenanceType: "coins",
        maintenanceCost: 10000, // Need to move 500 tiles per day
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "These boots must keep moving or they lose their shadow essence. Walk 500 tiles in mining to maintain their power.",
        
        specialEffects: [
            "25% chance to dodge any hazard",
            "Can phase through walls once every 10 minutes",
            "Invisible on minimap to other players",
            "5% chance each move to teleport to visible ore deposits, or random floor tiles if no ore is in sight",
            "Leaves no footprints or traces in the mine",
            "Movement speed increases based on maintenance level"
        ],
        
        rumoredEffects: [
            "Dances between danger and safety",
            "Steps through solid stone like shadow",
            "Vanishes from mortal sight and memory",
            "Drawn to the glint of precious ore in the darkness",
            "The shadows remember every step taken"
        ],
        
        dropWeight: 0.1,
        minPowerLevel: 4,
        preferredBiomes: ["shadow_realm", "thieves_den"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "118": 50, // The Black Heart (Obsidian final) - 50x drop rate
            "16": 30   // ???'s Gullet (Special legendary) - 30x drop rate
        },
        
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
        
        dropWeight: 0.1,
        minPowerLevel: 6,
        preferredBiomes: ["ancient_throne", "royal_tombs"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "123": 40, // The Origin (Fossil final) - 40x drop rate
            "17": 25   // Rusty Relic Realm (Special legendary) - 25x drop rate
        },
        
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
        
        dropWeight: 0.08,
        minPowerLevel: 5,
        preferredBiomes: ["storm_peaks", "electric_caverns"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "120": 35, // Copper Throne (Copper final) - 35x drop rate
            "121": 30  // Black Iron (Iron final) - 30x drop rate
        },
        
        baseDurability: 450,
        durabilityLossReduction: 0.4
    },
    
    {
        id: 11,
        name: "👥 Shadow Legion Amulet",
        type: "charm",
        slot: "charm",
        rarity: "mythic",
        description: "An obsidian amulet bound with three restless shadows. They echo your every move in the mines, feeding on stone, treasure… and perhaps your soul.",
        lore: "Whispers speak of Mor'duun, the Wraith King, who bound three generals into this amulet. The shadows obey without question, mining alongside their master. But each strike of the pick seems to draw something unseen… a toll only the wearer pays.",
        value: 750000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 20 },
            { name: "shadow_legion", powerlevel: 3 },
            { name: "soul_drain", powerlevel: -15 },
            { name: "collective_fortune", powerlevel: 40 }
        ],
        
        image: "shadow_legion_amulet_mythic",
        glowColor: "#1C1C1C",
        particleEffect: "shadow_wisps",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 500,
        maintenanceDecayRate: 2,
        requiresMaintenance: true,
        maintenanceDescription: "The shadow spirits feed on the destruction of earth and stone. Mine at least 500 blocks per day to maintain their corporeal forms.",
        
        specialEffects: [
            "Creates 5 shadow clones that mine independently",
            "Each clone has 75% of your mining stats",
            "All coins and items from clones transfer to you",
            "Clones join/leave when you join/leave the mine",
            "Clones can trigger their own hazards and events",
            "10% chance clones find bonus shadow ore each action",
            "Clones are visible to other players as dark silhouettes",
            "If a clone is knocked out by hazards, it respawns in 2 minutes",
            "Clones share your equipment bonuses but at reduced effectiveness"
        ],
        
        rumoredEffects: [
            "Five shadows echo your every strike",
            "Treasure flows from rifts unseen",
            "Bound eternally to mirror your will",
            "Dark ore surfaces where none should be",
            "Shadows fall, but always rise again",
            "Others glimpse your legion in the stone",
            "The void whispers profits… and prices"
        ],
        
        dropWeight: 0.001,
        minPowerLevel: 6,
        preferredBiomes: ["shadow_realm", "void_depths", "wraith_kingdom", "dimensional_rift"],
        conditional: true,
        condition: "shadow_affinity",
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "118": 100, // The Black Heart (Obsidian final) - 100x drop rate
            "16": 50    // ???'s Gullet (Special legendary) - 50x drop rate
        },
        
        baseDurability: 666,
        durabilityLossReduction: 0.7,
        
        cloneConfig: {
            count: 5,
            statMultiplier: 0.75,
            namePrefix: "Shadow",
            respawnTime: 120000,
            transferRate: 1.0,
            independentActions: true,
            visibleToOthers: true,
            shadowOreChance: 0.1,
            sharesEquipment: true,
            equipmentEffectiveness: 0.5
        }
    },
    
    {
        id: 12,
        name: "⚫ Coal King's Crown",
        type: "equipment",
        slot: "head",
        rarity: "legendary",
        description: "A crown forged from the purest anthracite coal, pulsing with dark energy. It commands the very essence of the earth's deepest carbon deposits.",
        lore: "Worn by the legendary Coal King who ruled the deepest coal shafts. When he vanished into the All Black, his crown remained, still burning with the eternal flame of compressed carbon.",
        value: 85000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 40 },
            { name: "dark_power", powerlevel: 60 },
            { name: "coal_mastery", powerlevel: 80 }
        ],
        
        image: "coal_kings_crown_legendary",
        glowColor: "#2F2F2F", // Dark Gray
        particleEffect: "coal_embers",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 200,
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "The crown demands the destruction of coal and carbon to maintain its dark power.",
        
        specialEffects: [
            "All coal ore gives 3x normal value",
            "Can see through coal walls up to 5 tiles",
            "Immune to coal dust hazards",
            "Coal veins regenerate 50% faster when mining",
            "Dark aura reduces visibility of other players by 20%"
        ],
        
        rumoredEffects: [
            "Commands the very essence of coal",
            "Pierces through carbon as if it were air",
            "The dark crown burns with eternal flame",
            "Coal bows before its ancient authority"
        ],
        
        dropWeight: 0.3,
        minPowerLevel: 3,
        preferredBiomes: ["coal_depths", "anthracite_veins"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "113": 60 // The All Black (Coal final) - 60x drop rate
        },
        
        baseDurability: 800,
        durabilityLossReduction: 0.6
    },
    
    {
        id: 13,
        name: "🌞 Solar Forge Hammer",
        type: "tool",
        slot: "mining",
        rarity: "legendary",
        description: "A hammer that burns with captured sunlight, its head forged from crystallized solar energy. Each strike releases a burst of golden light.",
        lore: "Forged by the Sun Smiths in the heart of the Solar Forge, this hammer contains a fragment of the sun itself. It was lost when the forge collapsed into the Sun Under.",
        value: 95000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 45 },
            { name: "light_power", powerlevel: 70 },
            { name: "solar_mastery", powerlevel: 55 }
        ],
        
        image: "solar_forge_hammer_legendary",
        glowColor: "#FFD700", // Gold
        particleEffect: "solar_flare",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 150,
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "The hammer must strike stone regularly to maintain its solar connection.",
        
        specialEffects: [
            "All topaz and crystal ore gives 2.5x normal value",
            "Creates light that reveals hidden passages",
            "Immune to light-based hazards",
            "Solar strikes have 25% chance to chain to nearby walls",
            "Generates warmth that heals 1% health per minute"
        ],
        
        rumoredEffects: [
            "Burns with the captured light of stars",
            "Illuminates the darkest depths",
            "Solar energy flows through every strike",
            "The hammer remembers the sun's forge"
        ],
        
        dropWeight: 0.4,
        minPowerLevel: 4,
        preferredBiomes: ["solar_caverns", "crystal_forges"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "114": 55 // The Sun Under (Topaz final) - 55x drop rate
        },
        
        baseDurability: 700,
        durabilityLossReduction: 0.5
    },
    
    {
        id: 14,
        name: "💎 Diamond Heart",
        type: "charm",
        slot: "charm",
        rarity: "legendary",
        description: "A perfect diamond that beats like a heart, pulsing with the rhythm of the earth's core. It grants unbreakable resolve.",
        lore: "The crystallized heart of the Diamond King, who sacrificed himself to create the Diamond Crown. His essence lives on in this perfect gem.",
        value: 150000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 35 },
            { name: "resistance", powerlevel: 90 },
            { name: "diamond_mastery", powerlevel: 75 }
        ],
        
        image: "diamond_heart_legendary",
        glowColor: "#B9F2FF", // Diamond Blue
        particleEffect: "diamond_sparkle",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 100,
        maintenanceDecayRate: 0.5,
        requiresMaintenance: true,
        maintenanceDescription: "The heart beats stronger when surrounded by the destruction of precious stones.",
        
        specialEffects: [
            "All diamond and gem ore gives 4x normal value",
            "Immune to all physical hazards",
            "Diamond strikes never miss their target",
            "Grants 50% damage reduction from all sources",
            "Creates diamond dust that reveals hidden treasures"
        ],
        
        rumoredEffects: [
            "The heart of the Diamond King beats eternal",
            "Unbreakable resolve flows through its bearer",
            "Diamonds bow before their true master",
            "The crown's essence lives on in this gem"
        ],
        
        dropWeight: 0.2,
        minPowerLevel: 5,
        preferredBiomes: ["diamond_caverns", "gem_vaults"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "115": 70 // The Diamond Crown (Diamond final) - 70x drop rate
        },
        
        baseDurability: 999,
        durabilityLossReduction: 0.9
    },
    
    {
        id: 15,
        name: "🌿 World Tree Branch",
        type: "tool",
        slot: "mining",
        rarity: "legendary",
        description: "A living branch from the Emerald World Tree, still growing and pulsing with life energy. It can grow through any stone.",
        lore: "Plucked from the highest branch of the Emerald World Tree by the first druid. It continues to grow even in the darkest depths, seeking the light above.",
        value: 110000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 50 },
            { name: "life_power", powerlevel: 80 },
            { name: "nature_mastery", powerlevel: 65 }
        ],
        
        image: "world_tree_branch_legendary",
        glowColor: "#00FF00", // Bright Green
        particleEffect: "leaf_swirl",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 80,
        maintenanceDecayRate: 0.5,
        requiresMaintenance: true,
        maintenanceDescription: "The branch grows stronger when it can reach toward the surface through stone.",
        
        specialEffects: [
            "All emerald and plant-based ore gives 3x normal value",
            "Can grow through walls to reach ore veins",
            "Creates temporary bridges across gaps",
            "Heals 2% health per minute from life energy",
            "Plant growth reveals hidden passages"
        ],
        
        rumoredEffects: [
            "The World Tree's branch grows eternal",
            "Life energy flows through every strike",
            "Nature's power breaks through any barrier",
            "The branch seeks the light above"
        ],
        
        dropWeight: 0.25,
        minPowerLevel: 4,
        preferredBiomes: ["emerald_groves", "living_caverns"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "116": 65 // Emerald World Tree (Emerald final) - 65x drop rate
        },
        
        baseDurability: 600,
        durabilityLossReduction: 0.4
    },
    
    {
        id: 16,
        name: "🔥 Volcanic Core",
        type: "charm",
        slot: "charm",
        rarity: "legendary",
        description: "A fragment of the earth's molten core, still burning with primordial fire. It grants the power of the volcano itself.",
        lore: "Extracted from the heart of Volcanica by the Fire Lord. This core fragment contains the raw power of creation, the same fire that forged the first mountains.",
        value: 125000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 40 },
            { name: "fire_power", powerlevel: 95 },
            { name: "volcanic_mastery", powerlevel: 70 }
        ],
        
        image: "volcanic_core_legendary",
        glowColor: "#FF4500", // Orange Red
        particleEffect: "lava_burst",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 120,
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "The core must consume stone and ore to maintain its volcanic fire.",
        
        specialEffects: [
            "All ruby and fire-based ore gives 3.5x normal value",
            "Immune to all fire and heat hazards",
            "Volcanic strikes melt through any material",
            "Creates lava pools that damage enemies",
            "Fire aura increases mining speed by 30%"
        ],
        
        rumoredEffects: [
            "The earth's molten heart burns eternal",
            "Volcanic power flows through every strike",
            "Fire bows before the core's authority",
            "The volcano's fury lives in this fragment"
        ],
        
        dropWeight: 0.3,
        minPowerLevel: 5,
        preferredBiomes: ["volcanic_chambers", "lava_caverns"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "117": 75 // Volcanica (Ruby final) - 75x drop rate
        },
        
        baseDurability: 900,
        durabilityLossReduction: 0.7
    },
    
    {
        id: 17,
        name: "🌌 Cosmic Void Crystal",
        type: "equipment",
        slot: "chest",
        rarity: "legendary",
        description: "A crystal that contains a fragment of the void between stars. It pulses with cosmic energy and grants otherworldly powers.",
        lore: "Harvested from the Blue Cosmos by the Void Walker. This crystal contains the essence of the space between stars, granting powers beyond mortal comprehension.",
        value: 180000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 30 },
            { name: "cosmic_power", powerlevel: 85 },
            { name: "void_mastery", powerlevel: 90 }
        ],
        
        image: "cosmic_void_crystal_legendary",
        glowColor: "#8A2BE2", // Blue Violet
        particleEffect: "cosmic_swirl",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 200,
        maintenanceDecayRate: 0.5,
        requiresMaintenance: true,
        maintenanceDescription: "The crystal must absorb the energy of rare ores to maintain its cosmic connection.",
        
        specialEffects: [
            "All mythril and cosmic ore gives 5x normal value",
            "Can phase through walls once every 5 minutes",
            "Creates temporary portals to distant locations",
            "Void energy reveals hidden dimensional rifts",
            "Cosmic aura grants 25% chance to dodge any attack"
        ],
        
        rumoredEffects: [
            "The void between stars pulses within",
            "Cosmic energy flows through every fiber",
            "Dimensional rifts bow before its power",
            "The crystal remembers the Blue Cosmos"
        ],
        
        dropWeight: 0.15,
        minPowerLevel: 6,
        preferredBiomes: ["cosmic_caverns", "void_depths"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "119": 80 // Blue Cosmos (Mythril final) - 80x drop rate
        },
        
        baseDurability: 800,
        durabilityLossReduction: 0.8
    },
    
    {
        id: 18,
        name: "⚡ Adamantine Storm",
        type: "tool",
        slot: "mining",
        rarity: "legendary",
        description: "A pickaxe forged from pure adamantine and charged with the fury of a thousand storms. It crackles with electric energy.",
        lore: "Forged in the Abyssal Adamantite Depths by the Storm Forge. This pickaxe contains the essence of the deepest storms, channeling their power through adamantine.",
        value: 200000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 60 },
            { name: "storm_power", powerlevel: 85 },
            { name: "adamantine_mastery", powerlevel: 95 }
        ],
        
        image: "adamantine_storm_legendary",
        glowColor: "#00FFFF", // Cyan
        particleEffect: "storm_lightning",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 300,
        maintenanceDecayRate: 0.5,
        requiresMaintenance: true,
        maintenanceDescription: "The storm within must be fed with the destruction of the hardest materials.",
        
        specialEffects: [
            "All adamantine and storm-based ore gives 6x normal value",
            "Storm strikes chain to all nearby walls",
            "Immune to all electric and storm hazards",
            "Creates lightning that reveals hidden ore veins",
            "Storm aura increases all stats by 20%"
        ],
        
        rumoredEffects: [
            "The storm's fury flows through adamantine",
            "Lightning chains through every strike",
            "The deepest storms bow before its power",
            "Adamantine remembers the storm's forge"
        ],
        
        dropWeight: 0.1,
        minPowerLevel: 7,
        preferredBiomes: ["storm_depths", "adamantine_forges"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "18": 90 // Abyssal Adamantite Depths (Adamantite final) - 90x drop rate
        },
        
        baseDurability: 1200,
        durabilityLossReduction: 0.6
    },
    
    {
        id: 19,
        name: "⚙️ Iron Lord's Gauntlets",
        type: "equipment",
        slot: "hands",
        rarity: "legendary",
        description: "Gauntlets forged from the purest black iron, still warm from the forge. They grant the strength of the Iron Lord himself.",
        lore: "Worn by the legendary Iron Lord who ruled the Iron Fortress. When he fell in battle, his gauntlets remained, still pulsing with his indomitable will.",
        value: 90000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 45 },
            { name: "strength", powerlevel: 80 },
            { name: "iron_mastery", powerlevel: 70 }
        ],
        
        image: "iron_lords_gauntlets_legendary",
        glowColor: "#2F4F4F", // Dark Slate Gray
        particleEffect: "iron_sparks",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 180,
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "The gauntlets must crush stone and ore to maintain their iron strength.",
        
        specialEffects: [
            "All iron and metal ore gives 2.5x normal value",
            "Iron strikes never break or miss",
            "Immune to all physical damage",
            "Creates iron dust that reveals hidden metal veins",
            "Iron aura increases durability of all equipment by 50%"
        ],
        
        rumoredEffects: [
            "The Iron Lord's strength flows through these gauntlets",
            "Iron bows before its true master",
            "The gauntlets remember the forge's fire",
            "Unbreakable will flows through every strike"
        ],
        
        dropWeight: 0.35,
        minPowerLevel: 4,
        preferredBiomes: ["iron_forges", "metal_caverns"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "121": 55 // Black Iron (Iron final) - 55x drop rate
        },
        
        baseDurability: 1000,
        durabilityLossReduction: 0.7
    },
    
    {
        id: 20,
        name: "🔮 Crystal Seer's Orb",
        type: "equipment",
        slot: "offhand",
        rarity: "legendary",
        description: "A perfect crystal orb that shows visions of the past, present, and future. It pulses with the light of a thousand crystals.",
        lore: "Created by the Crystal Seer who lived in the Crystal Paradise. When she vanished into the crystal dimensions, her orb remained, still showing glimpses of all possible futures.",
        value: 160000,
        vendable: false,
        
        abilities: [
            { name: "sight", powerlevel: 100 },
            { name: "crystal_power", powerlevel: 75 },
            { name: "divination", powerlevel: 85 }
        ],
        
        image: "crystal_seers_orb_legendary",
        glowColor: "#E6E6FA", // Lavender
        particleEffect: "crystal_visions",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 150,
        maintenanceDecayRate: 0.5,
        requiresMaintenance: true,
        maintenanceDescription: "The orb must absorb the energy of crystal formations to maintain its visions.",
        
        specialEffects: [
            "All crystal and gem ore gives 4x normal value",
            "Reveals the entire map and all hidden passages",
            "Shows future hazard locations 30 seconds in advance",
            "Crystal visions reveal the best mining paths",
            "Divination aura increases luck by 50%"
        ],
        
        rumoredEffects: [
            "The Crystal Seer's visions flow through this orb",
            "All possible futures are revealed within",
            "Crystal energy pulses with divine light",
            "The orb remembers the Crystal Paradise"
        ],
        
        dropWeight: 0.2,
        minPowerLevel: 5,
        preferredBiomes: ["crystal_gardens", "vision_caverns"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "122": 70 // Crystal Eternity (Crystal final) - 70x drop rate
        },
        
        baseDurability: 700,
        durabilityLossReduction: 0.8
    },
    
    {
        id: 21,
        name: "🦕 Primordial Fossil",
        type: "charm",
        slot: "charm",
        rarity: "legendary",
        description: "A fossil that contains the essence of the first life on earth. It pulses with primordial energy and grants ancient wisdom.",
        lore: "Discovered in The Origin by the first paleontologist. This fossil contains the essence of the very first creature to walk the earth, granting powers beyond comprehension.",
        value: 140000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 35 },
            { name: "ancient_wisdom", powerlevel: 90 },
            { name: "primordial_power", powerlevel: 80 }
        ],
        
        image: "primordial_fossil_legendary",
        glowColor: "#8B4513", // Saddle Brown
        particleEffect: "ancient_energy",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 100,
        maintenanceDecayRate: 0.5,
        requiresMaintenance: true,
        maintenanceDescription: "The fossil must absorb the energy of ancient stone to maintain its primordial connection.",
        
        specialEffects: [
            "All fossil and ancient ore gives 5x normal value",
            "Ancient wisdom reveals the location of all treasures",
            "Primordial energy heals 3% health per minute",
            "Fossil aura increases all stats by 25%",
            "Can communicate with ancient spirits for guidance"
        ],
        
        rumoredEffects: [
            "The first life's essence pulses within",
            "Ancient wisdom flows through every fiber",
            "Primordial energy remembers the earth's birth",
            "The fossil speaks with the voice of the first creature"
        ],
        
        dropWeight: 0.25,
        minPowerLevel: 6,
        preferredBiomes: ["ancient_depths", "fossil_caverns"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "123": 75 // The Origin (Fossil final) - 75x drop rate
        },
        
        baseDurability: 800,
        durabilityLossReduction: 0.9
    },
    
    {
        id: 22,
        name: "⚡ Copper Conductor",
        type: "tool",
        slot: "mining",
        rarity: "legendary",
        description: "A pickaxe forged from pure copper and charged with electric energy. It crackles with the power of a thousand lightning bolts.",
        lore: "Forged in the Copper Throne by the Electric King. This pickaxe contains the essence of the first lightning bolt, channeling its power through copper.",
        value: 75000,
        vendable: false,
        
        abilities: [
            { name: "mining", powerlevel: 40 },
            { name: "electric_power", powerlevel: 70 },
            { name: "copper_mastery", powerlevel: 60 }
        ],
        
        image: "copper_conductor_legendary",
        glowColor: "#B87333", // Dark Goldenrod
        particleEffect: "electric_spark",
        
        maintenanceType: "mining_activity",
        maintenanceCost: 120,
        maintenanceDecayRate: 1,
        requiresMaintenance: true,
        maintenanceDescription: "The conductor must channel electric energy through copper ore to maintain its power.",
        
        specialEffects: [
            "All copper and electric ore gives 3x normal value",
            "Electric strikes chain to all nearby metal",
            "Immune to all electric hazards",
            "Creates electric fields that reveal hidden metal veins",
            "Electric aura increases mining speed by 25%"
        ],
        
        rumoredEffects: [
            "The first lightning's power flows through copper",
            "Electric energy chains through every strike",
            "The conductor remembers the Electric King's forge",
            "Copper bows before its electric master"
        ],
        
        dropWeight: 0.4,
        minPowerLevel: 3,
        preferredBiomes: ["copper_forges", "electric_caverns"],
        
        // Mine-specific drop rates
        mineSpecificDropRates: {
            "120": 60 // Copper Throne (Copper final) - 60x drop rate
        },
        
        baseDurability: 600,
        durabilityLossReduction: 0.5
    }
];

// Helper function to get item by ID
function getUniqueItemById(id) {
    // Handle both string and number IDs
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    return UNIQUE_ITEMS.find(item => item.id === numericId || item.id === id);
}

// Helper function to get items available at a power level
function getAvailableUniqueItems(powerLevel) {
    return UNIQUE_ITEMS.filter(item => item.minPowerLevel <= powerLevel);
}

// Helper function to calculate drop weights
function calculateUniqueItemDropWeights(powerLevel, biome = null, mineId = null) {
    const available = getAvailableUniqueItems(powerLevel);
    
    return available.map(item => {
        let weight = item.dropWeight;
        
        // MASSIVE bonus for mine-specific drops
        if (mineId && item.mineSpecificDropRates && item.mineSpecificDropRates[mineId]) {
            weight *= item.mineSpecificDropRates[mineId];
        }
        
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
