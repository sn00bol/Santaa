const { AttachmentBuilder } = require('discord.js');
const { getTotalStats } = require('../Utils/StatsCalculator');
const { generateLevelCard } = require('../Utils/imageGenerator');

module.exports = {
  name: 'level',
  description: 'Check your or another user\'s level',
  category: 'utl',
  usage: 'Zlevel `@user`',
  async execute(message, args) {
    const targetUser = message.mentions.users.first() || message.author;
    const stats = await getTotalStats(targetUser.id);

    try {
      const imageBuffer = await generateLevelCard(targetUser, stats);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'level.png' });
      return message.reply({ files: [attachment] });
    } catch (error) {
      console.error('Error generating level card:', error);
      return message.reply('Failed to generate level card.');
    }
  },
};
