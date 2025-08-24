// models/inventory.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const inventoryItemSchema = new mongoose.Schema({
  itemId: { type: String }, // matches the 'id' in itemsheet.json
  id: { type: String }, // Alternative field name for backward compatibility  
  quantity: { type: Number, default: 0, min: 0 },
  durability: { type: Number, default: 0, min: 0 }, // This is the max durability (deprecated, kept for compatibility)
  currentDurability: { type: Number, min: 0 }, // Current durability of the item
}, { strict: false }); // Allow additional fields not in schema

const playerInventorySchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  playerTag: { type: String, required: false, unique: false  },
  items: [inventoryItemSchema],
  objectData: { type: Schema.Types.Mixed, required: false}
}, { timestamps: true });

// Unique per player per guild
playerInventorySchema.index({ playerId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('PlayerInventory', playerInventorySchema);
