// patterns/gachaModes/mining/uniqueItemBonuses.js
// Handles unique item special abilities and bonuses in mining

const { getUniqueItemById } = require('../../../data/uniqueItemsSheet');

/**
 * Parse unique item bonuses from equipped items
 * @param {Object} equippedItems - Equipped items from calculatePlayerStat
 * @returns {Object} Parsed bonuses and special abilities
 */
function parseUniqueItemBonuses(equippedItems) {
    const bonuses = {
        // Blue Breeze abilities
        doubleOreChance: 0,
        hazardResistance: 0,
        movementSpeedBonus: 0,
        
        // Other unique item abilities
        areaDamageChance: 0,
        sightThroughWalls: 0,
        lootMultiplier: 1,
        autoReviveChance: 0,
        dodgeChance: 0,
        phaseWalkChance: 0,
        shadowTeleportChance: 0, // Shadowstep Boots teleportation
        teamMiningBonus: 0,
        chainMiningChance: 0,
        
        // New unique item abilities
        fireResistance: 0,
        electricResistance: 0,
        lightningImmunity: false,
        darkPower: 0,
        lightPower: 0,
        cosmicPower: 0,
        stormPower: 0,
        volcanicPower: 0,
        lifePower: 0,
        naturePower: 0,
        ancientWisdom: 0,
        primordialPower: 0,
        crystalPower: 0,
        divination: 0,
        ironMastery: 0,
        copperMastery: 0,
        coalMastery: 0,
        solarMastery: 0,
        diamondMastery: 0,
        adamantineMastery: 0,
        voidMastery: 0,
        shadowLegion: 0,
        collectiveFortune: 0,
        soulDrain: 0,
        leadership: 0,
        memory: 0,
        stealth: 0,
        defense: 0,
        strength: 0,
        vitality: 0,
        resistance: 0,
        electricPower: 0,
        greed: 0,
        curse: 0,
        sanity: 0,
        speed: 0,
        
        // Ore value multipliers
        oreValueMultipliers: {},
        
        // Health system
        healthRegen: 0,
        maxHealth: 100,
        currentHealth: 100,
        
        // Time-based effects
        dailyCooldowns: {},
        hourlyEffects: {},
        
        // Visual effects
        visualEffects: {
            aura: null,
            glowColor: null,
            particleEffect: null,
            visibleToOthers: false
        },
        
        // Team buffs
        teamBuffs: {
            miningSpeed: 0,
            allStats: 0,
            radius: 0
        },
        
        // Advanced clone system
        cloneSystem: {
            activeClones: 0,
            maxClones: 0,
            cloneStats: 0,
            cloneBonuses: {}
        },
        
        // NPC system
        npcSystem: {
            canCommandNPC: false,
            npcCooldown: 0,
            npcType: null
        },
        
        // Title system
        titles: [],
        
        // Machinery system
        machinerySystem: {
            canOvercharge: false,
            canConductElectricity: false,
            canMagnetize: false
        },
        
        // Minimap system
        minimapSystem: {
            invisible: false,
            reducedVisibility: 0
        },
        
        // Track which unique items are equipped
        uniqueItems: [],
        
        // Damage reduction
        durabilityDamageReduction: 0,
        armorReduction: 0, // Reduces health damage from hazards
        neverBreaks: false
    };
    
    if (!equippedItems) return bonuses;
    
    // Process regular equipment for armor bonuses
    for (const [id, item] of Object.entries(equippedItems)) {
        // Check for armor equipment
        if (item.type === 'equipment' && item.slot === 'armor') {
            // Apply armor reduction from equipment
            const armorAbility = item.abilities?.find(a => a.name === 'armor');
            if (armorAbility) {
                const armorLevel = armorAbility.power || armorAbility.powerlevel || 0;
                bonuses.armorReduction += armorLevel * 0.05; // 5% reduction per armor level
            }
            
            // Check for armorReduction property directly on item
            if (item.armorReduction) {
                bonuses.armorReduction += item.armorReduction;
            }
        }
    }
    
    // Process unique items
    for (const [id, item] of Object.entries(equippedItems)) {
        if (!item.isUnique) continue;
        
        // Get maintenance ratio - default to 1 if not set (for backwards compatibility)
        const maintenanceRatio = item.maintenanceRatio !== undefined ? item.maintenanceRatio : 1;
        
        // Skip items with 0 maintenance (broken)
        if (maintenanceRatio <= 0) {
            console.log(`[UNIQUE] Skipping ${item.name} - maintenance ratio is 0 (item is broken)`);
            continue;
        }
        
        // Track unique item with its maintenance status
        bonuses.uniqueItems.push({
            id: item.itemId,
            name: item.name,
            maintenanceRatio: maintenanceRatio,
            maintenanceLevel: item.maintenanceLevel || Math.round(maintenanceRatio * 10)
        });
        
        // Unique items never break from durability
        bonuses.neverBreaks = true;
        
        // Parse special effects based on item name or ID
        // Extract numeric ID from "unique_X" format
        let itemId;
        if (typeof item.itemId === 'string' && item.itemId.startsWith('unique_')) {
            itemId = parseInt(item.itemId.replace('unique_', ''));
        } else if (typeof item.itemId === 'number') {
            itemId = item.itemId;
        } else {
            console.warn(`[UNIQUE] Unknown item ID format: ${item.itemId}`);
            continue;
        }
        
        console.log(`[UNIQUE] Processing ${item.name} (ID: ${itemId}) with maintenance ratio: ${maintenanceRatio}`);
        
        switch(itemId) {
            case 9: // Blue Breeze
                bonuses.doubleOreChance += 0.15 * maintenanceRatio; // 15% chance at full maintenance
                bonuses.hazardResistance += 0.8 * maintenanceRatio; // 80% hazard resistance
                bonuses.movementSpeedBonus += 0.2 * maintenanceRatio; // 20% speed bonus
                bonuses.durabilityDamageReduction += 0.5 * maintenanceRatio; // 50% less durability damage
                break;
            
            case 1: // THE ONE PICK (Mythic)
                // This legendary pick maintains itself
                bonuses.doubleOreChance += 1.0; // 100% double ore (not affected by maintenance)
                bonuses.hazardResistance += 1.0; // Complete immunity
                bonuses.movementSpeedBonus += 0.5; // 50% speed bonus
                bonuses.sightThroughWalls += 10; // See entire map
                bonuses.lootMultiplier *= 2; // Double all loot
                bonuses.chainMiningChance += 1.0; // Always chains
                bonuses.areaDamageChance += 1.0; // Always area damage
                bonuses.teamMiningBonus += 0.5; // 50% bonus to team
                bonuses.neverBreaks = true;
                // Ore value multipliers - transmutes common to rare
                bonuses.oreValueMultipliers.common = 2.0; // 2x common ore value
                bonuses.oreValueMultipliers.uncommon = 2.0; // 2x uncommon ore value
                bonuses.oreValueMultipliers.rare = 2.0; // 2x rare ore value
                bonuses.oreValueMultipliers.epic = 2.0; // 2x epic ore value
                bonuses.oreValueMultipliers.legendary = 2.0; // 2x legendary ore value
                // Team buffs
                bonuses.teamBuffs.allStats = 0.5; // 50% all stats to team
                bonuses.teamBuffs.radius = 10; // 10 tile radius
                // Visual effects
                bonuses.visualEffects.aura = 'divine';
                bonuses.visualEffects.glowColor = '#FFFFFF';
                bonuses.visualEffects.particleEffect = 'reality_fracture';
                bonuses.visualEffects.visibleToOthers = true; // Divine aura visible to all
                // Title system
                bonuses.titles.push('Heir of the Miner King');
                break;
                
            case 2: // Earthshaker
                bonuses.areaDamageChance += 0.3 * maintenanceRatio;
                bonuses.hazardResistance += 0.2 * maintenanceRatio; // Intimidation aura
                bonuses.sightThroughWalls += 1 * maintenanceRatio; // See ore through walls
                break;
                
            case 3: // Whisper of the Void
                bonuses.sightThroughWalls += 2 * maintenanceRatio;
                bonuses.hazardResistance += 0.4 * maintenanceRatio; // See hazards coming
                break;
                
            case 4: // Greed's Embrace
                bonuses.lootMultiplier *= (1 + 0.5 * maintenanceRatio);
                bonuses.doubleOreChance += 0.1 * maintenanceRatio;
                break;
                
            case 5: // Phoenix Feather Charm
                bonuses.autoReviveChance += 0.5 * maintenanceRatio;
                bonuses.hazardResistance += 0.5 * maintenanceRatio; // Fire immunity
                // Health regeneration
                bonuses.healthRegen += 0.01 * maintenanceRatio; // 1% health per minute
                // Visual effects
                bonuses.visualEffects.aura = 'phoenix';
                bonuses.visualEffects.glowColor = '#FF4500';
                bonuses.visualEffects.particleEffect = 'flame_wisp';
                break;
                
            case 6: // Shadowstep Boots
                bonuses.dodgeChance += 0.25 * maintenanceRatio;
                bonuses.phaseWalkChance += 0.1 * maintenanceRatio; // 10% chance to phase through walls
                bonuses.shadowTeleportChance += 0.05 * maintenanceRatio; // 5% chance to teleport
                bonuses.movementSpeedBonus += 0.3 * maintenanceRatio;
                // Minimap system
                bonuses.minimapSystem.invisible = true; // Invisible on minimap
                // Visual effects
                bonuses.visualEffects.aura = 'shadow';
                bonuses.visualEffects.glowColor = '#2F4F4F';
                bonuses.visualEffects.particleEffect = 'shadow_trail';
                break;
                
            case 7: // Crown of the Forgotten King
                bonuses.teamMiningBonus += 0.1 * maintenanceRatio;
                bonuses.sightThroughWalls += 1 * maintenanceRatio;
                // Team buffs
                bonuses.teamBuffs.miningSpeed = 0.1 * maintenanceRatio; // 10% mining speed to nearby players
                bonuses.teamBuffs.radius = 5; // 5 tile radius
                // NPC system
                bonuses.npcSystem.canCommandNPC = true;
                bonuses.npcSystem.npcCooldown = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
                bonuses.npcSystem.npcType = 'helper';
                // Visual effects
                bonuses.visualEffects.aura = 'royal';
                bonuses.visualEffects.glowColor = '#4B0082';
                bonuses.visualEffects.particleEffect = 'forgotten_whispers';
                break;
                
            case 8: // Stormcaller's Gauntlets
                bonuses.chainMiningChance += 0.2 * maintenanceRatio;
                bonuses.hazardResistance += 0.3 * maintenanceRatio; // Electric immunity
                bonuses.electricResistance += 1.0 * maintenanceRatio; // Complete lightning immunity
                bonuses.stormPower += 0.8 * maintenanceRatio; // 80% storm mastery
                bonuses.lightningImmunity = true; // Complete lightning stun immunity
                // Machinery system
                bonuses.machinerySystem.canOvercharge = true;
                // Visual effects
                bonuses.visualEffects.aura = 'electric';
                bonuses.visualEffects.glowColor = '#00FFFF';
                bonuses.visualEffects.particleEffect = 'lightning_spark';
                break;
                
            case 10: // Midas' Burden
                // Midas' effect is handled specially in calculatePlayerStat
                // But we still apply the loot multiplier
                bonuses.lootMultiplier *= (1 + 0.5 * maintenanceRatio);
                bonuses.doubleOreChance += 0.1 * maintenanceRatio;
                // Coin doubling effects
                bonuses.oreValueMultipliers.coin = 2.0 * maintenanceRatio; // 2x coin value
                // Visual effects
                bonuses.visualEffects.aura = 'golden';
                bonuses.visualEffects.glowColor = '#FFD700';
                bonuses.visualEffects.particleEffect = 'gold_dust';
                bonuses.visualEffects.visibleToOthers = true; // Golden aura visible to all
                // Note: The luck multiplier (0x or 100x) is handled in stats calculation
                break;
                
            case 11: // Shadow Legion Amulet
                // Shadow clone spawning is handled separately in shadowCloneSystem.js
                // Here we add the base bonuses from the amulet itself
                bonuses.lootMultiplier *= 1.4; // 40% more loot from collective fortune
                bonuses.shadowLegion += 0.8 * maintenanceRatio; // 80% shadow legion power
                bonuses.collectiveFortune += 0.6 * maintenanceRatio; // 60% collective fortune
                bonuses.soulDrain += 0.1 * maintenanceRatio; // 10% soul drain
                bonuses.movementSpeedBonus += 0.1 * maintenanceRatio; // Small speed bonus
                // Clone system
                bonuses.cloneSystem.maxClones = Math.floor(3 * maintenanceRatio); // Up to 3 clones
                bonuses.cloneSystem.cloneStats = 0.5 * maintenanceRatio; // Clones have 50% of player stats
                bonuses.cloneSystem.cloneBonuses.lootMultiplier = 0.2; // Clones provide 20% loot bonus each
                // Visual effects
                bonuses.visualEffects.aura = 'shadow_legion';
                bonuses.visualEffects.glowColor = '#4B0082';
                bonuses.visualEffects.particleEffect = 'shadow_wisps';
                bonuses.visualEffects.visibleToOthers = true; // Dark aura visible to others
                // Note: The soul drain penalty is applied in calculatePlayerStat
                // Note: Clone management happens in the main mining loop
                break;
                
            case 12: // Coal King's Crown
                bonuses.coalMastery += 0.8 * maintenanceRatio; // 80% coal mastery
                bonuses.darkPower += 0.6 * maintenanceRatio; // 60% dark power
                bonuses.sightThroughWalls += 5 * maintenanceRatio; // See through coal walls
                bonuses.hazardResistance += 0.3 * maintenanceRatio; // 30% hazard resistance
                // Ore value multipliers
                bonuses.oreValueMultipliers.coal = 3.0 * maintenanceRatio; // 3x coal value
                bonuses.oreValueMultipliers.anthracite = 3.0 * maintenanceRatio; // 3x anthracite value
                // Visual effects
                bonuses.visualEffects.aura = 'dark';
                bonuses.visualEffects.glowColor = '#2F2F2F';
                bonuses.visualEffects.particleEffect = 'coal_embers';
                // Minimap effects
                bonuses.minimapSystem.reducedVisibility = 0.2 * maintenanceRatio; // 20% reduced visibility
                break;
                
            case 13: // Solar Forge Hammer
                bonuses.solarMastery += 0.55 * maintenanceRatio; // 55% solar mastery
                bonuses.lightPower += 0.7 * maintenanceRatio; // 70% light power
                bonuses.chainMiningChance += 0.25 * maintenanceRatio; // 25% chain mining
                bonuses.movementSpeedBonus += 0.1 * maintenanceRatio; // 10% speed bonus
                // Ore value multipliers
                bonuses.oreValueMultipliers.topaz = 2.5 * maintenanceRatio; // 2.5x topaz value
                bonuses.oreValueMultipliers.crystal = 2.5 * maintenanceRatio; // 2.5x crystal value
                // Health regeneration
                bonuses.healthRegen += 0.01 * maintenanceRatio; // 1% health per minute
                // Visual effects
                bonuses.visualEffects.aura = 'light';
                bonuses.visualEffects.glowColor = '#FFD700';
                bonuses.visualEffects.particleEffect = 'solar_flare';
                break;
                
            case 14: // Diamond Heart
                bonuses.diamondMastery += 0.75 * maintenanceRatio; // 75% diamond mastery
                bonuses.resistance += 0.9 * maintenanceRatio; // 90% resistance
                bonuses.hazardResistance += 0.5 * maintenanceRatio; // 50% hazard resistance
                bonuses.lootMultiplier *= (1 + 0.3 * maintenanceRatio); // 30% loot multiplier
                // Ore value multipliers
                bonuses.oreValueMultipliers.diamond = 4.0 * maintenanceRatio; // 4x diamond value
                bonuses.oreValueMultipliers.gem = 4.0 * maintenanceRatio; // 4x gem value
                // Visual effects
                bonuses.visualEffects.aura = 'diamond';
                bonuses.visualEffects.glowColor = '#B9F2FF';
                bonuses.visualEffects.particleEffect = 'diamond_sparkle';
                break;
                
            case 15: // World Tree Branch
                bonuses.natureMastery += 0.65 * maintenanceRatio; // 65% nature mastery
                bonuses.lifePower += 0.8 * maintenanceRatio; // 80% life power
                bonuses.phaseWalkChance += 0.15 * maintenanceRatio; // 15% phase through walls
                bonuses.movementSpeedBonus += 0.2 * maintenanceRatio; // 20% speed bonus
                // Ore value multipliers
                bonuses.oreValueMultipliers.emerald = 3.0 * maintenanceRatio; // 3x emerald value
                bonuses.oreValueMultipliers.plant = 3.0 * maintenanceRatio; // 3x plant-based ore value
                // Health regeneration
                bonuses.healthRegen += 0.02 * maintenanceRatio; // 2% health per minute
                // Visual effects
                bonuses.visualEffects.aura = 'nature';
                bonuses.visualEffects.glowColor = '#00FF00';
                bonuses.visualEffects.particleEffect = 'leaf_swirl';
                break;
                
            case 16: // Volcanic Core
                bonuses.volcanicMastery += 0.7 * maintenanceRatio; // 70% volcanic mastery
                bonuses.firePower += 0.95 * maintenanceRatio; // 95% fire power
                bonuses.fireResistance += 1.0 * maintenanceRatio; // Complete fire immunity
                bonuses.areaDamageChance += 0.4 * maintenanceRatio; // 40% area damage
                // Ore value multipliers
                bonuses.oreValueMultipliers.ruby = 3.5 * maintenanceRatio; // 3.5x ruby value
                bonuses.oreValueMultipliers.fire = 3.5 * maintenanceRatio; // 3.5x fire-based ore value
                // Visual effects
                bonuses.visualEffects.aura = 'volcanic';
                bonuses.visualEffects.glowColor = '#FF4500';
                bonuses.visualEffects.particleEffect = 'lava_burst';
                break;
                
            case 17: // Cosmic Void Crystal
                bonuses.voidMastery += 0.9 * maintenanceRatio; // 90% void mastery
                bonuses.cosmicPower += 0.85 * maintenanceRatio; // 85% cosmic power
                bonuses.phaseWalkChance += 0.2 * maintenanceRatio; // 20% phase through walls
                bonuses.dodgeChance += 0.25 * maintenanceRatio; // 25% dodge chance
                // Ore value multipliers
                bonuses.oreValueMultipliers.cosmic = 2.0 * maintenanceRatio; // 2x cosmic value
                bonuses.oreValueMultipliers.void = 2.0 * maintenanceRatio; // 2x void ore value
                // Visual effects
                bonuses.visualEffects.aura = 'cosmic';
                bonuses.visualEffects.glowColor = '#8A2BE2';
                bonuses.visualEffects.particleEffect = 'cosmic_swirl';
                break;
                
            case 18: // Adamantine Storm
                bonuses.adamantineMastery += 0.95 * maintenanceRatio; // 95% adamantine mastery
                bonuses.stormPower += 0.85 * maintenanceRatio; // 85% storm power
                bonuses.chainMiningChance += 0.5 * maintenanceRatio; // 50% chain mining
                bonuses.electricResistance += 1.0 * maintenanceRatio; // Complete electric immunity
                bonuses.lightningImmunity = true; // Complete lightning stun immunity
                bonuses.stormMastery = 0.9 * maintenanceRatio; // 90% storm mastery
                // Ore value multipliers
                bonuses.oreValueMultipliers.adamantine = 5.0 * maintenanceRatio; // 5x adamantine value
                // Visual effects
                bonuses.visualEffects.aura = 'storm';
                bonuses.visualEffects.glowColor = '#00FFFF';
                bonuses.visualEffects.particleEffect = 'storm_lightning';
                break;
                
            case 19: // Iron Lord's Gauntlets
                bonuses.ironMastery += 0.7 * maintenanceRatio; // 70% iron mastery
                bonuses.strength += 0.8 * maintenanceRatio; // 80% strength
                bonuses.hazardResistance += 0.4 * maintenanceRatio; // 40% hazard resistance
                bonuses.durabilityDamageReduction += 0.5 * maintenanceRatio; // 50% less durability damage
                // Ore value multipliers
                bonuses.oreValueMultipliers.iron = 2.0 * maintenanceRatio; // 2x iron value
                bonuses.oreValueMultipliers.metal = 2.0 * maintenanceRatio; // 2x metal value
                // Machinery system
                bonuses.machinerySystem.canMagnetize = true;
                // Visual effects
                bonuses.visualEffects.aura = 'iron';
                bonuses.visualEffects.glowColor = '#2F4F4F';
                bonuses.visualEffects.particleEffect = 'iron_sparks';
                break;
                
            case 20: // Crystal Seer's Orb
                bonuses.crystalPower += 0.75 * maintenanceRatio; // 75% crystal power
                bonuses.divination += 0.85 * maintenanceRatio; // 85% divination
                bonuses.sightThroughWalls += 10 * maintenanceRatio; // See entire map
                bonuses.lootMultiplier *= (1 + 0.5 * maintenanceRatio); // 50% loot multiplier
                // Ore value multipliers
                bonuses.oreValueMultipliers.crystal = 3.0 * maintenanceRatio; // 3x crystal value
                bonuses.oreValueMultipliers.vision = 3.0 * maintenanceRatio; // 3x vision ore value
                // Visual effects
                bonuses.visualEffects.aura = 'crystal';
                bonuses.visualEffects.glowColor = '#E6E6FA';
                bonuses.visualEffects.particleEffect = 'crystal_visions';
                break;
                
            case 21: // Primordial Fossil
                bonuses.primordialPower += 0.8 * maintenanceRatio; // 80% primordial power
                bonuses.ancientWisdom += 0.9 * maintenanceRatio; // 90% ancient wisdom
                bonuses.movementSpeedBonus += 0.25 * maintenanceRatio; // 25% speed bonus
                bonuses.hazardResistance += 0.3 * maintenanceRatio; // 30% hazard resistance
                // Ore value multipliers
                bonuses.oreValueMultipliers.fossil = 4.0 * maintenanceRatio; // 4x fossil value
                bonuses.oreValueMultipliers.ancient = 4.0 * maintenanceRatio; // 4x ancient ore value
                // Visual effects
                bonuses.visualEffects.aura = 'ancient';
                bonuses.visualEffects.glowColor = '#8B4513';
                bonuses.visualEffects.particleEffect = 'ancient_energy';
                break;
                
            case 22: // Copper Conductor
                bonuses.copperMastery += 0.6 * maintenanceRatio; // 60% copper mastery
                bonuses.electricPower += 0.7 * maintenanceRatio; // 70% electric power
                bonuses.chainMiningChance += 0.3 * maintenanceRatio; // 30% chain mining
                bonuses.electricResistance += 1.0 * maintenanceRatio; // Complete electric immunity
                bonuses.lightningImmunity = true; // Complete lightning stun immunity
                bonuses.conductivity = 0.8 * maintenanceRatio; // 80% electrical conductivity
                // Ore value multipliers
                bonuses.oreValueMultipliers.copper = 1.5 * maintenanceRatio; // 1.5x copper value
                // Machinery system
                bonuses.machinerySystem.canConductElectricity = true;
                // Visual effects
                bonuses.visualEffects.aura = 'electric';
                bonuses.visualEffects.glowColor = '#FFD700';
                bonuses.visualEffects.particleEffect = 'electric_sparks';
                break;
                
            default:
                console.log(`[UNIQUE] Unknown unique item ID: ${itemId}`);
                break;
        }
    }
    
    // Cap bonuses at reasonable maximums
    bonuses.doubleOreChance = Math.min(bonuses.doubleOreChance, 0.5); // Max 50%
    bonuses.hazardResistance = Math.min(bonuses.hazardResistance, 0.95); // Max 95% (was 0.9)
    bonuses.movementSpeedBonus = Math.min(bonuses.movementSpeedBonus, 1.0); // Max 100% bonus
    bonuses.dodgeChance = Math.min(bonuses.dodgeChance, 0.5); // Max 50%
    bonuses.durabilityDamageReduction = Math.min(bonuses.durabilityDamageReduction, 0.9); // Max 90%
    bonuses.chainMiningChance = Math.min(bonuses.chainMiningChance, 1.0); // Max 100%
    bonuses.areaDamageChance = Math.min(bonuses.areaDamageChance, 1.0); // Max 100%
    bonuses.phaseWalkChance = Math.min(bonuses.phaseWalkChance, 0.5); // Max 50%
    bonuses.shadowTeleportChance = Math.min(bonuses.shadowTeleportChance, 0.2); // Max 20%
    bonuses.autoReviveChance = Math.min(bonuses.autoReviveChance, 1.0); // Max 100%
    bonuses.teamMiningBonus = Math.min(bonuses.teamMiningBonus, 0.5); // Max 50%
    bonuses.sightThroughWalls = Math.min(bonuses.sightThroughWalls, 20); // Max 20 tiles
    bonuses.lootMultiplier = Math.min(bonuses.lootMultiplier, 10); // Max 10x multiplier
    
    // Cap new ability bonuses
    bonuses.fireResistance = Math.min(bonuses.fireResistance, 1.0); // Max 100%
    bonuses.electricResistance = Math.min(bonuses.electricResistance, 1.0); // Max 100%
    bonuses.darkPower = Math.min(bonuses.darkPower, 1.0); // Max 100%
    bonuses.lightPower = Math.min(bonuses.lightPower, 1.0); // Max 100%
    bonuses.cosmicPower = Math.min(bonuses.cosmicPower, 1.0); // Max 100%
    bonuses.stormPower = Math.min(bonuses.stormPower, 1.0); // Max 100%
    bonuses.volcanicPower = Math.min(bonuses.volcanicPower, 1.0); // Max 100%
    bonuses.lifePower = Math.min(bonuses.lifePower, 1.0); // Max 100%
    bonuses.naturePower = Math.min(bonuses.naturePower, 1.0); // Max 100%
    bonuses.ancientWisdom = Math.min(bonuses.ancientWisdom, 1.0); // Max 100%
    bonuses.primordialPower = Math.min(bonuses.primordialPower, 1.0); // Max 100%
    bonuses.crystalPower = Math.min(bonuses.crystalPower, 1.0); // Max 100%
    bonuses.divination = Math.min(bonuses.divination, 1.0); // Max 100%
    bonuses.ironMastery = Math.min(bonuses.ironMastery, 1.0); // Max 100%
    bonuses.copperMastery = Math.min(bonuses.copperMastery, 1.0); // Max 100%
    bonuses.coalMastery = Math.min(bonuses.coalMastery, 1.0); // Max 100%
    bonuses.solarMastery = Math.min(bonuses.solarMastery, 1.0); // Max 100%
    bonuses.diamondMastery = Math.min(bonuses.diamondMastery, 1.0); // Max 100%
    bonuses.adamantineMastery = Math.min(bonuses.adamantineMastery, 1.0); // Max 100%
    bonuses.voidMastery = Math.min(bonuses.voidMastery, 1.0); // Max 100%
    bonuses.shadowLegion = Math.min(bonuses.shadowLegion, 5); // Max 5 clones
    bonuses.collectiveFortune = Math.min(bonuses.collectiveFortune, 1.0); // Max 100%
    bonuses.soulDrain = Math.min(bonuses.soulDrain, 0.5); // Max 50% (negative)
    bonuses.leadership = Math.min(bonuses.leadership, 1.0); // Max 100%
    bonuses.memory = Math.min(bonuses.memory, 0.5); // Max 50% (negative)
    bonuses.stealth = Math.min(bonuses.stealth, 1.0); // Max 100%
    bonuses.defense = Math.min(bonuses.defense, 1.0); // Max 100%
    bonuses.strength = Math.min(bonuses.strength, 1.0); // Max 100%
    bonuses.vitality = Math.min(bonuses.vitality, 1.0); // Max 100%
    bonuses.resistance = Math.min(bonuses.resistance, 1.0); // Max 100%
    bonuses.electricPower = Math.min(bonuses.electricPower, 1.0); // Max 100%
    bonuses.greed = Math.min(bonuses.greed, 1.0); // Max 100%
    bonuses.curse = Math.min(bonuses.curse, 0.5); // Max 50% (negative)
    bonuses.sanity = Math.min(bonuses.sanity, 0.5); // Max 50% (negative)
    bonuses.speed = Math.min(bonuses.speed, 1.0); // Max 100%
    
    // Log final bonuses for debugging
    if (bonuses.uniqueItems.length > 0) {
        console.log(`[UNIQUE] Final bonuses for player:`, {
            items: bonuses.uniqueItems.map(i => `${i.name} (${Math.round(i.maintenanceRatio * 100)}%)`),
            doubleOre: `${Math.round(bonuses.doubleOreChance * 100)}%`,
            hazardResist: `${Math.round(bonuses.hazardResistance * 100)}%`,
            speedBonus: `${Math.round(bonuses.movementSpeedBonus * 100)}%`
        });
    }
    
    return bonuses;
}

/**
 * Apply double ore bonus from unique items
 * @param {number} baseQuantity - Base ore quantity
 * @param {number} doubleOreChance - Chance to double ore
 * @param {Object} member - Discord member
 * @param {Array} eventLogs - Event logs array
 * @returns {number} Final quantity
 */
function applyDoubleOreBonus(baseQuantity, doubleOreChance, member, eventLogs, equippedItems = null) {
    if (doubleOreChance > 0 && Math.random() < doubleOreChance) {
        // Determine which unique item is causing the double ore effect
        let effectMessage = `💨 ${member.displayName}'s Blue Breeze doubles the ore yield!`; // Default fallback
        
        if (equippedItems) {
            // Check which unique item is equipped and causing the effect
            for (const [id, item] of Object.entries(equippedItems)) {
                if (!item.isUnique) continue;
                
                let itemId;
                if (typeof item.itemId === 'string' && item.itemId.startsWith('unique_')) {
                    itemId = parseInt(item.itemId.replace('unique_', ''));
                } else if (typeof item.itemId === 'number') {
                    itemId = item.itemId;
                } else {
                    continue;
                }
                
                // Map item IDs to their effect messages
                switch(itemId) {
                    case 9: // Blue Breeze
                        effectMessage = `💨 ${member.displayName}'s ${item.name} generates a powerful wind that doubles the ore yield!`;
                        break;
                    case 1: // The One Pick
                        effectMessage = `⚡ ${member.displayName}'s ${item.name} transmutes reality, doubling the ore!`;
                        break;
                    case 10: // Midas' Burden
                        effectMessage = `🥇 ${member.displayName}'s ${item.name} golden touch doubles the precious ore!`;
                        break;
                    case 4: // Greed's Embrace
                        effectMessage = `💰 ${member.displayName}'s ${item.name} manifests additional ore through pure avarice!`;
                        break;
                    case 2: // Earthshaker
                        effectMessage = `🐹 ${member.displayName}'s ${item.name} earth tremors reveal hidden ore deposits!`;
                        break;
                    default:
                        effectMessage = `✨ ${member.displayName}'s ${item.name} enhances the ore yield!`;
                        break;
                }
                break; // Use first unique item found
            }
        }
        
        eventLogs.push(effectMessage);
        return baseQuantity * 2;
    }
    return baseQuantity;
}

/**
 * Check if hazard should be resisted by unique items
 * @param {number} hazardResistance - Hazard resistance chance
 * @param {Object} member - Discord member
 * @param {Array} eventLogs - Event logs array
 * @returns {boolean} True if hazard was resisted
 */
function checkHazardResistance(hazardResistance, member, eventLogs) {
    if (hazardResistance > 0 && Math.random() < hazardResistance) {
        eventLogs.push(`🛡️ ${member.displayName}'s powerful wind barrier completely deflects the hazard!`);
        return true;
    }
    return false;
}

/**
 * Apply movement speed bonus
 * @param {number} baseActions - Base number of actions
 * @param {number} movementSpeedBonus - Speed bonus multiplier
 * @returns {number} Enhanced number of actions
 */
function applyMovementSpeedBonus(baseActions, movementSpeedBonus) {
    if (movementSpeedBonus > 0) {
        return Math.floor(baseActions * (1 + movementSpeedBonus));
    }
    return baseActions;
}

/**
 * Check if pickaxe should break (unique items never break)
 * @param {Object} pickaxe - Pickaxe item
 * @param {boolean} isUnique - Whether the pickaxe is unique
 * @returns {Object} Break check result
 */
function checkUniquePickaxeBreak(pickaxe, isUnique) {
    if (isUnique) {
        // Unique items never break
        return {
            shouldBreak: false,
            newDurability: pickaxe.currentDurability || 100,
            isUnique: true
        };
    }
    
    // Regular pickaxe breaking logic (unchanged)
    return null; // Let normal logic handle it
}

/**
 * Apply area damage from unique items like Earthshaker
 * @param {Object} position - Player position
 * @param {Object} mapData - Map data
 * @param {number} areaDamageChance - Chance for area damage
 * @param {Object} member - Discord member
 * @param {Array} eventLogs - Event logs array
 * @param {Object} dbEntry - Database entry for adding rewards
 * @param {Function} mineFromTile - Function to generate ore rewards
 * @param {Object} miningParams - Mining parameters (miningPower, luckStat, powerLevel, availableItems, efficiency)
 * @returns {number} Number of walls broken (always returns an integer)
 */
async function applyAreaDamage(position, mapData, areaDamageChance, member, eventLogs, dbEntry = null, mineFromTile = null, miningParams = {}) {
    if (areaDamageChance <= 0 || Math.random() > areaDamageChance) {
        return 0; // Always return integer for wallsBroken
    }
    
    const { TILE_TYPES } = require('./miningConstants_unified');
    const { addItemToMinecart } = require('./miningDatabase');
    
    let wallsBroken = 0;
    let oreWallsBroken = 0;
    const oreRewarded = [];
    
    const adjacentPositions = [
        { x: position.x - 1, y: position.y },
        { x: position.x + 1, y: position.y },
        { x: position.x, y: position.y - 1 },
        { x: position.x, y: position.y + 1 }
    ];
    
    for (const adj of adjacentPositions) {
        if (adj.x < 0 || adj.x >= mapData.width || 
            adj.y < 0 || adj.y >= mapData.height) {
            continue;
        }
        
        const tile = mapData.tiles[adj.y][adj.x];
        if (tile) {
            if (tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.WALL_WITH_ORE || tile.type === TILE_TYPES.RARE_ORE) {
                // Check if it's an ore wall and reward accordingly
                if ((tile.type === TILE_TYPES.WALL_WITH_ORE || tile.type === TILE_TYPES.RARE_ORE) && dbEntry && mineFromTile && miningParams.availableItems) {
                    try {
                        // Generate ore reward for this ore wall
                        const { item, quantity } = await mineFromTile(
                            member,
                            miningParams.miningPower || 0,
                            miningParams.luckStat || 0,
                            miningParams.powerLevel || 1,
                            tile.type,
                            miningParams.availableItems,
                            miningParams.efficiency || { valueMultiplier: 1 }
                        );
                        
                        // Apply Earthshaker bonus: 50% chance for double rewards from area damage
                        let finalQuantity = quantity;
                        if (Math.random() < 0.5) {
                            finalQuantity = quantity * 2;
                        }
                        
                        // Add to minecart
                        await addItemToMinecart(dbEntry, member.id, item.itemId, finalQuantity);
                        
                        oreRewarded.push({
                            item: item,
                            quantity: finalQuantity,
                            position: adj
                        });
                        
                        oreWallsBroken++;
                    } catch (error) {
                        console.error(`[EARTHSHAKER] Error generating ore reward:`, error);
                    }
                }
                
                // Convert to floor
                mapData.tiles[adj.y][adj.x] = { 
                    type: TILE_TYPES.FLOOR, 
                    discovered: true,
                    hardness: 0
                };
                wallsBroken++;
            }
        }
    }
    
    // Create detailed event message
    if (wallsBroken > 0) {
        let message = `💥 Earthshaker's tremor breaks ${wallsBroken} adjacent wall${wallsBroken > 1 ? 's' : ''}!`;
        
        if (oreWallsBroken > 0 && oreRewarded.length > 0) {
            // Group rewards by item
            const rewardSummary = {};
            for (const reward of oreRewarded) {
                const key = reward.item.name;
                if (!rewardSummary[key]) {
                    rewardSummary[key] = 0;
                }
                rewardSummary[key] += reward.quantity;
            }
            
            const rewardText = Object.entries(rewardSummary)
                .map(([name, qty]) => `${name} x${qty}`)
                .join(', ');
            
            message += ` Harvested: ${rewardText}`;
        }
        
        eventLogs.push(message);
    }
    
    // Always return integer for wallsBroken count
    // Ensure it's an integer even if calculation somehow produces non-integer
    return parseInt(wallsBroken) || 0;
}

/**
 * Check for chain mining effect
 * @param {Object} position - Original mining position
 * @param {Object} mapData - Map data
 * @param {number} chainMiningChance - Chance for chain mining
 * @param {Object} member - Discord member
 * @param {Array} eventLogs - Event logs array
 * @returns {Array} Additional positions to mine
 */
function getChainMiningTargets(position, mapData, chainMiningChance, member, eventLogs) {
    if (chainMiningChance <= 0 || Math.random() > chainMiningChance) {
        return [];
    }
    
    const { TILE_TYPES } = require('./miningConstants_unified');
    const targets = [];
    
    // Get one random adjacent ore wall
    const adjacentOres = [];
    const adjacentPositions = [
        { x: position.x - 1, y: position.y },
        { x: position.x + 1, y: position.y },
        { x: position.x, y: position.y - 1 },
        { x: position.x, y: position.y + 1 }
    ];
    
    for (const adj of adjacentPositions) {
        if (adj.x < 0 || adj.x >= mapData.width || 
            adj.y < 0 || adj.y >= mapData.height) {
            continue;
        }
        
        const tile = mapData.tiles[adj.y][adj.x];
        if (tile && (tile.type === TILE_TYPES.WALL_WITH_ORE || tile.type === TILE_TYPES.RARE_ORE)) {
            adjacentOres.push(adj);
        }
    }
    
    if (adjacentOres.length > 0) {
        const target = adjacentOres[Math.floor(Math.random() * adjacentOres.length)];
        targets.push(target);
        eventLogs.push(`⚡ Stormcaller's lightning chains to adjacent ore!`);
    }
    
    return targets;
}

/**
 * Apply durability damage reduction from unique items
 * @param {number} baseDamage - Base durability damage
 * @param {number} reduction - Damage reduction multiplier (0-1)
 * @returns {number} Reduced damage
 */
function applyDurabilityDamageReduction(baseDamage, reduction) {
    if (reduction > 0) {
        return Math.max(1, Math.floor(baseDamage * (1 - reduction)));
    }
    return baseDamage;
}

/**
 * Check for Shadowstep Boots random teleportation
 * @param {Object} position - Current player position
 * @param {Object} mapData - Map data
 * @param {number} teleportChance - Chance to teleport
 * @param {Object} member - Discord member
 * @param {Array} eventLogs - Event logs array
 * @returns {Object|null} New position if teleported, null otherwise
 */
function checkShadowstepTeleport(position, mapData, teleportChance, member, eventLogs) {
    if (teleportChance <= 0 || Math.random() > teleportChance) {
        return null;
    }
    
    const { TILE_TYPES } = require('./miningConstants_unified');
    
    // First, look for ore tiles that are in sight (discovered)
    const oreTiles = [];
    const floorTiles = [];
    
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            const tile = mapData.tiles[y]?.[x];
            if (!tile || !tile.discovered) continue;
            
            // Don't include current position
            if (x === position.x && y === position.y) continue;
            
            // Prioritize ore tiles (walls with ore, rare ore, treasure chests)
            if (tile.type === TILE_TYPES.WALL_WITH_ORE || 
                tile.type === TILE_TYPES.RARE_ORE || 
                tile.type === TILE_TYPES.TREASURE_CHEST) {
                oreTiles.push({ x, y, type: 'ore' });
            }
            // Fallback to floor tiles
            else if (tile.type === TILE_TYPES.FLOOR) {
                floorTiles.push({ x, y, type: 'floor' });
            }
        }
    }
    
    let destination = null;
    let teleportType = '';
    
    // Prioritize ore tiles if any are available
    if (oreTiles.length > 0) {
        destination = oreTiles[Math.floor(Math.random() * oreTiles.length)];
        teleportType = 'ore';
    }
    // Fallback to floor tiles if no ore tiles are available
    else if (floorTiles.length > 0) {
        destination = floorTiles[Math.floor(Math.random() * floorTiles.length)];
        teleportType = 'floor';
    }
    
    // No valid teleport destinations
    if (!destination) {
        return null;
    }
    
    // Calculate distance for the log message
    const distance = Math.abs(destination.x - position.x) + Math.abs(destination.y - position.y);
    
    // Create appropriate log message based on teleport type
    if (teleportType === 'ore') {
        eventLogs.push(`🌑 ${member.displayName} shadowsteps ${distance} tiles to a promising ore deposit in a blur of darkness!`);
    } else {
        eventLogs.push(`🌑 ${member.displayName} shadowsteps ${distance} tiles away in a blur of darkness!`);
    }
    
    return destination;
}

module.exports = {
    parseUniqueItemBonuses,
    applyDoubleOreBonus,
    checkHazardResistance,
    applyMovementSpeedBonus,
    checkUniquePickaxeBreak,
    applyAreaDamage,
    getChainMiningTargets,
    applyDurabilityDamageReduction,
    checkShadowstepTeleport
};
