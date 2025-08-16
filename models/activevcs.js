const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const vcSchema = new Schema({
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    typeId: { type: String, required: true },
    nextTrigger: { type: Date, required: true },
    nextShopRefresh: { type: Date, required: true },
	nextLongBreak: { type: Date, required: true },
    // Optional flexible storage for special game modes
    gameData: { type: Schema.Types.Mixed, required: false }

}, { timestamps: true });

const gachaVC = mongoose.model('activeVCs', vcSchema);
module.exports = gachaVC;