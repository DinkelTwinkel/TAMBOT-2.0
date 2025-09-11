// Debug shop price issue
const itemSheet = require('./data/itemSheet.json');
const shopData = require('./data/shops.json');

console.log('=== SHOP DEBUG ===\n');

// Check if Coal Mine Trading Post exists
const coalShop = shopData.find(s => s.id === 1);
console.log('Coal Shop found:', !!coalShop);
if (coalShop) {
    console.log('Coal Shop name:', coalShop.name);
    console.log('Coal Shop itemPool:', coalShop.itemPool);
    console.log('Coal Shop staticItems:', coalShop.staticItems);
}

// Check if item 241 exists
const item241 = itemSheet.find(i => i.id === "241");
console.log('\nItem 241 found:', !!item241);
if (item241) {
    console.log('Item 241 details:', {
        id: item241.id,
        name: item241.name,
        value: item241.value,
        type: item241.type
    });
}

// Check validation function
function validateItemIds(itemIds) {
    return itemIds.filter(id => {
        const exists = itemSheet.some(item => item.id === String(id));
        if (!exists) {
            console.warn(`⚠️ Shop references non-existent item ID: ${id}`);
        }
        return exists;
    });
}

// Test validation with coal shop items
if (coalShop) {
    console.log('\nValidating coal shop items:');
    const validStatic = validateItemIds(coalShop.staticItems);
    const validPool = validateItemIds(coalShop.itemPool);
    
    console.log('Valid static items:', validStatic);
    console.log('Valid pool items:', validPool);
    console.log('Item 241 in pool:', coalShop.itemPool.includes(241));
    console.log('Item 241 validated:', validPool.includes(241));
}

console.log('\n=== DEBUG COMPLETE ===');
