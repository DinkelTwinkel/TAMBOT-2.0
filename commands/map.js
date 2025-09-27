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
  const hexRadius = 30; // Radius of each hexagon (from center to vertex)
  const visibleMapSize = 9; // 9x9 visible grid (odd size for true center)
  const extendedMapSize = 13; // Extended grid to go beyond borders
  const padding = 0; // No padding - let tiles extend to edges
  
  // Calculate hexagon dimensions for proper tiling
  const hexWidth = hexRadius * 2 * Math.cos(Math.PI / 6); // Width of hexagon (flat-to-flat)
  const hexHeight = hexRadius * 2; // Height of hexagon (point-to-point)
  const verticalSpacing = hexHeight * 0.75; // Vertical spacing between row centers
  const horizontalSpacing = hexWidth; // Horizontal spacing between column centers
  
  // Calculate canvas dimensions based on visible area
  const canvasWidth = Math.ceil(horizontalSpacing * (visibleMapSize - 1) + hexWidth * 0.75);
  const canvasHeight = Math.ceil(verticalSpacing * (visibleMapSize - 1) + hexHeight);
  
  // Create canvas
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  
  // Fill background with dark gray
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Calculate offset to center the visible area within the extended grid
  const gridOffset = (extendedMapSize - visibleMapSize) / 2;
  
  // Center position in the extended grid
  const centerRow = Math.floor(extendedMapSize / 2);
  const centerCol = Math.floor(extendedMapSize / 2);
  
  // Draw hexagonal tiles with proper tessellation
  for (let row = 0; row < extendedMapSize; row++) {
    for (let col = 0; col < extendedMapSize; col++) {
      // Calculate hexagon center position for proper tiling
      // Every other row is offset by half the horizontal spacing
      const offsetX = (row % 2) * (horizontalSpacing / 2);
      const x = (col - gridOffset) * horizontalSpacing + offsetX + hexWidth / 2;
      const y = (row - gridOffset) * verticalSpacing + hexHeight / 2;
      
      // Determine if this is the center tile
      const isCenter = (row === centerRow && col === centerCol);
      
      // Draw hexagon (even if partially off-screen)
      drawHexagon(ctx, x, y, hexRadius, isCenter);
    }
  }
  
  return canvas.toBuffer('image/png');
}

/**
 * Draw a single hexagon
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} centerX - X coordinate of hexagon center
 * @param {number} centerY - Y coordinate of hexagon center
 * @param {number} radius - Radius of the hexagon (from center to vertex)
 * @param {boolean} isCenter - Whether this is the center tile (white)
 */
function drawHexagon(ctx, centerX, centerY, radius, isCenter = false) {
  // Begin path
  ctx.beginPath();
  
  // Draw hexagon with flat top (pointy sides)
  // Start from top vertex and go clockwise
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - (Math.PI / 2); // Start from top, rotate -90 degrees
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  // Close path
  ctx.closePath();
  
  // Fill hexagon
  ctx.fillStyle = isCenter ? '#ffffff' : '#000000';
  ctx.fill();
  
  // Draw border
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
