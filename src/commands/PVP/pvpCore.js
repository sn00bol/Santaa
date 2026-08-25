/**
 * Core PvP utilities for the Santaa Discord bot.
 * All functions are pure async and interact with the SQLite
 * databases via the existing dbmanager (balances) and rpgmanager (stats).
 */

const { EmbedBuilder } = require('discord.js');
const dbmanager = require('../../../database/dbmanager');
const rpgmanager = require('../../../database/rpgmanager');
const { getTotalStats } = require('../Utils/StatsCalculator');

/**
 * Apply defeat consequences to the loser.
 * - Set health and stamina to 0.
 * - Deduct a small amount of money from balance.
 * - Notify the channel.
 * - Start health/stamina regeneration.
 */
async function applyLosses(loserId, channel) {
  // Set health and stamina to 0
  await rpgmanager.updateStats(loserId, 0, 0);

  // Money loss (small amount, capped by balance)
  const user = await dbmanager.getUser(loserId);
  // Random loss between 50 and 200 (inclusive)
  const lossAmount = Math.min(user.balance, Math.floor(Math.random() * (200 - 50 + 1)) + 50);
  if (lossAmount > 0) {
    await dbmanager.removeMoney(loserId, lossAmount);
  }

  const lossEmbed = new EmbedBuilder()
    .setTitle('Defeat')
    .setDescription(
      `<@${loserId}> has been defeated! Health and stamina are now zero. ` +
      (lossAmount > 0 ? `Lost $${lossAmount.toLocaleString()} from their balance.` : 'No money was deducted.')
    )
    .setColor('#ff5555');
  await channel.send({ embeds: [lossEmbed] });

  // Start regeneration timer (10‑minute ticks)
  scheduleRegen(loserId, channel);

  return { lossAmount };
}

/**
 * Regenerate health and stamina for a user.
 * Increments of 10 every 10 minutes until both reach 100.
 * Uses setInterval; clears itself when full.
 */
function scheduleRegen(userId, channel) {
  const intervalMs = 10 * 60 * 1000; // 10 minutes
  const regenStep = 10;
  const timer = setInterval(async () => {
    const stats = await rpgmanager.getStats(userId);
    if (!stats) {
      clearInterval(timer);
      return;
    }
    let newHealth = Math.min(stats.health + regenStep, 100);
    let newStamina = Math.min(stats.stamina + regenStep, 100);
    await rpgmanager.updateStats(userId, newHealth, newStamina);
    const regenEmbed = new EmbedBuilder()
      .setDescription(`🔄 <@${userId}> regenerated +${regenStep} health and +${regenStep} stamina (now ${newHealth}/${newStamina}).`)
    await channel.send({ embeds: [regenEmbed] });
    if (newHealth >= 100 && newStamina >= 100) {
      clearInterval(timer);
      const doneEmbed = new EmbedBuilder()
        .setDescription(`✅ <@${userId}> has fully regenerated health and stamina.`)
      await channel.send({ embeds: [doneEmbed] });
    }
  }, intervalMs);
}

/**
 * Attempt to run away from a duel.
 * Success chance is 50% (can be tweaked).
 * On success: duel is cancelled.
 * On failure: lose 30% health and 20% stamina.
 * Returns true if escape succeeded.
 */
async function attemptRun(userId) {
  const success = Math.random() < 0.5; // 50% chance
  if (success) {
    return { success: true };
  }
  // Failure: lose health and stamina percentages
  const stats = await rpgmanager.getStats(userId);
  const newHealth = Math.max(0, Math.floor(stats.health * 0.7)); // lose 30%
  const newStamina = Math.max(0, Math.floor(stats.stamina * 0.8)); // lose 20%
  await rpgmanager.updateStats(userId, newHealth, newStamina);
  return {
    success: false,
    newHealth,
    newStamina,
  };
}

async function executeAttack(attackerId, defenderId) {
  const [attStats, defStats] = await Promise.all([
    getTotalStats(attackerId),
    getTotalStats(defenderId),
  ]);

  if (attStats.stamina < 15) {
    return { success: false, error: 'Not enough stamina!' };
  }

  const rawDamage = Math.floor(attStats.totalAttack + (Math.random() * 5));
  const damage = Math.max(1, rawDamage - defStats.totalDefense);
  const newDefHealth = Math.max(0, defStats.health - damage);
  const newAttStamina = Math.max(0, attStats.stamina - 15);

  await rpgmanager.updateStats(defenderId, newDefHealth, defStats.stamina);
  await rpgmanager.updateStats(attackerId, attStats.health, newAttStamina);

  const updatedDefStats = await getTotalStats(defenderId);
  const updatedAttStats = await getTotalStats(attackerId);

  return {
    success: true,
    damage,
    attackerStats: updatedAttStats,
    defenderStats: updatedDefStats,
    isDefeated: newDefHealth <= 0,
  };
}

/**
 * Award experience to the winner.
 * Logic: Gain 20 EXP per win. Every 100 EXP = 1 Level.
 * Level up increases Attack and Defense by 1.
 */
async function awardExperience(winnerId) {
  const stats = await rpgmanager.getStats(winnerId);
  let newExp = stats.exp + 20;
  let newLevel = stats.level;
  let newAttack = stats.attack;
  let newDefense = stats.defense;

  while (newExp >= newLevel * 100) {
    newExp -= newLevel * 100;
    newLevel++;
    newAttack++;
    newDefense++;
  }

  await rpgmanager.updateProgress(winnerId, {
    level: newLevel,
    exp: newExp,
    attack: newAttack,
    defense: newDefense
  });

  // Track PVP wins for achievements
  const newPvpWins = (stats.pvp_wins || 0) + 1;
  await rpgmanager.updateProgress(winnerId, { pvp_wins: newPvpWins });
  stats.pvp_wins = newPvpWins;
  const achievementChecker = require('../../minigames/achievement/achievementChecker');
  achievementChecker.checkPvp(winnerId, stats).catch(console.error);

  return { levelUp: newLevel > stats.level, newLevel };
}

/**
 * Record a completed PVP match to the history table.
 */
async function recordMatch(winnerId, loserId, expGained = 20, moneyLost = 0) {
  try {
    await rpgmanager.recordPvpResult(winnerId, loserId, expGained, moneyLost);
  } catch (e) {
    console.error('[pvpCore] Failed to record match result:', e);
  }
}

module.exports = {
  applyLosses,
  scheduleRegen,
  attemptRun,
  executeAttack,
  awardExperience,
  recordMatch,
};
