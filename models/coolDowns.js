const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cooldownSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  cooldowns: {
    type: Map,
    of: Schema.Types.Mixed // Allow any type of value (Date, String, Object, etc.)
  },
  // Optional: Store gacha-specific data separately for cleaner organization
  gachaRollData: {
    channelId: { type: String, required: false },
    typeId: { type: Number, required: false },
    rolledAt: { type: Date, required: false },
    expiresAt: { type: Date, required: false }
  }
}, { timestamps: true });

module.exports = mongoose.model('Cooldown', cooldownSchema);