const { sendCommandMessage } = require('../../../Utils/commandInteraction');
const { EmbedBuilder } = require('discord.js');
const { HelperNPC_intro, NPC } = require('../../../Utils/misc');

function getRandomText(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = async function runHelperNPC(message, dbManager, authorId) {
  const npcName = NPC[Math.floor(Math.random() * NPC.length)] || 'a mysterious NPC';
  const promptEmbed = new EmbedBuilder()
    .setTitle('🧑‍💼 Helper Minigame')
    .setDescription(`${getRandomText(HelperNPC_intro).replace('NPC', npcName)}\n\n${npcName} needs your help. Choose how to respond: \`help\`, \`watch\`, or \`run\`.`)
    .setColor('#4F46E5');

  await sendCommandMessage(message, { embeds: [promptEmbed] });

  const collected = await message.channel.awaitMessages({
    filter: (msg) => msg.author.id === authorId && ['help', 'watch', 'run'].includes(msg.content.toLowerCase()),
    max: 1,
    time: 30000,
    errors: ['time']
  }).catch(() => null);

  if (!collected || collected.size === 0) {
    const timeoutEmbed = new EmbedBuilder()
      .setTitle('🧑‍💼 Helper Minigame')
      .setDescription('You took too long to choose. The NPC left disappointed.')
      .setColor('#4F46E5');
    return { embed: timeoutEmbed, success: false, summary: 'Mini-game timed out.' };
  }

  const choice = collected.first().content.toLowerCase();
  const outcome = ['gift', 'nothing', 'steal'];
  const result = outcome[Math.floor(Math.random() * outcome.length)];
  const embed = new EmbedBuilder()
    .setTitle('🧑‍💼 Helper Minigame')
    .setDescription(`You chose **${choice}** for ${npcName}.`)
    .setColor('#4F46E5');

  if (choice === 'help' && result === 'gift') {
    embed.addFields({ name: 'Result', value: 'The NPC is grateful and gives you a small reward. (+20🪙)' });
    return { embed, success: true, summary: 'Mini-game win: a grateful NPC paid you.' };
  }

  if (choice === 'watch' && result === 'nothing') {
    embed.addFields({ name: 'Result', value: 'You stay calm and the situation settles down without drama.' });
    return { embed, success: true, summary: 'Mini-game win: you stayed steady and kept the day calm.' };
  }

  if (choice === 'run' && result === 'steal') {
    embed.addFields({ name: 'Result', value: 'You flee, but the NPC turns the tables and steals some of your money. (-15🪙)' });
    return { embed, success: false, summary: 'Mini-game fail: the NPC tricked you.' };
  }

  embed.addFields({ name: 'Result', value: 'The NPC is disappointed and leaves you with nothing.' });
  return { embed, success: false, summary: 'Mini-game fail: the NPC was not impressed.' };
};
