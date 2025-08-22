const mongoose = require('mongoose');

const playerProfileSchema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  profilePicture: {
    url: {
      type: String,
      default: null
    },
    messageId: {
      type: String,
      default: null
    },
    channelId: {
      type: String,
      default: null
    },
    guildId: {
      type: String,
      default: null
    },
    uploadedAt: {
      type: Date,
      default: null
    }
  },
  bio: {
    type: String,
    default: null,
    maxLength: 500
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Method to update profile picture
playerProfileSchema.methods.updateProfilePicture = async function(url, messageId, channelId, guildId) {
  this.profilePicture = {
    url,
    messageId,
    channelId,
    guildId,
    uploadedAt: new Date()
  };
  this.lastUpdated = new Date();
  return this.save();
};

// Method to clear profile picture
playerProfileSchema.methods.clearProfilePicture = async function() {
  this.profilePicture = {
    url: null,
    messageId: null,
    channelId: null,
    guildId: null,
    uploadedAt: null
  };
  this.lastUpdated = new Date();
  return this.save();
};

module.exports = mongoose.model('PlayerProfile', playerProfileSchema);
