const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true
    },
    channelId: {
        type: String,
        required: true
    },
    isSacrificing: {
        type: Boolean,
        required: true,
        default: false
    },
    sacrificeChannelId: {
        type: String,
        required: false
    },
    consumptionMessageId: {
        type: String,
        default: null
    },
    embedMessageId: {
        type: String,
        default: null
    },
    topTeethMessageId: {
        type: String,
        default: null
    },
    previousBurpMessageId: {
        type: String,
        default: null
    },
    botMessageIds: [{
        messageId: String,
        channelId: String
    }],
    totalGuildDevourPoints: {
        type: Number,
        default: 0
    },
    pendingImages: [{
        originalPath: String,
        authorUsername: String,
        authorId: String,
        processed: Boolean
    }],
    contributors: [{
        userId: String,
        username: String,
        contributions: Number,
        reward: Number,
        rewarded: Boolean
    }],
    lastProcessedMessageId: {
        type: String,
        default: null
    },
    sessionPoints: {
        type: Number,
        default: 0
    },
    totalMessagesConsumed: {
        type: Number,
        default: 0
    },
    totalImagesConsumed: {
        type: Number,
        default: 0
    },
    lastSacrificeTime: {
        type: Date,
        default: null
    },
    nextSacrificeTime: {
        type: Date,
        default: null
    },
    originalChannelName: {
        type: String,
        default: null
    },
    // Card minting data
    consumedMessages: [{
        messageId: String,
        content: String,
        authorId: String,
        authorName: String,
        timestamp: Date,
        reactions: Number
    }],
    mintedCards: [{
        cardId: String,
        tier: String,
        powerLevel: Number,
        imgurUrl: String,
        mintedAt: Date
    }]
});

// Create compound index for guild + channel uniqueness
// IMPORTANT: This allows multiple sacrifice channels per guild
// If you get duplicate key errors on guildId, run fixSacrificeIndex.js
guildConfigSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

// Ensure we don't create a unique index on just guildId
guildConfigSchema.index({ guildId: 1 }, { unique: false });

module.exports = mongoose.model('Sacrifice', guildConfigSchema);
