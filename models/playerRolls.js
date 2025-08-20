const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const eventQueueSchema = new Schema({

	channelId: { type: String, required: true, unique: false },
	eventId: { type: String, required: true, unique: false },
	typeId: { type: Number, required: true, unique: false },
	activationTime: { type: Date, required: true, unique: false },

}, { timestamps: true });

const EventQueue = mongoose.model('eventQueue', eventQueueSchema);
module.exports = EventQueue;