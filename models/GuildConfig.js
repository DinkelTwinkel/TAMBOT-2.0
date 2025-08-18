const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    friendshipDiscordId: {
        type: String,
        default: null
    },
    gachaRollChannelIds: {
        type: [String],
        default: []
    },
    gachaParentCategoryIds: {
        type: [String],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    gachaCost: {
        type: Number,
        default: 0,
    }
});

// // Optional: auto-update updatedAt
// guildConfigSchema.pre('save', function(next) {
//     this.updatedAt = Date.now();
//     next();
// });

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
