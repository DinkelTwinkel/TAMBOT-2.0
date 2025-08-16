const { createCanvas, loadImage } = require('canvas');

/**
 * Generates a composite image:
 * - Places circular user avatars at random magenta points on a mask image
 * - Ensures avatars don't overlap (minDistance)
 * - Draws an extra "player holder" image beneath each avatar
 *
 * @param {object} channel - The voice channel object
 * @param {string} backgroundPath - Path to background image
 * @param {string} maskPath - Path to mask image with magenta points (255, 0, 255)
 * @param {string} holderPath - Path to holder image to draw beneath avatars
 * @param {number} scale - Scaling factor for avatar size (default = 1)
 * @param {number} minDistance - Minimum distance between avatars (default = 70)
 * @param {number} holderOffset - Vertical offset for holder image (default = 20, pushes it lower)
 * @returns {Buffer} Canvas buffer of final compiled image
 */
async function generateVoiceChannelImage(
    channel,
    backgroundPath,
    maskPath,
    holderPath,
    scale = 1,
    minDistance = 70,
    holderOffset = 20
) {
    if (!channel?.isVoiceBased()) throw new Error('Channel must be a voice channel');

    // Load background, mask, and holder
    const [background, mask, holder] = await Promise.all([
        loadImage(backgroundPath),
        loadImage(maskPath),
        loadImage(holderPath)
    ]);

    const canvas = createCanvas(background.width, background.height);
    const ctx = canvas.getContext('2d');

    // Scan mask for magenta pixels
    ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const candidates = [];

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const [r, g, b] = [data[idx], data[idx + 1], data[idx + 2]];
            if (r === 255 && g === 0 && b === 255) {
                candidates.push({ x, y });
            }
        }
    }

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

    // Draw avatars + holders
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
    }

    return canvas.toBuffer();
}

module.exports = generateVoiceChannelImage;
