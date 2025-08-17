const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cooldownSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  cooldowns: {
    type: Map,
    of: Date // key: cooldown type, value: expiration Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Cooldown', cooldownSchema);