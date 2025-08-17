const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const itemsheet = require('../data/itemSheet.json');
const { getMagentaCoordinates } = require('../fileStoreMapData');

// Register fonts from files
// Place the font files inside ./assets/fonts/
registerFont('./assets/font/goblinfont.ttf', { family: 'MyFont' });

/**
 * Generates a shop image by placing items on magenta points in a separate _itemmap image.
 * Each point gets a single item from itemData, in order.
 * Draws the item's fluctuated cost text next to the item.
 *
 * @param {Object} shopData - Filtered shop entry from shops.json
 * @param {Array} itemData - Array of objects with itemId and fluctuated price: [{itemId: 1, price: 95}, ...]
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateShopImage(shopData, itemData) {
    const bgImage = await loadImage(`./assets/shops/${shopData.image}.png`);
    const canvas = createCanvas(bgImage.width, bgImage.height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Draw the background
    ctx.drawImage(bgImage, 0, 0);

    // Load the _itemmap image for detecting magenta points
    const itemMapPath = `${shopData.image}_item_map.png`;

    // Find magenta points
    const points = await getMagentaCoordinates(itemMapPath);

    if (points.length === 0 || itemData.length === 0) return canvas.toBuffer('image/png');

    // Draw each item + fluctuated cost
    const count = Math.min(points.length, itemData.length);
    for (let i = 0; i < count; i++) {
        const point = points[i];
        const itemWithPrice = itemData[i];
        
        // Handle both old format (just itemId) and new format (object with itemId and price)
        let itemId, fluctuatedPrice;
        if (typeof itemWithPrice === 'object' && itemWithPrice.itemId !== undefined) {
            // New format: {itemId: 1, price: 95}
            itemId = itemWithPrice.itemId;
            fluctuatedPrice = itemWithPrice.price;
        } else {
            // Old format fallback: just itemId
            itemId = itemWithPrice;
            const foundItemData = itemsheet.find(sheetItem => String(sheetItem.id) === String(itemId));
            fluctuatedPrice = foundItemData?.value || 0;
        }

        const foundItemData = itemsheet.find(sheetItem => String(sheetItem.id) === String(itemId));

        if (!foundItemData || !foundItemData.image) continue;

        const img = await loadImage(`./assets/items/${foundItemData.image}.png`);
        const scale = shopData.itemDisplayScale;
        const newWidth = img.width * scale;
        const newHeight = img.height * scale;

        // Draw item
        ctx.drawImage(img, point.x - newWidth / 2, point.y - newHeight / 2, newWidth, newHeight);

        // Draw fluctuated cost text
        if (fluctuatedPrice && fluctuatedPrice > 0) {
            ctx.font = '15px "MyFont"'; // use your custom font family
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';

            const textX = point.x;
            const textY = point.y + newHeight / 2 + 10; // below the item

            // Add price change indicator if different from base price
            const originalPrice = foundItemData.value;
            let priceText = `${fluctuatedPrice}c`;
            let showIndicator = false;
            let indicatorColor = '';
            let triangleUp = false;
            
            if (fluctuatedPrice > originalPrice) {
                showIndicator = true;
                indicatorColor = '#FF4444'; // Red for price increase
                triangleUp = true;
                ctx.fillStyle = '#FF4444';
            } else if (fluctuatedPrice < originalPrice) {
                showIndicator = true;
                indicatorColor = '#44FF44'; // Green for price decrease (cheaper)
                triangleUp = false;
                ctx.fillStyle = '#44FF44';
            } else {
                ctx.fillStyle = 'white'; // White for normal price
            }

            // Draw price text
            ctx.strokeText(priceText, textX, textY);
            ctx.fillText(priceText, textX, textY);

            // Draw triangle indicator if price changed
            if (showIndicator) {
                const priceWidth = ctx.measureText(priceText).width;
                const triangleX = textX + priceWidth / 2 + 8; // Position triangle after price text
                const triangleY = textY - 3; // Slightly above baseline to center with text
                const triangleSize = 5; // Size of the triangle
                
                ctx.fillStyle = indicatorColor;
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 1;
                
                ctx.beginPath();
                if (triangleUp) {
                    // Draw upward triangle (▲)
                    ctx.moveTo(triangleX, triangleY - triangleSize); // Top point
                    ctx.lineTo(triangleX - triangleSize, triangleY + triangleSize); // Bottom left
                    ctx.lineTo(triangleX + triangleSize, triangleY + triangleSize); // Bottom right
                } else {
                    // Draw downward triangle (▼)
                    ctx.moveTo(triangleX, triangleY + triangleSize); // Bottom point
                    ctx.lineTo(triangleX - triangleSize, triangleY - triangleSize); // Top left
                    ctx.lineTo(triangleX + triangleSize, triangleY - triangleSize); // Top right
                }
                ctx.closePath();
                
                // Fill and stroke the triangle
                ctx.fill();
                ctx.stroke();
                
                // Reset stroke width
                ctx.lineWidth = 3;
            }
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = generateShopImage;