const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('Generate a 10x10 hexagonal tile map'),

  async execute(interaction) {
    try {
      // Generate the hexagonal map
      const mapBuffer = await generateHexagonalMap();
      
      // Create attachment
      const attachment = new AttachmentBuilder(mapBuffer, { name: 'hexagonal_map.png' });
      
      // Send ephemeral response
      await interaction.reply({
        content: '🗺️ Here\'s your hexagonal map!',
        files: [attachment],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error generating map:', error);
      await interaction.reply({
        content: '❌ Unable to generate map.',
        ephemeral: true
      });
    }
  }
};

/**
 * Generate a 10x10 hexagonal tile map with white center and black surrounding tiles
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateHexagonalMap() {
  // Canvas settings
  const tileSize = 40; // Size of each hexagon
  const mapSize = 10; // 10x10 grid
  const padding = 20;
  
  // Calculate canvas dimensions for hexagonal grid
  // Hexagons are arranged in an offset grid pattern
  const hexWidth = tileSize * Math.sqrt(3);
  const hexHeight = tileSize * 2;
  const verticalSpacing = hexHeight * 0.75;
  
  const canvasWidth = Math.ceil(hexWidth * mapSize + hexWidth * 0.5) + padding * 2;
  const canvasHeight = Math.ceil(verticalSpacing * (mapSize - 1) + hexHeight) + padding * 2;
  
  // Create canvas
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  
  // Fill background with dark gray
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Center position (5,5 in 0-indexed 10x10 grid)
  const centerRow = 4;
  const centerCol = 4;
  
  // Draw hexagonal tiles
  for (let row = 0; row < mapSize; row++) {
    for (let col = 0; col < mapSize; col++) {
      // Calculate hexagon position
      const offsetX = (row % 2) * (hexWidth / 2); // Offset every other row
      const x = padding + col * hexWidth + offsetX + hexWidth / 2;
      const y = padding + row * verticalSpacing + hexHeight / 2;
      
      // Determine if this is the center tile
      const isCenter = (row === centerRow && col === centerCol);
      
      // Draw hexagon
      drawHexagon(ctx, x, y, tileSize, isCenter);
    }
  }
  
  return canvas.toBuffer('image/png');
}

/**
 * Draw a single hexagon
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} centerX - X coordinate of hexagon center
 * @param {number} centerY - Y coordinate of hexagon center
 * @param {number} size - Size of the hexagon
 * @param {boolean} isCenter - Whether this is the center tile (white)
 */
function drawHexagon(ctx, centerX, centerY, size, isCenter = false) {
  const angles = [];
  for (let i = 0; i < 6; i++) {
    angles.push((Math.PI / 3) * i);
  }
  
  // Begin path
  ctx.beginPath();
  
  // Move to first point
  const firstX = centerX + size * Math.cos(angles[0]);
  const firstY = centerY + size * Math.sin(angles[0]);
  ctx.moveTo(firstX, firstY);
  
  // Draw lines to other points
  for (let i = 1; i < 6; i++) {
    const x = centerX + size * Math.cos(angles[i]);
    const y = centerY + size * Math.sin(angles[i]);
    ctx.lineTo(x, y);
  }
  
  // Close path
  ctx.closePath();
  
  // Fill hexagon
  ctx.fillStyle = isCenter ? '#ffffff' : '#000000';
  ctx.fill();
  
  // Draw border
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1;
  ctx.stroke();
}
