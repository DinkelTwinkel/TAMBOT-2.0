const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const moneySchema = new Schema({

	userid: { type: String, required: true, unique: true },
	username: { type: String, required: true, unique: true },
	money: { type: Number, required: true, unique: false, default: 0},

}, { timestamps: true });

const Money = mongoose.model('money', moneySchema);
module.exports = Money;