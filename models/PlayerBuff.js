const mongoose = require('mongoose');

const BuffSchema = new mongoose.Schema({
  name: { type: String, required: true },              // e.g. "Super Miner"
  effects: { type: Map, of: Number, required: true },  // e.g. { mining: 3, attack: 2 }
  expiresAt: { type: Date, required: true }            // Buff expiration timestamp
}, { _id: false }); // no separate _id for each buff

const PlayerBuffSchema = new mongoose.Schema({
  playerId: { type: String, required: true, unique: true }, // Discord user ID
  buffs: { type: [BuffSchema], default: [] }                // Array of buffs
}, {
  timestamps: true
});

module.exports = mongoose.model('PlayerBuff', PlayerBuffSchema);
