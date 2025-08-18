const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const botMessage = new Schema({

    channelId: { type: String, required: true, unique: false },
    guildId: { type: String, required: true, unique: false },
    messageId: { type: String, required: true, unique: true },
    expireTime: { type: Date, required: true, default: 0},

}, { timestamps: true });

const bMessage = mongoose.model('botMessage', botMessage);
module.exports = bMessage;