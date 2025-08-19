const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const itemSheet = require('../data/itemSheet.json');
const activeVCs = require('../models/activevcs');

// Register fonts if needed
try {
    registerFont('./assets/font/goblinfont.ttf', { family: 'MyFont' });
} catch (error) {
    console.log('Font registration skipped:', error.message);
}

/**
 * Seeded random number generator for consistent randomization
 */
function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

/**
 * Shuffle array using seeded random
 */
function shuffleArray(array, seed) {
    const shuffled = [...array];
    let currentSeed = seed;
    
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(currentSeed++) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
}

/**
 * Create an array of items based on their quantities
 */
function expandItemsByQuantity(minecartData) {
    const expandedItems = [];
    
    // Handle the actual data structure: { items: { '1': { quantity: 5, contributors: {...} }, ... } }
    const items = minecartData.items || minecartData;
    
    // If items is not an object or is empty, return empty array
    if (!items || typeof items !== 'object') {
        return expandedItems;
    }
    
    for (const [itemId, itemInfo] of Object.entries(items)) {
        // Skip non-item entries like 'contributors'
        if (!itemInfo || typeof itemInfo !== 'object' || !itemInfo.quantity) {
            continue;
        }
        
        const itemData = itemSheet.find(sheetItem => String(sheetItem.id) === String(itemId));
        if (!itemData) {
            console.warn(`Item with ID ${itemId} not found in itemSheet`);
            continue;
        }
        
        const quantity = itemInfo.quantity;
        
        // Add the item multiple times based on quantity
        for (let i = 0; i < quantity; i++) {
            expandedItems.push({
                ...itemData,
                originalQuantity: quantity
            });
        }
    }
    
    console.log(`Expanded ${expandedItems.length} total items from minecart`);
    return expandedItems;
}

/**
 * Load item image with fallback
 */
async function loadItemImage(item) {
    if (!item.image) return null;
    
    try {
        const imagePath = `./assets/items/${item.image}.png`;
        return await loadImage(imagePath);
    } catch (error) {
        console.warn(`Failed to load image for item ${item.name}: ${item.image}.png`);
        return null;
    }
}

/**
 * Draw an item at the specified position with the given size
 */
async function drawItem(ctx, item, x, y, size, rotation = 0, brightness = 1.0) {
    const img = await loadItemImage(item);
    
    ctx.save();
    
    // Apply rotation if specified
    if (rotation !== 0) {
        ctx.translate(x + size/2, y + size/2);
        ctx.rotate(rotation);
        ctx.translate(-(x + size/2), -(y + size/2));
    }
    
    if (img) {
        // Method 1: Simply use globalAlpha for fading (preserves transparency perfectly)
        // This makes items appear more transparent/faded as they go back
        ctx.globalAlpha = brightness;
        ctx.drawImage(img, x, y, size, size);
        ctx.globalAlpha = 1.0;
        
        // Alternative Method 2: If you want actual darkening instead of transparency,
        // uncomment the following code and comment out Method 1 above:
    
        // // Draw the image
        // ctx.drawImage(img, x, y, size, size);
        
        // // Apply darkening only to non-transparent pixels
        // if (brightness < 1.0) {
        //     ctx.save();
        //     ctx.globalCompositeOperation = 'source-atop';
        //     ctx.fillStyle = `rgba(0, 0, 0, ${1.0 - brightness})`;
        //     ctx.fillRect(x, y, size, size);
        //     ctx.restore();
        // }

    } else {
        // Apply brightness to placeholder as well
        ctx.globalAlpha = brightness;
        
        // Draw placeholder for items without images
        ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, size, size);
        ctx.strokeRect(x, y, size, size);
        
        // Draw item name
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.max(8, Math.floor(size * 0.2))}px "MyFont"`;
        
        // Word wrap for long names
        const words = item.name.split(' ');
        const maxWordsPerLine = 2;
        const lines = [];
        
        for (let i = 0; i < words.length; i += maxWordsPerLine) {
            lines.push(words.slice(i, i + maxWordsPerLine).join(' '));
        }
        
        const lineHeight = size * 0.25;
        const startY = y + size/2 - (lines.length - 1) * lineHeight/2;
        
        lines.forEach((line, index) => {
            const textY = startY + index * lineHeight;
            ctx.strokeText(line, x + size/2, textY);
            ctx.fillText(line, x + size/2, textY);
        });
        
        // Reset alpha
        ctx.globalAlpha = 1.0;
    }
    
    ctx.restore();
}

/**
 * Check if two rectangles overlap
 */
function checkOverlap(x1, y1, size1, x2, y2, size2, maxOverlapPercent = 0.15) {
    const overlap1 = size1 * maxOverlapPercent;
    const overlap2 = size2 * maxOverlapPercent;
    
    // Adjusted boundaries allowing for small overlap
    const left1 = x1 - overlap1;
    const right1 = x1 + size1 + overlap1;
    const top1 = y1 - overlap1;
    const bottom1 = y1 + size1 + overlap1;
    
    const left2 = x2 - overlap2;
    const right2 = x2 + size2 + overlap2;
    const top2 = y2 - overlap2;
    const bottom2 = y2 + size2 + overlap2;
    
    // Check if rectangles DON'T overlap
    if (right1 < left2 || right2 < left1 || bottom1 < top2 || bottom2 < top1) {
        return false;
    }
    
    return true;
}

/**
 * Place items randomly within a rectangular area
 */
function placeItemsInLayer(items, layerBounds, itemSize, seed, existingPlacements = []) {
    const placements = [];
    const maxAttempts = 100; // Max attempts to place each item
    let currentSeed = seed;
    
    for (const item of items) {
        let placed = false;
        let attempts = 0;
        
        while (!placed && attempts < maxAttempts) {
            // Random position within the layer bounds
            const x = layerBounds.x + seededRandom(currentSeed++) * (layerBounds.width - itemSize);
            const y = layerBounds.y + seededRandom(currentSeed++) * (layerBounds.height - itemSize);
            const rotation = (seededRandom(currentSeed++) - 0.5) * 0.5; // 15% rotation (about ±15 degrees)
            
            // Check overlap with existing placements in this layer
            let hasOverlap = false;
            for (const existing of placements) {
                if (checkOverlap(x, y, itemSize, existing.x, existing.y, existing.size)) {
                    hasOverlap = true;
                    break;
                }
            }
            
            // Also check overlap with previous layers (with more tolerance)
            if (!hasOverlap) {
                for (const existing of existingPlacements) {
                    if (checkOverlap(x, y, itemSize, existing.x, existing.y, existing.size, 0.3)) {
                        hasOverlap = true;
                        break;
                    }
                }
            }
            
            if (!hasOverlap) {
                placements.push({
                    item,
                    x,
                    y,
                    size: itemSize,
                    rotation
                });
                placed = true;
            }
            
            attempts++;
        }
        
        // Force placement if we couldn't find a spot (with slight offset to avoid complete overlap)
        if (!placed) {
            const x = layerBounds.x + seededRandom(currentSeed++) * (layerBounds.width - itemSize);
            const y = layerBounds.y + seededRandom(currentSeed++) * (layerBounds.height - itemSize);
            const rotation = (seededRandom(currentSeed++) - 0.5) * 0.26; // 15% rotation
            
            placements.push({
                item,
                x,
                y,
                size: itemSize,
                rotation
            });
        }
    }
    
    return placements;
}

/**
 * Main function to generate minecart image
 * @param {Object} channel - Discord channel object
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateMinecartImage(channel) {
    try {
        // Look up the channel in the activevcs collection
        const vcData = await activeVCs.findOne({ channelId: channel.id });
        
        if (!vcData || !vcData.gameData) {
            throw new Error('No active VC data found for this channel');
        }
        
        // Get minecart items from gameData
        const minecartData = vcData.gameData.minecartItems || vcData.gameData.minecart || null;

        console.log('Minecart data structure:', JSON.stringify(minecartData, null, 2));
        
        // Check if we have valid minecart data with items
        const hasItems = minecartData && minecartData.items && Object.keys(minecartData.items).length > 0;
        
        if (!hasItems) {
            console.log('No items found in minecart');
            // Still generate an empty minecart image
        }
        
        // Load the background image
        const bgImage = await loadImage('./assets/shops/coalMineShop_minecart.png');
        const canvas = createCanvas(bgImage.width, bgImage.height);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        // Draw the background
        ctx.drawImage(bgImage, 0, 0);
        
        if (hasItems) {
            // Expand items based on quantity
            const allItems = expandItemsByQuantity(minecartData);

            // Take a random selection of up to 100 items
            const seed = Date.now(); // Use timestamp as seed for randomization
            const shuffledItems = shuffleArray(allItems, seed);
            const selectedItems = shuffledItems.slice(0, Math.min(100, shuffledItems.length));
            
            // Define rectangular areas for each layer (adjust these based on your background image)
            // These values should be customized based on where the minecart is in your image
            const canvasWidth = bgImage.width;
            const canvasHeight = bgImage.height;
            
            // Layer 1 (furthest back, smallest items)
            const layer1Bounds = {
                x: canvasWidth * 0.20,  // Start 35% from left
                y: canvasHeight * 0.2,  // Start 40% from top
                width: canvasWidth * 0.65,  // 30% of canvas width
                height: canvasHeight * 0.65  // 15% of canvas height
            };
            const layer1ItemSize = 60; // Smallest size
            
            // Layer 2 (middle layer, medium items)
            const layer2Bounds = {
                x: canvasWidth * 0.10,   // Start 30% from left
                y: canvasHeight * 0.15, // Start 35% from top
                width: canvasWidth * 0.80,  // 40% of canvas width
                height: canvasHeight * 0.80  // 20% of canvas height
            };
            const layer2ItemSize = 100; // Medium size
            
            // Layer 3 (closest, largest items)
            const layer3Bounds = {
                x: canvasWidth * 0.025,  // Start 25% from left
                y: canvasHeight * 0.05,  // Start 30% from top
                width: canvasWidth * 0.9,  // 50% of canvas width
                height: canvasHeight * 0.9  // 30% of canvas height
            };
            const layer3ItemSize = 100; // Largest size
            
            // Calculate items per layer based on area capacity
            // Fill bottom layer first (90-100% capacity before moving up)
            const calculateLayerCapacity = (bounds, itemSize) => {
                const cols = Math.floor(bounds.width / (itemSize * 1.0)); // 1.1 for spacing
                const rows = Math.floor(bounds.height / (itemSize * 1.0));
                return cols * rows;
            };
            
            const layer1Capacity = calculateLayerCapacity(layer1Bounds, layer1ItemSize) * 2;
            const layer2Capacity = calculateLayerCapacity(layer2Bounds, layer2ItemSize);
            const layer3Capacity = calculateLayerCapacity(layer3Bounds, layer3ItemSize);
            
            // Fill layers from bottom to top, aiming for 90-100% capacity
            const layer1MaxItems = Math.floor(layer1Capacity * 1.2); // Target 95% fill
            const layer2MaxItems = Math.floor(layer2Capacity * 1.1);
            const layer3MaxItems = Math.floor(layer3Capacity * 0.95);
            
            let layer1Items = [];
            let layer2Items = [];
            let layer3Items = [];
            
            // Distribute items: fill layer 1 first, then 2, then 3
            if (selectedItems.length <= layer1MaxItems) {
                layer1Items = selectedItems;
            } else if (selectedItems.length <= layer1MaxItems + layer2MaxItems) {
                layer1Items = selectedItems.slice(0, layer1MaxItems);
                layer2Items = selectedItems.slice(layer1MaxItems);
            } else {
                layer1Items = selectedItems.slice(0, layer1MaxItems);
                layer2Items = selectedItems.slice(layer1MaxItems, layer1MaxItems + layer2MaxItems);
                layer3Items = selectedItems.slice(layer1MaxItems + layer2MaxItems);
            }
            
            console.log(`Layer distribution - L1: ${layer1Items.length}/${layer1MaxItems}, L2: ${layer2Items.length}/${layer2MaxItems}, L3: ${layer3Items.length}/${layer3MaxItems}`);
            
            // Place and draw items for each layer
            const allPlacements = [];
            
            // Layer 1 (back) - Darkest (60% brightness)
            const layer1Placements = placeItemsInLayer(layer1Items, layer1Bounds, layer1ItemSize, seed);
            for (const placement of layer1Placements) {
                await drawItem(ctx, placement.item, placement.x, placement.y, placement.size, placement.rotation, 0.6);
            }
            allPlacements.push(...layer1Placements);
            
            // Layer 2 (middle) - Medium brightness (80%)
            const layer2Placements = placeItemsInLayer(layer2Items, layer2Bounds, layer2ItemSize, seed + 1000, allPlacements);
            for (const placement of layer2Placements) {
                await drawItem(ctx, placement.item, placement.x, placement.y, placement.size, placement.rotation, 0.8);
            }
            allPlacements.push(...layer2Placements);
            
            // Layer 3 (front) - Full brightness (100%)
            const layer3Placements = placeItemsInLayer(layer3Items, layer3Bounds, layer3ItemSize, seed + 2000, allPlacements);
            for (const placement of layer3Placements) {
                await drawItem(ctx, placement.item, placement.x, placement.y, placement.size, placement.rotation, 1.0);
            }
            
            // // Add some sparkle effects for valuable items
            // ctx.save();
            // for (const placement of [...layer1Placements, ...layer2Placements, ...layer3Placements]) {
            //     // Add sparkles for high-value items
            //     if (placement.item.value > 50) {
            //         const sparkleCount = Math.min(3, Math.floor(placement.item.value / 50));
            //         ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    
            //         for (let i = 0; i < sparkleCount; i++) {
            //             const sparkleX = placement.x + Math.random() * placement.size;
            //             const sparkleY = placement.y + Math.random() * placement.size;
            //             const sparkleSize = Math.random() * 3 + 1;
                        
            //             ctx.beginPath();
            //             ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
            //             ctx.fill();
            //         }
            //     }
            // }
            ctx.restore();
        }
        
        // Return the final image buffer
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        console.error('Error generating minecart image:', error);
        
        // Return a basic minecart image on error
        try {
            const bgImage = await loadImage('./assets/shops/coalMineShop_minecart.png');
            const canvas = createCanvas(bgImage.width, bgImage.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bgImage, 0, 0);
            
            // Add error text
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Error loading minecart contents', canvas.width/2, canvas.height/2);
            
            return canvas.toBuffer('image/png');
        } catch (fallbackError) {
            throw fallbackError;
        }
    }
}

module.exports = generateMinecartImage;