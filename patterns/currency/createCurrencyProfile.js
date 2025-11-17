const Money = require('../../models/currency'); // Adjust path accordingly

module.exports = async (member, amount) => {

  try {
    // Check if user already has a profile
    const existingProfile = await Money.findOne({ userId: member.id });
    if (existingProfile) {
      return existingProfile; // Or handle as you want (e.g. update amount)
    }

    // Handle both User and GuildMember objects
    // GuildMember has member.user.tag, User has member.tag directly
    const usertag = member.user ? member.user.tag : member.tag;

    // Create new profile with given amount
    const newProfile = new Money({
      userId: member.id,
      usertag: usertag,
      money: amount || 0
    });

    await newProfile.save();
    return newProfile;
  } catch (error) {
    console.error('Error creating money profile:', error);
    throw error;
  }

};