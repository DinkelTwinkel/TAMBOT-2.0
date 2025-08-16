const createMoneyProfile = require('./createCurrencyProfile');

module.exports = async (guild) => {
  try {
    await guild.members.fetch();

    for (const [userId, member] of guild.members.cache) {
      // Call your existing function to create if missing
      await createMoneyProfile(member, 5);
    }

    console.log('✅ Money profiles ensured for all members.');
  } catch (error) {
    console.error('❌ Error ensuring money profiles:', error);
  }
}