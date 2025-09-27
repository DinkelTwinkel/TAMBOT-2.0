const { createCanvas, registerFont, loadImage } = require('canvas');
const TileMap = require('../models/TileMap');
const ActiveVCS = require('../models/activevcs');
const path = require('path');

// Register the goblin font (same as generateShopImage.js)
registerFont('./assets/font/goblinfont.ttf', { family: 'MyFont' });

/**
 * Map System - Handles tile map operations and rendering
 */

/**
 * Initialize or get tile map for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} TileMap document
 */
async function getOrCreateTileMap(guildId) {
  try {
    let tileMap = await TileMap.findOne({ guildId });
    if (!tileMap) {
      tileMap = await TileMap.initializeGuildMap(guildId);
      console.log(`🗺️ Initialized new tile map for guild ${guildId}`);
    }
    return tileMap;
  } catch (error) {
    console.error('Error getting/creating tile map:', error);
    throw error;
  }
}

/**
 * Reduce points of a specific tile
 * @param {string} guildId - Guild ID
 * @param {number} row - Tile row
 * @param {number} col - Tile column
 * @param {number} amount - Amount to reduce (positive number)
 * @returns {Promise<boolean>} Success status
 */
async function reduceTilePoints(guildId, row, col, amount) {
  try {
    const tileMap = await getOrCreateTileMap(guildId);
    const tile = tileMap.getTile(row, col);
    
    if (!tile) {
      console.log(`Tile (${row}, ${col}) not found in guild ${guildId}`);
      return false;
    }
    
    const newPoints = Math.max(0, tile.points - amount);
    const success = tileMap.updateTilePoints(row, col, newPoints);
    
    if (success) {
      await tileMap.save();
      console.log(`🗺️ Reduced tile (${row}, ${col}) points by ${amount}: ${tile.points} → ${newPoints}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error reducing tile points:', error);
    return false;
  }
}

/**
 * Increase points of a specific tile
 * @param {string} guildId - Guild ID
 * @param {number} row - Tile row
 * @param {number} col - Tile column
 * @param {number} amount - Amount to increase
 * @returns {Promise<boolean>} Success status
 */
async function increaseTilePoints(guildId, row, col, amount) {
  try {
    const tileMap = await getOrCreateTileMap(guildId);
    const tile = tileMap.getTile(row, col);
    
    if (!tile) {
      console.log(`Tile (${row}, ${col}) not found in guild ${guildId}`);
      return false;
    }
    
    const newPoints = tile.points + amount;
    const success = tileMap.updateTilePoints(row, col, newPoints);
    
    if (success) {
      await tileMap.save();
      console.log(`🗺️ Increased tile (${row}, ${col}) points by ${amount}: ${tile.points} → ${newPoints}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error increasing tile points:', error);
    return false;
  }
}

/**
 * Get tile information
 * @param {string} guildId - Guild ID
 * @param {number} row - Tile row
 * @param {number} col - Tile column
 * @returns {Promise<Object|null>} Tile data or null
 */
async function getTileInfo(guildId, row, col) {
  try {
    const tileMap = await getOrCreateTileMap(guildId);
    const tile = tileMap.getTile(row, col);
    return tile || null;
  } catch (error) {
    console.error('Error getting tile info:', error);
    return null;
  }
}

/**
 * Generate tile map image with point values and gacha servers
 * @param {string} guildId - Guild ID
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateTileMapImage(guildId, client = null) {
  try {
    const tileMap = await getOrCreateTileMap(guildId);
    
    // Get player data for gacha channels if client is provided
    let gachaPlayersData = {};
    if (client) {
      gachaPlayersData = await getGachaChannelPlayers(guildId, tileMap, client);
    }
    
    // Canvas settings
    const hexRadius = 30;
    const visibleMapSize = tileMap.mapSize;
    const extendedMapSize = visibleMapSize + 4; // Extended for border effect
    const padding = 0;
    
    // Calculate hexagon dimensions
    const hexWidth = hexRadius * 2 * Math.cos(Math.PI / 6);
    const hexHeight = hexRadius * 2;
    const verticalSpacing = hexHeight * 0.75;
    const horizontalSpacing = hexWidth;
    
    // Calculate canvas dimensions with extra padding to prevent cutoff
    const canvasWidth = Math.ceil(horizontalSpacing * (visibleMapSize - 1) + hexWidth * 1.5);
    const canvasHeight = Math.ceil(verticalSpacing * (visibleMapSize - 1) + hexHeight * 1.2);
    
    // Create canvas
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    
    // Fill background
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Calculate grid offset
    const gridOffset = (extendedMapSize - visibleMapSize) / 2;
    
    // Draw hexagonal tiles
    for (let row = 0; row < extendedMapSize; row++) {
      for (let col = 0; col < extendedMapSize; col++) {
        // Calculate position
        const offsetX = (row % 2) * (horizontalSpacing / 2);
        const x = (col - gridOffset) * horizontalSpacing + offsetX + hexWidth / 2;
        const y = (row - gridOffset) * verticalSpacing + hexHeight / 2;
        
        // Get actual tile data (if within map bounds)
        const actualRow = row - gridOffset;
        const actualCol = col - gridOffset;
        let tile = null;
        
        if (actualRow >= 0 && actualRow < visibleMapSize && actualCol >= 0 && actualCol < visibleMapSize) {
          tile = tileMap.getTile(actualRow, actualCol);
        }
        
        // Determine tile appearance
        const isCenter = tile && (actualRow === tileMap.centerRow && actualCol === tileMap.centerCol);
        const points = tile ? tile.points : 0;
        const hasGacha = tile && tile.gachaServerId;
        
        // Check if this is a frontier tile (0 points but adjacent to >0 points)
        let isFrontier = false;
        if (tile && points === 0) {
          const neighbors = getHexagonalNeighbors(actualRow, actualCol, tileMap.mapSize);
          isFrontier = neighbors.some(([nRow, nCol]) => {
            const neighborTile = tileMap.getTile(nRow, nCol);
            return neighborTile && neighborTile.points > 0;
          });
        }
        
        // Get players for this tile if it has a gacha server
        const tilePlayers = hasGacha && tile ? gachaPlayersData[tile.gachaServerId] || [] : [];
        
        // Draw hexagon
        await drawGameHexagon(ctx, x, y, hexRadius, isCenter, points, hasGacha, isFrontier, tilePlayers);
      }
    }
    
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error generating tile map image:', error);
    throw error;
  }
}

/**
 * Helper function to get hexagonal neighbors
 * @param {number} row - Row coordinate
 * @param {number} col - Column coordinate
 * @param {number} mapSize - Size of the map
 * @returns {Array} Array of neighbor coordinates
 */
function getHexagonalNeighbors(row, col, mapSize) {
  const neighbors = [];
  
  // Hexagonal grid neighbor offsets (depends on whether row is even or odd)
  const isEvenRow = row % 2 === 0;
  const offsets = isEvenRow ? [
    [-1, -1], [-1, 0],  // Top-left, Top-right
    [0, -1],  [0, 1],   // Left, Right
    [1, -1],  [1, 0]    // Bottom-left, Bottom-right
  ] : [
    [-1, 0],  [-1, 1],  // Top-left, Top-right
    [0, -1],  [0, 1],   // Left, Right
    [1, 0],   [1, 1]    // Bottom-left, Bottom-right
  ];
  
  for (const [dRow, dCol] of offsets) {
    const newRow = row + dRow;
    const newCol = col + dCol;
    
    // Check if neighbor is within map bounds
    if (newRow >= 0 && newRow < mapSize && newCol >= 0 && newCol < mapSize) {
      neighbors.push([newRow, newCol]);
    }
  }
  
  return neighbors;
}

/**
 * Draw a single hexagon with game information
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} centerX - X coordinate of hexagon center
 * @param {number} centerY - Y coordinate of hexagon center
 * @param {number} radius - Radius of the hexagon
 * @param {boolean} isCenter - Whether this is the center tile
 * @param {number} points - Point value of the tile
 * @param {boolean} hasGacha - Whether tile has a gacha server
 * @param {boolean} isFrontier - Whether this is a frontier tile (0 points adjacent to >0 points)
 * @param {Array} players - Array of player objects in this tile's gacha channel
 */
async function drawGameHexagon(ctx, centerX, centerY, radius, isCenter = false, points = 0, hasGacha = false, isFrontier = false, players = []) {
  // Begin path
  ctx.beginPath();
  
  // Draw hexagon
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - (Math.PI / 2);
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.closePath();
  
  // Fill hexagon based on point value and special states
  if (hasGacha) {
    // Gacha servers get orange background, but show influence with brightness
    if (points >= 100) {
      // High-influence gacha servers get brighter orange
      ctx.fillStyle = '#ff8c42';
    } else {
      ctx.fillStyle = '#ff6b35';
    }
  } else if (isFrontier) {
    // Frontier tiles (0 points adjacent to territory) are red
    ctx.fillStyle = '#cc0000';
  } else {
    // Calculate gradient color based on points (0 = black, 100 = white)
    const intensity = Math.min(points / 100, 1); // Normalize to 0-1 range
    const colorValue = Math.round(intensity * 255);
    ctx.fillStyle = `rgb(${colorValue}, ${colorValue}, ${colorValue})`;
  }
  
  ctx.fill();
  
  // Draw border
  ctx.strokeStyle = hasGacha ? '#ff6b35' : '#666666';
  ctx.lineWidth = hasGacha ? 2.5 : 1.5;
  ctx.stroke();
  
  // Draw point text on all tiles with >0 points
  if (points > 0) {
    // Text color based on 50-point threshold
    const textColor = points >= 50 ? '#000000' : '#ffffff'; // Black text if 50+, white text if below 50
    const strokeColor = points >= 50 ? '#ffffff' : '#000000'; // Opposite color for stroke
    
    ctx.font = '12px "MyFont"'; // Match generateShopImage.js style
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Show C (capital) and points for center tile, just points for all others
    const displayText = isCenter ? `C${points}` : points.toString();
    
    // Draw stroke first for better visibility (like generateShopImage.js)
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.strokeText(displayText, centerX, centerY);
    
    // Draw fill text on top
    ctx.fillStyle = textColor;
    ctx.fillText(displayText, centerX, centerY);
  }
  
  // Draw gacha indicator - show point value instead of G/I
  if (hasGacha) {
    ctx.font = '8px "MyFont"'; // Smaller font for the indicator
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Show point value for gacha servers
    const indicator = points.toString();
    
    // Draw stroke first for better visibility
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeText(indicator, centerX, centerY + 8);
    
    // Draw fill text on top
    ctx.fillStyle = '#ffffff';
    ctx.fillText(indicator, centerX, centerY + 8);
  }
}

/**
 * Get map statistics for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Map statistics
 */
async function getMapStats(guildId) {
  try {
    const tileMap = await getOrCreateTileMap(guildId);
    
    const totalTiles = tileMap.tiles.length;
    const totalPoints = tileMap.tiles.reduce((sum, tile) => sum + tile.points, 0);
    const averagePoints = totalTiles > 0 ? totalPoints / totalTiles : 0;
    const gachaTiles = tileMap.tiles.filter(tile => tile.gachaServerId).length;
    const availableForGacha = tileMap.tiles.filter(tile => tile.points < 20 && !tile.gachaServerId).length;
    
    return {
      totalTiles,
      totalPoints,
      averagePoints: Math.round(averagePoints * 100) / 100,
      gachaTiles,
      availableForGacha,
      centerTilePoints: tileMap.getTile(tileMap.centerRow, tileMap.centerCol)?.points || 0
    };
  } catch (error) {
    console.error('Error getting map stats:', error);
    return {
      totalTiles: 0,
      totalPoints: 0,
      averagePoints: 0,
      gachaTiles: 0,
      availableForGacha: 0,
      centerTilePoints: 0
    };
  }
}

/**
 * Remove gacha server from tile map when channel is deleted
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID to remove
 * @returns {Promise<boolean>} Success status
 */
async function removeGachaFromTileMap(guildId, channelId) {
  try {
    const tileMap = await TileMap.findOne({ guildId });
    if (!tileMap) {
      return false;
    }
    
    // Find tile with this gacha server
    const tile = tileMap.tiles.find(t => t.gachaServerId === channelId);
    if (!tile) {
      return false;
    }
    
    // Remove gacha server from tile
    const success = tileMap.removeGachaFromTile(tile.row, tile.col);
    if (success) {
      await tileMap.save();
      console.log(`🗺️ Removed gacha server ${channelId} from tile (${tile.row}, ${tile.col})`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error removing gacha from tile map:', error);
    return false;
  }
}

module.exports = {
  getOrCreateTileMap,
  reduceTilePoints,
  increaseTilePoints,
  getTileInfo,
  generateTileMapImage,
  getMapStats,
  removeGachaFromTileMap
};
