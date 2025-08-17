const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const itemsheet = require('../data/itemSheet.json');
const { getMagentaCoordinates } = require('../fileStoreMapData');

// Register your custom font
// Place the font file (e.g., `myfont.ttf`) inside ./assets/fonts/
registerFont('./assets/font/goblinfont.ttf', { family: 'MyFont' });

/**
 * Generates a shop image by placing items on magenta points in a separate _itemmap image.
 * Each point gets a single item from itemData, in order.
 * Draws the item's cost text next to the item.
 *
 * @param {Object} shopData - Filtered shop entry from shops.json
 * @param {Array} itemData - Filtered items from itemsheet.json
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

    // Draw each item + cost
    const count = Math.min(points.length, itemData.length);
    for (let i = 0; i < count; i++) {
        const point = points[i];
        const itemId = itemData[i];
        const foundItemData = itemsheet.find(sheetItem => String(sheetItem.id) === String(itemId));

        if (!foundItemData || !foundItemData.image) continue;

        const img = await loadImage(`./assets/items/${foundItemData.image}.png`);
        const scale = shopData.itemDisplayScale;
        const newWidth = img.width * scale;
        const newHeight = img.height * scale;

        // Draw item
        ctx.drawImage(img, point.x - newWidth / 2, point.y - newHeight / 2, newWidth, newHeight);

        // Draw cost text
        if (foundItemData.value) {
            ctx.font = '15px "MyFont"'; // use your custom font family
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';

            const textX = point.x;
            const textY = point.y + newHeight / 2 + 10; // below the item

            ctx.strokeText(`${foundItemData.value}c`, textX, textY);
            ctx.fillText(`${foundItemData.value}c`, textX, textY);
        }
    }

    return canvas.toBuffer('image/png');
}

module.exports = generateShopImage;
