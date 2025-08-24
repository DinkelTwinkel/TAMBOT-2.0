const fs = require('fs');
const path = require('path');

// Read the existing itemSheet.json
const itemSheetPath = path.join('D:', 'CODE', 'TAMBOT 2.0', 'data', 'itemSheet.json');
const itemSheet = JSON.parse(fs.readFileSync(itemSheetPath, 'utf8'));

// Define the missing items
const missingItems = [
  {
    "id": "101",
    "name": "Ancient Coin",
    "type": "mineLoot",
    "description": "A weathered coin from a forgotten civilization, still gleaming with mysterious power.",
    "value": 50,
    "vendable": false,
    "abilities": [],
    "image": "ancient_coin"
  },
  {
    "id": "102",
    "name": "Crystal Ore",
    "type": "mineLoot",
    "description": "A luminous crystalline formation that pulses with inner light.",
    "value": 65,
    "vendable": false,
    "abilities": [],
    "image": "crystal_ore"
  },
  {
    "id": "103",
    "name": "Ancient Fossil",
    "type": "mineLoot",
    "description": "Preserved remains of prehistoric creatures, embedded in stone.",
    "value": 20,
    "vendable": false,
    "abilities": [],
    "image": "ancient_fossil"
  },
  {
    "id": "104",
    "name": "Abyssal Relic",
    "type": "mineLoot",
    "description": "A dark artifact from the deepest depths, radiating otherworldly energy.",
    "value": 200,
    "vendable": false,
    "abilities": [],
    "image": "abyssal_relic"
  }
];

// Check which items are actually missing
const existingIds = new Set(itemSheet.map(item => item.id));
const itemsToAdd = missingItems.filter(item => !existingIds.has(item.id));

console.log(`Found ${itemsToAdd.length} items to add:`);
itemsToAdd.forEach(item => console.log(`  - ID ${item.id}: ${item.name}`));

if (itemsToAdd.length > 0) {
  // Add the missing items
  const updatedItemSheet = [...itemSheet, ...itemsToAdd];
  
  // Sort by ID (treating them as numbers)
  updatedItemSheet.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  
  // Write back to file
  fs.writeFileSync(itemSheetPath, JSON.stringify(updatedItemSheet, null, 2));
  
  console.log('\nSuccessfully added items to itemSheet.json');
  
  // Verify the items are now present
  const verifySheet = JSON.parse(fs.readFileSync(itemSheetPath, 'utf8'));
  const missingIds = ['101', '102', '103', '104'];
  const foundIds = missingIds.filter(id => verifySheet.find(item => item.id === id));
  console.log(`\nVerification: Found ${foundIds.length}/4 items in updated itemSheet.json`);
  foundIds.forEach(id => {
    const item = verifySheet.find(i => i.id === id);
    console.log(`  ✓ ID ${id}: ${item.name}`);
  });
} else {
  console.log('\nAll items already exist in itemSheet.json');
}