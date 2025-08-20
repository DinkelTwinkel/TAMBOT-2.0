const { createCanvas, loadImage } = require('canvas');
const { scanMagentaPixels, getMagentaCoordinates } = require('../fileStoreMapData');
const gachaInfo = require('../data/gachaServers.json');
const gachaVC = require('../models/activevcs');
const getPlayerStats = require('./calculatePlayerStat');
const itemSheet = require('../data/itemSheet.json');

/**
 * Generates a composite image:
 * - Places circular user avatars at random magenta points on a mask image
 * - Ensures avatars don't overlap (minDistance)
 * - Draws an extra "player holder" image beneath each avatar
 * - Shows the player's best mining pickaxe next to their avatar
 *
 * @param {object} channel - The voice channel object
 * @param {string} backgroundPath - Path to background image
 * @param {string} maskName - Path to mask image with magenta points (255, 0, 255)
 * @param {string} holderPath - Path to holder image to draw beneath avatars
 * @param {number} scale - Scaling factor for avatar size (default = 1)
 * @param {number} minDistance - Minimum distance between avatars (default = 70)
 * @param {number} holderOffset - Vertical offset for holder image (default = 20, pushes it lower)
 * @returns {Buffer} Canvas buffer of final compiled image
 */
async function generateVoiceChannelImage(channel) {

    const result = await gachaVC.findOne({channelId: channel.id});
    const gachaVCInfo = gachaInfo.find(s => s.id === result.typeId);
    const backgroundPath =`./assets/gachaLocations/${gachaVCInfo.image}.png`;
    const maskName =`${gachaVCInfo.image}_character_map.png`;
    const holderPath =`./assets/gachaLocations/${gachaVCInfo.image}_legs.png`;
    const scale = 0.7;
    const minDistance = 70;
    const holderOffset = -20;

    if (!channel?.isVoiceBased()) throw new Error('Channel must be a voice channel');

    // Load background, mask, and holder
    const [background, holder] = await Promise.all([
        loadImage(backgroundPath),
        loadImage(holderPath)
    ]);

    const canvas = createCanvas(background.width, background.height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Scan mask for magenta pixels
    const candidates = await getMagentaCoordinates(maskName);

    // Shuffle candidate points
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Reset canvas with background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

    // Fetch voice channel members (excluding bots) and shuffle
    const members = channel.members.filter(m => !m.user.bot).map(m => m.user);
    for (let i = members.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [members[i], members[j]] = [members[j], members[i]];
    }

    const placedPoints = [];
    const results = [];

    // Pick valid points while keeping minDistance
    for (const candidate of candidates) {
        if (results.length >= members.length) break;
        if (placedPoints.some(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) < minDistance)) continue;

        placedPoints.push(candidate);
        results.push(candidate);
    }

    /**
     * Helper function to get player's equipped mining pickaxe using the new stat system
     */
    async function getEquippedMiningPickaxe(userId) {
        try {
            const playerData = await getPlayerStats(userId);
            
            // Look through equipped items for a tool with mining slot
            for (const [itemId, equippedItem] of Object.entries(playerData.equippedItems)) {
                if (equippedItem.type === 'tool' && equippedItem.slot === 'mining') {
                    // Get the full item data from itemSheet for the image
                    const itemData = itemSheet.find(i => String(i.id) === String(itemId));
                    if (itemData) {
                        // Find the mining ability from the equipped item's abilities
                        const miningAbility = equippedItem.abilities.find(a => a.name === 'mining');
                        return {
                            ...itemData,
                            equippedMiningPower: miningAbility ? miningAbility.power : 0
                        };
                    }
                }
            }
            
            return null; // No mining tool equipped
        } catch (error) {
            console.error(`Error getting equipped pickaxe for user ${userId}:`, error);
            return null;
        }
    }

    // Draw avatars + holders + pickaxes
    for (let i = 0; i < results.length; i++) {
        const user = members[i];
        const point = results[i];
        const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatar = await loadImage(avatarURL);

        const size = 64 * scale;
        const radius = size / 2;

        // Draw holder first (centered under avatar with vertical offset)
        const holderWidth = size * 1.2; // scale relative to avatar
        const holderHeight = holder.height * (holderWidth / holder.width);
        ctx.drawImage(holder, point.x - holderWidth / 2, point.y + radius + holderOffset, holderWidth, holderHeight);

        // Now draw avatar clipped circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(avatar, point.x - radius, point.y - radius, size, size);
        ctx.restore();

        // Get and draw the player's equipped mining pickaxe
        try {
            const equippedPickaxe = await getEquippedMiningPickaxe(user.id);
            if (equippedPickaxe && equippedPickaxe.image) {
                const pickaxeImagePath = `./assets/items/${equippedPickaxe.image}.png`;
                const pickaxeImage = await loadImage(pickaxeImagePath);
                
                // Position pickaxe to the right of the avatar
                const pickaxeSize = size * 1.3; // Make pickaxe smaller than avatar
                const pickaxeX = point.x - radius - 40; // 10px gap from avatar edge
                const pickaxeY = point.y - 20; // Center vertically with avatar
                
                // Draw pickaxe with slight transparency
                ctx.save();
                ctx.globalAlpha = 0.9;
                ctx.drawImage(pickaxeImage, pickaxeX, pickaxeY, pickaxeSize, pickaxeSize);
                ctx.restore();

                // Draw mining power level as text (using the equipped power from stat calculation)
                if (equippedPickaxe.equippedMiningPower > 0) {
                    ctx.save();
                    ctx.font = '15px "MyFont"';
                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;
                    ctx.textAlign = 'center';
                    
                    const powerText = `+${equippedPickaxe.equippedMiningPower}`;
                    const textX = point.x;
                    const textY = point.y - radius * 2 + 20;
                    
                    ctx.strokeText(powerText, textX, textY);
                    ctx.fillText(powerText, textX, textY);
                    ctx.restore();
                }
            }
        } catch (error) {
            console.error(`Error loading pickaxe for user ${user.username}:`, error);
            // Continue without pickaxe if there's an error
        }
    }

    return canvas.toBuffer();
}

module.exports = generateVoiceChannelImage;