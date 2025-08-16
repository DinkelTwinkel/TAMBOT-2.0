const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const itemsheet = require('../data/itemSheet.json');

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
    const itemMapPath = `./assets/shops/${shopData.image}_itemmap.png`;
    if (!fs.existsSync(itemMapPath)) {
        console.warn(`Item map not found: ${itemMapPath}`);
        return canvas.toBuffer('image/png');
    }

    const itemMap = await loadImage(itemMapPath);
    const mapCanvas = createCanvas(itemMap.width, itemMap.height);
    const mapCtx = mapCanvas.getContext('2d');
    mapCtx.drawImage(itemMap, 0, 0);
    const mapData = mapCtx.getImageData(0, 0, itemMap.width, itemMap.height).data;

    // Find magenta points
    const points = [];
    const targetColor = { r: 255, g: 0, b: 255 }; // magenta
    const tolerance = 10;

    function colorMatch(r, g, b, target) {
        return Math.abs(r - target.r) <= tolerance &&
               Math.abs(g - target.g) <= tolerance &&
               Math.abs(b - target.b) <= tolerance;
    }

    for (let y = 0; y < itemMap.height; y++) {
        for (let x = 0; x < itemMap.width; x++) {
            const idx = (y * itemMap.width + x) * 4;
            const r = mapData[idx];
            const g = mapData[idx + 1];
            const b = mapData[idx + 2];
            const a = mapData[idx + 3];

            if (a > 0 && colorMatch(r, g, b, targetColor)) {
                points.push({ x, y });
            }
        }
    }

    console.log(`Found ${points.length} magenta points`);

    if (points.length === 0 || itemData.length === 0) return canvas.toBuffer('image/png');

    // Draw each item + cost
    const count = Math.min(points.length, itemData.length);
    for (let i = 0; i < count; i++) {
        const point = points[i];
        const itemId = itemData[i];
        const foundItemData = itemsheet.find(sheetItem => String(sheetItem.id) === String(itemId));

        if (!foundItemData || !foundItemData.image) continue;

        const img = await loadImage(`./assets/items/${foundItemData.image}.png`);
        const scale = 1;
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
