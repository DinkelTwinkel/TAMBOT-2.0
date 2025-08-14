const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const vcSchema = new Schema({

	channelid: { type: String, required: true, unique: true },
	guildid: { type: String, required: true, unique: false },
	typeid: { type: Number, required: true, unique: false },

}, { timestamps: true });

const gachaVC = mongoose.model('activeVCs', vcSchema);
module.exports = gachaVC;