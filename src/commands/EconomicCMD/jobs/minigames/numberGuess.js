const { sendCommandMessage } = require('../../../Utils/commandInteraction');
const { EmbedBuilder } = require('discord.js');
const { GuessNum_intro, GuessNum_won, GuessNum_lost } = require('../../../Utils/misc');

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getHint(guess, secret) {
  const diff = Math.abs(guess - secret);
  if (diff === 0) return null; // correct
  if (diff === 1) return '🔥 **Burning hot!** You\'re just 1 away!';
  if (diff <= 3) return guess < secret ? '🌡️ **Warm!** Go a bit higher.' : '🌡️ **Warm!** Go a bit lower.';
  return guess < secret ? '🧊 **Too low!** Think higher.' : '🧊 **Too high!** Think lower.';
}

module.exports = async function runNumberGuess(message, dbManager, authorId) {
  const secret = Math.floor(Math.random() * 10) + 1; // 1–10
  const intro  = getRandom(GuessNum_intro);

  const promptEmbed = new EmbedBuilder()
    .setTitle('🔢 Number Guess!')
    .setDescription(
      `${intro}\n\n` +
      '🎯 I\'m thinking of a number between **1 and 10**.\n' +
      'You have **2 attempts**. Type your guess!'
    )
    .setColor('#F59E0B')
    .setFooter({ text: 'You have 30 seconds per guess.' });

  await sendCommandMessage(message, { embeds: [promptEmbed] });

  const isValidGuess = (msg) =>
    msg.author.id === authorId &&
    /^\d+$/.test(msg.content.trim()) &&
    parseInt(msg.content.trim()) >= 1 &&
    parseInt(msg.content.trim()) <= 10;

  // ── Attempt 1 ────────────────────────────────────────────────────────────
  const first = await message.channel.awaitMessages({
    filter: isValidGuess,
    max: 1,
    time: 30000,
  }).catch(() => null);

  if (!first || first.size === 0) {
    const timeoutEmbed = new EmbedBuilder()
      .setTitle('🔢 Number Guess — Timeout!')
      .setDescription(`😶 You ran out of time. The number was **${secret}**. No reward this round.`)
      .setColor('#6B7280');
    return { embed: timeoutEmbed, success: false, summary: 'the game timed out.' };
  }

  const guess1 = parseInt(first.first().content.trim());

  if (guess1 === secret) {
    const embed = new EmbedBuilder()
      .setTitle('🔢 Number Guess — ✅ Correct!')
      .setDescription(
        `🎯 You guessed **${guess1}** on the first try!\n\n` +
        `✨ ${getRandom(GuessNum_won)}`
      )
      .setColor('#16A34A');
    return { embed, success: true, summary: 'you nailed the number on attempt 1.' };
  }

  // Wrong — give hint and allow attempt 2
  const hint = getHint(guess1, secret);
  const hintEmbed = new EmbedBuilder()
    .setTitle('🔢 Number Guess — Wrong!')
    .setDescription(`❌ **${guess1}** is not it.\n\n${hint}\n\n🎯 One more chance — type your next guess!`)
    .setColor('#F59E0B');
  await sendCommandMessage(message, { embeds: [hintEmbed] });

  // ── Attempt 2 ────────────────────────────────────────────────────────────
  const second = await message.channel.awaitMessages({
    filter: isValidGuess,
    max: 1,
    time: 30000,
  }).catch(() => null);

  if (!second || second.size === 0) {
    const timeoutEmbed = new EmbedBuilder()
      .setTitle('🔢 Number Guess — Timeout!')
      .setDescription(`😶 You ran out of time on attempt 2. The number was **${secret}**. No reward.`)
      .setColor('#6B7280');
    return { embed: timeoutEmbed, success: false, summary: 'the game timed out on attempt 2.' };
  }

  const guess2 = parseInt(second.first().content.trim());

  if (guess2 === secret) {
    const embed = new EmbedBuilder()
      .setTitle('🔢 Number Guess — ✅ Correct!')
      .setDescription(
        `🎯 You guessed **${guess2}** on attempt 2!\n\n` +
        `✨ ${getRandom(GuessNum_won)}`
      )
      .setColor('#16A34A');
    return { embed, success: true, summary: 'you got the number on attempt 2.' };
  }

  // Both wrong
  const embed = new EmbedBuilder()
    .setTitle('🔢 Number Guess — ❌ Failed!')
    .setDescription(
      `Both guesses wrong. You tried **${guess1}** then **${guess2}**.\n` +
      `The number was **${secret}**. 😔\n\n` +
      `${getRandom(GuessNum_lost)}`
    )
    .setColor('#DC2626');
  return { embed, success: false, summary: 'both guesses were wrong.' };
};
