const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const voteSchema = new Schema({
    channelId: { type: String, required: true },
    userId: { type: String, required: true },
    targetId: { type: String, required: true, default: 'novote' },
}, { timestamps: true });

const Vote = mongoose.model('Vote', voteSchema);
module.exports = Vote;
