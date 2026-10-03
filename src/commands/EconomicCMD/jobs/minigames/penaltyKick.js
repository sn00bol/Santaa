const { sendCommandMessage } = require('../../../Utils/commandInteraction');
const { EmbedBuilder } = require('discord.js');
const { PenaltyKick_goal, PenaltyKick_saved } = require('../../../Utils/misc');

const DIRECTIONS = ['left', 'center', 'right'];

// Emoji representation for each direction slot
const SLOT_EMOJI = {
  left:   '⬅️',
  center: '⬆️',
  right:  '➡️',
};
const TEAM_GOAL_EMOJI = ['⚽🎉', '🏆', '🎊', '🔥'];

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build a 3-slot visual field row showing where the keeper dived and the ball went.
 * Each slot shows the GK (🧤) or empty (  ) under the direction arrow.
 * The ball (⚽) is shown separately on its own row.
 */
function buildFieldVisual(ballDir, keeperDir) {
  const slots = DIRECTIONS.map(dir => {
    const isKeeper = dir === keeperDir ? '🧤' : '⬜';
    const isBall   = dir === ballDir   ? '⚽' : '  ';
    return { isKeeper, isBall, arrow: SLOT_EMOJI[dir] };
  });

  const arrowRow  = slots.map(s => s.arrow).join('  ');
  const keeperRow = slots.map(s => s.isKeeper).join('  ');
  const ballRow   = slots.map(s => s.isBall).join('    ');

  return [
    '```',
    `   ${arrowRow}`,
    `   ${keeperRow}   ← GK`,
    `   ${ballRow}← Ball`,
    '```',
  ].join('\n');
}

module.exports = async function runPenaltyKick(message, dbManager, authorId) {
  const promptEmbed = new EmbedBuilder()
    .setTitle('⚽ Penalty Kick!')
    .setDescription(
      '🥅 **Step up to the spot!**\n\n' +
      'The crowd is silent. The keeper is ready.\n' +
      'Choose your direction to shoot:\n\n' +
      '> `left` ⬅️   `center` ⬆️   `right` ➡️'
    )
    .setColor('#0EA5E9')
    .setFooter({ text: 'You have 30 seconds to decide...' });

  await sendCommandMessage(message, { embeds: [promptEmbed] });

  const collected = await message.channel.awaitMessages({
    filter: (msg) => msg.author.id === authorId && DIRECTIONS.includes(msg.content.toLowerCase()),
    max: 1,
    time: 30000,
    errors: ['time']
  }).catch(() => null);

  if (!collected || collected.size === 0) {
    const timeoutEmbed = new EmbedBuilder()
      .setTitle('⚽ Penalty Kick — Timeout!')
      .setDescription('😰 You froze under pressure and never took the shot. No reward this round.')
      .setColor('#6B7280');
    return { embed: timeoutEmbed, success: false, summary: 'Mini-game fail: you hesitated at the spot.' };
  }

  const ballDir   = collected.first().content.toLowerCase();
  const keeperReads = Math.random() < 0.5;
  const keeperDir = keeperReads
    ? ballDir
    : DIRECTIONS.filter(dir => dir !== ballDir)[Math.floor(Math.random() * 2)];

  const scored  = ballDir !== keeperDir;
  const visual  = buildFieldVisual(ballDir, keeperDir);
  const teamGoal = getRandom(TEAM_GOAL_EMOJI);

  const embed = new EmbedBuilder()
    .setTitle(scored ? `⚽ GOAL! ${teamGoal}` : '🧤 Saved!')
    .setColor(scored ? '#16A34A' : '#DC2626');

  if (scored) {
    const flavorText = getRandom(PenaltyKick_goal);
    embed.setDescription(
      `${visual}\n` +
      `🎯 You shot **${ballDir}** | 🧤 Keeper dived **${keeperDir}**\n\n` +
      `✅ **${flavorText}**`
    );
    return { embed, success: true, summary: 'Mini-game win: the shot found the net.' };
  } else {
    const flavorText = getRandom(PenaltyKick_saved);
    embed.setDescription(
      `${visual}\n` +
      `🎯 You shot **${ballDir}** | 🧤 Keeper dived **${keeperDir}**\n\n` +
      `❌ **${flavorText}**`
    );
    return { embed, success: false, summary: 'Mini-game fail: the keeper saved it.' };
  }
};
