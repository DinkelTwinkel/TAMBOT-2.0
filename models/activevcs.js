const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const vcSchema = new Schema({

	channelId: { type: String, required: true, unique: true },
	guildId: { type: String, required: true, unique: false },
	typeId: { type: String, required: true, unique: false },
	nextTrigger: {type: Date, required: true, unique: false },

}, { timestamps: true });

const gachaVC = mongoose.model('activeVCs', vcSchema);
module.exports = gachaVC;