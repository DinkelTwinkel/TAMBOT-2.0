const { SlashCommandBuilder } = require('discord.js');
const mongoose = require('mongoose');
const Money = require('../models/currency'); // Adjust path as needed
const Inventory = require('../models/inventory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('givepick')
    .setDescription('Give coins to another user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to give coins to')
        .setRequired(true)),

  async execute(interaction) {
    const recipient = interaction.options.getUser('user');

    const inventory = new Inventory({ playerId: recipient.id , playerTag: recipient.tag, items: [] });

    // Add items to inventory
    const existing = inventory.items.find(it => it.itemId === '3');
    if (existing) {
        existing.quantity += 1;
    } else {
        const newItem = { itemId: '3', quantity: 1 };
        
          newItem.currentDurability = 100;
        
        inventory.items.push(newItem);
    }
    

    if (inventory.isNew) {
        await inventory.save();
    } else {
        inventory.markModified('items');
        await inventory.save();
    }

    interaction.reply('pickaxe given');

  }

};
