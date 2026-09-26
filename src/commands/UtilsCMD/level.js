const { AttachmentBuilder } = require('discord.js');
const { getTotalStats } = require('../Utils/StatsCalculator');
const { generateLevelCard } = require('../Utils/imageGenerator');
const rpgmanager = require('../../../database/rpgmanager');

module.exports = {
  name: 'level',
  deferReply: true,
  aliases: ['lvl'],
  description: 'Check your or another user\'s level',
  category: 'utl',
  usage: 'Zlevel `@user`',
  args: [
    { name: 'target', description: 'The user whose level to view', type: 'user', required: false },
  ],
  async execute(message, args) {
    const targetUser = message.mentions.users.first() || message.author;
    const targetMember = message.mentions.members?.find(member => member.id === targetUser.id)
      || (message.member?.id === targetUser.id ? message.member : null)
      || (message.guild ? await message.guild.members.fetch(targetUser.id).catch(() => null) : null);
    const stats = await getTotalStats(targetUser.id);
    const rank = await rpgmanager.getLevelRank(targetUser.id);
    const displayName = targetMember?.displayName || targetUser.globalName || targetUser.username;

    try {
      const imageBuffer = await generateLevelCard(targetUser, stats, displayName, rank);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'level.png' });
      return message.reply({ files: [attachment] });
    } catch (error) {
      console.error('Error generating level card:', error);
      return message.reply('Failed to generate level card.');
    }
  },
};
