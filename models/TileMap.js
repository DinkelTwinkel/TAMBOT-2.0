const mongoose = require('mongoose');

// Individual tile schema
const TileSchema = new mongoose.Schema({
  row: {
    type: Number,
    required: true
  },
  col: {
    type: Number,
    required: true
  },
  points: {
    type: Number,
    default: 0,
    min: 0
  },
  gachaServerId: {
    type: String,
    default: null
  },
  lastModified: {
    type: Date,
    default: Date.now
  }
});

// Guild tile map schema
const TileMapSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  mapSize: {
    type: Number,
    default: 9 // 9x9 grid
  },
  centerRow: {
    type: Number,
    default: 4 // Center of 9x9 grid (0-indexed)
  },
  centerCol: {
    type: Number,
    default: 4 // Center of 9x9 grid (0-indexed)
  },
  tiles: [TileSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient tile lookups
TileMapSchema.index({ guildId: 1 });
TileMapSchema.index({ 'tiles.row': 1, 'tiles.col': 1 });
TileMapSchema.index({ 'tiles.points': 1 });
TileMapSchema.index({ 'tiles.gachaServerId': 1 });

// Update the updatedAt field on save
TileMapSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to initialize a new tile map for a guild
TileMapSchema.statics.initializeGuildMap = async function(guildId) {
  const mapSize = 9;
  const centerRow = 4;
  const centerCol = 4;
  
  // Create tiles array
  const tiles = [];
  for (let row = 0; row < mapSize; row++) {
    for (let col = 0; col < mapSize; col++) {
      const isCenter = (row === centerRow && col === centerCol);
      tiles.push({
        row: row,
        col: col,
        points: isCenter ? 100 : 0,
        gachaServerId: null,
        lastModified: new Date()
      });
    }
  }
  
  const tileMap = new this({
    guildId: guildId,
    mapSize: mapSize,
    centerRow: centerRow,
    centerCol: centerCol,
    tiles: tiles
  });
  
  return await tileMap.save();
};

// Instance method to get a specific tile
TileMapSchema.methods.getTile = function(row, col) {
  return this.tiles.find(tile => tile.row === row && tile.col === col);
};

// Instance method to update tile points
TileMapSchema.methods.updateTilePoints = function(row, col, newPoints) {
  const tile = this.getTile(row, col);
  if (tile) {
    tile.points = Math.max(0, newPoints); // Ensure points don't go below 0
    tile.lastModified = new Date();
    return true;
  }
  return false;
};

// Instance method to get tiles with points below threshold
TileMapSchema.methods.getTilesUnderThreshold = function(threshold = 20) {
  return this.tiles.filter(tile => tile.points < threshold);
};

// Instance method to attach gacha server to tile
TileMapSchema.methods.attachGachaToTile = function(row, col, gachaServerId) {
  const tile = this.getTile(row, col);
  if (tile && tile.points < 20) {
    tile.gachaServerId = gachaServerId;
    tile.lastModified = new Date();
    return true;
  }
  return false;
};

// Instance method to remove gacha server from tile
TileMapSchema.methods.removeGachaFromTile = function(row, col) {
  const tile = this.getTile(row, col);
  if (tile) {
    tile.gachaServerId = null;
    tile.lastModified = new Date();
    return true;
  }
  return false;
};

module.exports = mongoose.model('TileMap', TileMapSchema);
