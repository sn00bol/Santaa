const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { attemptRun, executeAttack, applyLosses, awardExperience, recordMatch } = require('./pvpCore'); // core logic
const { decideBotAction, applyTurn } = require('./botPvpLogic');
const { getBossProfiles, getBossProfile, createBossTrainer } = require('./bosses');
const rpgmanager = require('../../../database/rpgmanager');

/**
 * `Zpvp @user` – Challenge another user to a PvP duel.
 * Workflow:
 *   1️⃣ Challenger sends command with mention.
 *   2️⃣ Target can **Accept** via button.
 *   3️⃣ Challenger chooses who attacks first (Attacker / Defender).
 *   4️⃣ Attacker can **Attack** or **Run**.
 *   5️⃣ Attack → `resolveBattle` decides winner and applies defeat penalties.
 *   6️⃣ Run → 50 % chance to escape; on failure loses 30 % health & 20 % stamina.
 */
module.exports = {
  name: 'pvp',
  description: 'Challenge another user to a PvP duel',
  category: 'mie',
  usage: 'Zpvp `@user`/`boss`/`bot`',
  async execute(message) {
    const challenger = message.author;
    const args = message.content.slice(1).trim().split(/\s+/);
    const isBossMode = args.includes('boss') || args.includes('bot');
    const targetUser = message.mentions.users.first();

    if (isBossMode) {
      return this.executeBossFight(message, challenger, args);
    }

    if (!targetUser) {
      return message.reply('You must mention a user to challenge. Example: Zpvp `@user`');
    }
    if (targetUser.id === challenger.id) {
      return message.reply('You cannot challenge yourself.');
    }

    // ---------- Challenge embed ----------
    const challengeEmbed = new EmbedBuilder()
      .setTitle('⚔️ PvP Challenge')
      .setDescription(`${challenger} has challenged ${targetUser} to a duel! ${targetUser}, click ✅ to accept.`)
    const acceptBtn = new ButtonBuilder()
      .setCustomId(`pvp_accept_${challenger.id}_${targetUser.id}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');
    const challengeRow = new ActionRowBuilder().addComponents(acceptBtn);
    const challengeMsg = await message.channel.send({ embeds: [challengeEmbed], components: [challengeRow] });

    // ---------- Wait for target to accept ----------
    const acceptFilter = i => i.customId.startsWith('pvp_accept') && i.user.id === targetUser.id;
    const acceptCollector = challengeMsg.createMessageComponentCollector({ filter: acceptFilter, time: 60000, max: 1 });

    acceptCollector.on('collect', async i => {
      try {
        if (!i.deferred && !i.replied) {
          await i.deferUpdate();
        }
      } catch (error) {
        console.warn('[pvp] Failed to defer accept interaction:', error);
      }

      // Disable accept button
      const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(acceptBtn).setDisabled(true));
      await i.update({ embeds: [challengeEmbed.setDescription(`${challenger} vs ${targetUser} — duel started!`)], components: [disabledRow] });

      // ---------- Choose who attacks first ----------
      const chooseEmbed = new EmbedBuilder()
        .setTitle('🗡️ Choose Attacker')
        .setDescription('Who will attack first?')
        .setColor('#ffcc00');
      const challengerFirstBtn = new ButtonBuilder()
        .setCustomId(`pvp_first_${challenger.id}_${targetUser.id}_challenger`)
        .setLabel('I attack first')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚔️');
      const targetFirstBtn = new ButtonBuilder()
        .setCustomId(`pvp_first_${challenger.id}_${targetUser.id}_target`)
        .setLabel('Opponent attacks first')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🛡️');
      const chooseRow = new ActionRowBuilder().addComponents(challengerFirstBtn, targetFirstBtn);
      const chooseMsg = await message.channel.send({ embeds: [chooseEmbed], components: [chooseRow] });

      const chooseFilter = i => i.customId.startsWith('pvp_first') && i.user.id === challenger.id; // only challenger decides
      const chooseCollector = chooseMsg.createMessageComponentCollector({ filter: chooseFilter, time: 60000, max: 1 });

      chooseCollector.on('collect', async choiceInt => {
        try {
          if (!choiceInt.deferred && !choiceInt.replied) {
            await choiceInt.deferUpdate();
          }
        } catch (error) {
          console.warn('[pvp] Failed to defer attacker selection interaction:', error);
        }

        // Disable choice buttons
        const disabledChoose = new ActionRowBuilder().addComponents(
          ButtonBuilder.from(challengerFirstBtn).setDisabled(true),
          ButtonBuilder.from(targetFirstBtn).setDisabled(true)
        );
        await choiceInt.update({ components: [disabledChoose] });

        const parts = choiceInt.customId.split('_'); // pvp_first_challengerId_targetId_who
        const whoFirst = parts[4]; // 'challenger' or 'target'
        const attackerId = whoFirst === 'challenger' ? challenger.id : targetUser.id;
        const defenderId = whoFirst === 'challenger' ? targetUser.id : challenger.id;

        // ---------- Turn-Based Combat Loop ----------
        let battleOver = false;
        let currentTurnId = attackerId;

        const getStatBar = (val, max = 100) => {
          const filled = Math.round((val / max) * 10);
          return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${val}/${max}`;
        };

        const createCombatEmbed = async (turnId, p1Id, p2Id, lastAction = '') => {
          const p1Stats = await require('../../../database/rpgmanager').getStats(p1Id);
          const p2Stats = await require('../../../database/rpgmanager').getStats(p2Id);

          return new EmbedBuilder()
            .setTitle('⚔️ Turn-Based Duel')
            .setDescription(`**Current Turn:** <@${turnId}>\n\n` +
              `<@${p1Id}>\nHP: ${getStatBar(p1Stats.health)}\nST: ${getStatBar(p1Stats.stamina)}\n\n` +
              `<@${p2Id}>\nHP: ${getStatBar(p2Stats.health)}\nST: ${getStatBar(p2Stats.stamina)}\n\n` +
              (lastAction ? `*${lastAction}*` : 'Choose your action:'))
            .setColor(turnId === p1Id ? '#ff5555' : '#5555ff');
        };

        const attackBtn = new ButtonBuilder()
          .setCustomId(`pvp_attack`)
          .setLabel('Attack')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚔️');
        const runBtn = new ButtonBuilder()
          .setCustomId(`pvp_run`)
          .setLabel('Run')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🏃');
        const actionRow = new ActionRowBuilder().addComponents(attackBtn, runBtn);

        let combatMsg = await message.channel.send({
          embeds: [await createCombatEmbed(currentTurnId, attackerId, defenderId)],
          components: [actionRow]
        });

        while (!battleOver) {
          // Check if the current player has 0 stamina - if so, they lose immediately
          const currentStats = await rpgmanager.getStats(currentTurnId);
          if (currentStats.stamina <= 0) {
            const winnerId = currentTurnId === attackerId ? defenderId : attackerId;
            const loserId = currentTurnId;

            await combatMsg.edit({
              embeds: [new EmbedBuilder().setTitle('Exhausted!').setDescription(`<@${loserId}> has run out of stamina and cannot fight! <@${winnerId}> wins by default.`).setColor('#ff0000')],
              components: []
            });

            const lossData = await applyLosses(loserId, message.channel);
            const expResult = await awardExperience(winnerId);
            const moneyLost = lossData?.lossAmount ?? 0;
            await recordMatch(winnerId, loserId, 20, moneyLost);
            const winMsg = expResult.levelUp
              ? `🎉 <@${winnerId}> won by exhaustion and LEVELED UP to ${expResult.newLevel}!`
              : `🏆 <@${winnerId}> won by exhaustion!`;
            await message.channel.send({ content: winMsg });

            battleOver = true;
            continue;
          }

          const actionFilter = i => i.customId.startsWith('pvp_') && i.user.id === currentTurnId;

          const actionCollector = combatMsg.createMessageComponentCollector({ filter: actionFilter, time: 60000, max: 1 });

          const collected = await new Promise(resolve => {
            actionCollector.on('collect', async i => {
              try {
                if (!i.deferred && !i.replied) {
                  await i.deferUpdate();
                }
              } catch (error) {
                console.warn('[pvp] Failed to defer interaction:', error);
              }
              resolve(i);
            });
            actionCollector.on('end', (coll, reason) => {
              if (reason === 'time' && coll.size === 0) resolve(null);
            });
          });

          if (!collected) {
            await combatMsg.edit({
              embeds: [new EmbedBuilder().setTitle('Duel Timeout').setDescription('No action was taken in time. Duel cancelled.')],
              components: []
            });
            break;
          }

          if (collected.customId === 'pvp_run') {
            const runResult = await attemptRun(currentTurnId);
            if (runResult.success) {
              await combatMsg.edit({
                embeds: [new EmbedBuilder().setTitle('Escape Successful').setDescription(`<@${currentTurnId}> managed to flee the duel!`)],
                components: []
              });
              battleOver = true;
            } else {
              const msg = `<@${currentTurnId}> tried to run but failed! Lost 30% HP and 20% ST.`;
              const nextTurnId = currentTurnId === attackerId ? defenderId : attackerId;
              await combatMsg.edit({
                embeds: [await createCombatEmbed(nextTurnId, attackerId, defenderId, msg)],
                components: [actionRow]
              });
              currentTurnId = nextTurnId;
            }
          } else if (collected.customId === 'pvp_attack') {
            const targetId = currentTurnId === attackerId ? defenderId : attackerId;
            const attackResult = await executeAttack(currentTurnId, targetId);

            if (!attackResult.success) {
              const msg = `❌ ${attackResult.error}`;
              const nextTurnId = currentTurnId === attackerId ? defenderId : attackerId;
              await combatMsg.edit({
                embeds: [await createCombatEmbed(nextTurnId, attackerId, defenderId, msg)],
                components: [actionRow]
              });
              currentTurnId = nextTurnId;
            } else if (attackResult.isDefeated) {
              const winnerId = currentTurnId;

              await combatMsg.edit({
                embeds: [new EmbedBuilder().setTitle('K.O.!').setDescription(`<@${targetId}> was defeated!`).setColor('#ff0000')],
                components: []
              });
              const lossData2 = await applyLosses(targetId, message.channel);
              const moneyLost2 = lossData2?.lossAmount ?? 0;

              const expResult = await awardExperience(winnerId);
              await recordMatch(winnerId, targetId, 20, moneyLost2);
              const winMsg = expResult.levelUp
                ? `🎉 <@${winnerId}> won and LEVELED UP to ${expResult.newLevel}!`
                : `🏆 <@${winnerId}> won the duel!`;

              await message.channel.send({ content: winMsg });

              battleOver = true;
            } else {


              const msg = `💥 <@${currentTurnId}> dealt ${attackResult.damage} damage to <@${targetId}>!`;
              const nextTurnId = currentTurnId === attackerId ? defenderId : attackerId;
              await combatMsg.edit({
                embeds: [await createCombatEmbed(nextTurnId, attackerId, defenderId, msg)],
                components: [actionRow]
              });
              currentTurnId = nextTurnId;
            }
          }
        }

      });

      chooseCollector.on('end', async collected => {
        if (collected.size === 0) {
          const cancelEmbed = new EmbedBuilder()
            .setTitle('Attacker Selection Ignored')
            .setDescription('No attacker was chosen. Challenge cancelled.')
            .setColor('#999999');
          await chooseMsg.edit({ embeds: [cancelEmbed], components: [] });
        }
      });
    });

    acceptCollector.on('end', async collected => {
      if (collected.size === 0) {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('Challenge Ignored')
          .setDescription(`${targetUser} did not accept the duel in time. Challenge cancelled.`)
          .setColor('#999999');
        await challengeMsg.edit({ embeds: [cancelEmbed], components: [] });
      }
    });
  },

  async executeBossFight(message, challenger, args = []) {
    const bossProfiles = getBossProfiles();
    const requestedBoss = args.find(arg => !['pvp', 'boss', 'bot', 'random'].includes(arg.toLowerCase()));
    const bossProfile = requestedBoss
      ? getBossProfile(requestedBoss.toLowerCase())
      : bossProfiles[Math.floor(Math.random() * bossProfiles.length)];
    const bossName = bossProfile.name;
    const trainer = createBossTrainer(bossProfile.id, challenger.id);
    const playerStats = await rpgmanager.getStats(challenger.id);
    let player = {
      id: challenger.id,
      hp: Math.max(30, playerStats.health),
      stamina: Math.max(24, playerStats.stamina),
      shield: 0
    };
    let boss = {
      hp: bossProfile.hp,
      stamina: bossProfile.stamina,
      shield: 0
    };

    const getStatBar = (val, max = 100) => {
      const filled = Math.round((val / max) * 10);
      return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${val}/${max}`;
    };

    const createCombatEmbed = async (turnLabel = 'You', lastAction = '') => {
      return new EmbedBuilder()
        .setTitle('⚔️ Boss Duel')
        .setDescription(`**Opponent:** ${bossName} (${bossProfile.title})\n${bossProfile.description}\n\n**Current Turn:** ${turnLabel}\n\n` +
          `**You**\nHP: ${getStatBar(player.hp)}\nST: ${getStatBar(player.stamina)}\n\n` +
          `**${bossName}**\nHP: ${getStatBar(boss.hp)}\nST: ${getStatBar(boss.stamina)}\n\n` +
          (lastAction ? `*${lastAction}*` : 'Choose your action:'))
        .setColor('#F59E0B');
    };

    const attackBtn = new ButtonBuilder()
      .setCustomId('pvp_attack')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⚔️');
    const heavyAttackBtn = new ButtonBuilder()
      .setCustomId('pvp_heavy_attack')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('💥');
    const defendBtn = new ButtonBuilder()
      .setCustomId('pvp_defend')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🛡️');
    const recoverBtn = new ButtonBuilder()
      .setCustomId('pvp_recover')
      .setStyle(ButtonStyle.Success)
      .setEmoji('💊');
    const runBtn = new ButtonBuilder()
      .setCustomId('pvp_run')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🏃');
    const actionRow = new ActionRowBuilder().addComponents(attackBtn, heavyAttackBtn, defendBtn, recoverBtn, runBtn);

    let combatMsg = await message.channel.send({
      embeds: [await createCombatEmbed('You')],
      components: [actionRow]
    });

    let battleOver = false;
    let turn = 1;
    const combatLog = [];

    while (!battleOver && turn <= 8) {
      const actionFilter = i => i.customId.startsWith('pvp_') && i.user.id === challenger.id;
      const actionCollector = combatMsg.createMessageComponentCollector({ filter: actionFilter, time: 60000, max: 1 });

      const collected = await new Promise(resolve => {
        actionCollector.on('collect', async i => {
          try {
            if (!i.deferred && !i.replied) {
              await i.deferUpdate();
            }
          } catch (error) {
            console.warn('[pvp] Failed to defer interaction:', error);
          }
          resolve(i);
        });
        actionCollector.on('end', (coll, reason) => {
          if (reason === 'time' && coll.size === 0) resolve(null);
        });
      });

      if (!collected) {
        await combatMsg.edit({
          embeds: [new EmbedBuilder().setTitle('Duel Timeout').setDescription('No action was taken in time. Duel cancelled.').setColor('#999999')],
          components: []
        });
        break;
      }

      if (collected.customId === 'pvp_run') {
        await combatMsg.edit({
          embeds: [new EmbedBuilder().setTitle('Escape Successful').setDescription('You managed to flee the boss fight!').setColor('#0EA5E9')],
          components: []
        });
        battleOver = true;
        break;
      }

      if (player.stamina <= 0) {
        await combatMsg.edit({
          embeds: [new EmbedBuilder().setTitle('Exhausted!').setDescription('You are too exhausted to continue.').setColor('#DC2626')],
          components: []
        });
        battleOver = true;
        break;
      }

      const playerAction = collected.customId.replace('pvp_', '');
      combatLog.push(playerAction);
      const botAction = decideBotAction({ turn, player, boss, bossProfile, trainer });
      const result = applyTurn({ playerAction, botAction, player, boss });
      player = result.player;
      boss = result.boss;

      const { generateDialogue } = require('./bosses/bossDialogue');
      const bossQuote = generateDialogue(botAction, { turn, player, boss }, bossProfile);

      const lastAction = `You chose **${playerAction}** while **${bossName}** chose to **${botAction}**.\n\n💬 **${bossName}**: "${bossQuote}"`;
      const nextTurnLabel = 'You';

      await combatMsg.edit({
        embeds: [await createCombatEmbed(nextTurnLabel, lastAction)],
        components: [actionRow]
      });

      if (player.hp <= 0) {
        trainer.update('loss', botAction, -80, 'loss');
        await message.channel.send(`💀 ${challenger} was defeated by **${bossName}**.`);
        battleOver = true;
      } else if (boss.hp <= 0) {
        const reward = 120 + (bossProfile.behavior === 'aggressive' ? 30 : 0);
        trainer.update('win', botAction, 100, 'win');
        await message.channel.send(`🎉 ${challenger} defeated **${bossName}** and earned **$${reward}**!`);
        const dbManager = message.client.db;
        await dbManager.addMoney(challenger.id, reward, { trackEarning: true });
        await rpgmanager.recordPvpResult(challenger.id, 'boss', 20, 0);
        battleOver = true;
      }

      turn += 1;
    }

    if (!battleOver) {
      const final = player.hp > boss.hp ? 'You barely outlasted the boss.' : 'The boss outlasted you.';
      await message.channel.send(`🏁 ${final}`);
    }

    // After battle ends, let trainer learn from combatLog
    if (combatLog.length > 0 && trainer.analyzeMatch) {
      trainer.analyzeMatch(combatLog);
    }
  }
};
