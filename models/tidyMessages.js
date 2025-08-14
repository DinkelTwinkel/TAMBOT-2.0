const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const botMessage = new Schema({

    channelid: { type: String, required: true, unique: false },
    guildid: { type: String, required: true, unique: false },
    messageid: { type: String, required: true, unique: true },

}, { timestamps: true });

const bMessage = mongoose.model('botMessage', botMessage);
module.exports = bMessage;