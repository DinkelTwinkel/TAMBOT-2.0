const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  itemId: {
    type: String, // matches the 'id' in itemsheet.json
    required: true,
  },
  quantity: {
    type: Number,
    default: 0,
    min: 0,
  },
});

const playerInventorySchema = new mongoose.Schema({
  	playerId: {
		type: String, // Discord user ID or game player ID
		required: true,
		unique: true,
	},
		playerTag: {
		type: String, // Discord user ID or game player ID
		required: true,
		unique: true,
	},
	items: [inventoryItemSchema], // array of items with id + quantity
}, { timestamps: true });

module.exports = mongoose.model('PlayerInventory', playerInventorySchema);
