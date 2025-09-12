const { createCanvas, loadImage, registerFont } = require('canvas');
const GIFEncoder = require('gifencoder');
const path = require('path');
const fs = require('fs');

// Register the goblin font
registerFont('./assets/font/goblinfont.ttf', { family: 'GoblinFont' });

/**
 * Generate a marketplace shop image with player avatar, animated item, and price
 * @param {Object} itemData - Item data from itemSheet
 * @param {number} quantity - Quantity being sold
 * @param {number} pricePerItem - Price per item
 * @param {Object} seller - Discord user object
 * @param {Object} guildMember - Discord guild member object for role color
 * @returns {Promise<Buffer>} GIF image buffer
 */
async function generateMarketplaceImage(itemData, quantity, pricePerItem, seller, guildMember = null) {
    try {
        // Load the player shop background
        const backgroundPath = path.join(__dirname, '..', 'assets', 'shops', 'playerShop.png');
        if (!fs.existsSync(backgroundPath)) {
            throw new Error('playerShop.png not found');
        }
        
        const bgImage = await loadImage(backgroundPath);
        
        // Load item image if available
        let itemImage = null;
        const itemImagePath = path.join(__dirname, '..', 'assets', 'items', `${itemData.image}.png`);
        if (fs.existsSync(itemImagePath)) {
            try {
                itemImage = await loadImage(itemImagePath);
            } catch (itemError) {
                console.warn('Could not load item image:', itemError);
            }
        }
        
        // Load player avatar
        let avatarImage = null;
        try {
            const avatarUrl = seller.displayAvatarURL({ extension: 'png', size: 128 });
            avatarImage = await loadImage(avatarUrl);
        } catch (avatarError) {
            console.warn('Could not load player avatar:', avatarError);
        }
        
        // Get user's role color
        let roleColor = '#FFD700'; // Default gold
        if (guildMember && guildMember.displayHexColor && guildMember.displayHexColor !== '#000000') {
            roleColor = guildMember.displayHexColor;
        }
        
        // Animation settings
        const frames = 20;
        const hoverDistance = 8; // pixels to hover up and down
        const delay = 100; // ms between frames
        
        // Create GIF encoder
        const encoder = new GIFEncoder(bgImage.width, bgImage.height);
        encoder.start();
        encoder.setRepeat(0); // 0 for repeat, -1 for no-repeat
        encoder.setDelay(delay);
        encoder.setQuality(10);
        
        // Generate frames
        for (let frame = 0; frame < frames; frame++) {
            const canvas = createCanvas(bgImage.width, bgImage.height);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            
            // Draw background
            ctx.drawImage(bgImage, 0, 0);
            
            // Draw player avatar on the left
            if (avatarImage) {
                const avatarSize = 80;
                const avatarX = 60;
                const avatarY = bgImage.height / 2 - avatarSize / 2;
                
                // Draw circular avatar
                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
                ctx.restore();
                
                // Add a border around the avatar using role color
                ctx.strokeStyle = roleColor;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                // Draw placeholder avatar
                const avatarSize = 80;
                const avatarX = 60;
                const avatarY = bgImage.height / 2 - avatarSize / 2;
                
                ctx.fillStyle = '#4A4A4A';
                ctx.beginPath();
                ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '12px GoblinFont';
                ctx.textAlign = 'center';
                ctx.fillText(
                    seller.username.substring(0, 8), 
                    avatarX + avatarSize / 2, 
                    avatarY + avatarSize / 2 + 4
                );
            }
            
            // Calculate hovering animation for item
            const hoverOffset = Math.sin((frame / frames) * Math.PI * 2) * hoverDistance;
            const itemSize = 64;
            const centerX = bgImage.width / 2;
            const centerY = bgImage.height / 2 + hoverOffset;
            
            // Draw item with hover animation
            if (itemImage) {
                ctx.drawImage(
                    itemImage,
                    centerX - itemSize / 2,
                    centerY - itemSize / 2,
                    itemSize,
                    itemSize
                );
            } else {
                // Draw placeholder rectangle
                ctx.fillStyle = '#666666';
                ctx.fillRect(
                    centerX - itemSize / 2,
                    centerY - itemSize / 2,
                    itemSize,
                    itemSize
                );
                
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '12px GoblinFont';
                ctx.textAlign = 'center';
                
                // Split item name into multiple lines if more than 2 words
                const words = itemData.name.split(' ');
                if (words.length > 2) {
                    const firstLine = words.slice(0, Math.ceil(words.length / 2)).join(' ');
                    const secondLine = words.slice(Math.ceil(words.length / 2)).join(' ');
                    ctx.fillText(firstLine, centerX, centerY - 6);
                    ctx.fillText(secondLine, centerX, centerY + 6);
                } else {
                    ctx.fillText(itemData.name, centerX, centerY);
                }
            }
            
            // Draw individual price on the right side (lowered by 20 pixels)
            const priceText = `${pricePerItem}c`;
            
            // Position price on the right side, lowered by 20 pixels
            const priceX = bgImage.width - 100;
            const priceY = bgImage.height / 2 + 20; // Lowered by 20 pixels
            
            // Set up text styling for price
            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.font = '24px GoblinFont';
            ctx.textAlign = 'center';
            
            // Draw price
            ctx.strokeText(priceText, priceX, priceY);
            ctx.fillText(priceText, priceX, priceY);
            
            // Add quantity indicator if more than 1
            if (quantity > 1) {
                ctx.fillStyle = '#000000';
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.font = '16px GoblinFont';
                ctx.textAlign = 'center';
                
                const quantityText = `x${quantity}`;
                const textX = centerX + itemSize / 2 - 10;
                const textY = centerY + itemSize / 2 - 5;
                
                ctx.strokeText(quantityText, textX, textY);
                ctx.fillText(quantityText, textX, textY);
            }
            
            // Add frame to GIF
            encoder.addFrame(ctx);
        }
        
        encoder.finish();
        return encoder.out.getData();
        
    } catch (error) {
        console.error('[MARKETPLACE_IMAGE] Error generating marketplace GIF:', error);
        
        // Return a simple fallback PNG
        const canvas = createCanvas(400, 300);
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createLinearGradient(0, 0, 400, 300);
        gradient.addColorStop(0, '#4A4A4A');
        gradient.addColorStop(1, '#2A2A2A');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 300);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Marketplace', 200, 150);
        
        return canvas.toBuffer('image/png');
    }
}

module.exports = {
    generateMarketplaceImage
};
