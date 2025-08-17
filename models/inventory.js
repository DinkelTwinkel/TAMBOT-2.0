// models/inventory.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const inventoryItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true }, // matches the 'id' in itemsheet.json
  quantity: { type: Number, default: 0, min: 0 },
});

const playerInventorySchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  playerTag: { type: String, required: true },
  items: [inventoryItemSchema],
  objectData: { type: Schema.Types.Mixed, required: false }
}, { timestamps: true });

// Unique per player per guild
playerInventorySchema.index({ playerId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('PlayerInventory', playerInventorySchema);
