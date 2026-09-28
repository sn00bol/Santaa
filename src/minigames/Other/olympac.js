const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags} = require('discord.js');
const formatNumber = require('../../commands/Utils/formatNumber');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');
const dbmanager = require('../../../database/dbmanager');

const olympacPrompts = [
  {
    id: 'run-1',
    prompt: 'Tap as fast as you can!',
    targetTaps: 10,
    timeLimitMs: 10000,
    reward: 100
  },
  {
    id: 'run-2',
    prompt: 'Lightning Sprint! Go!',
    targetTaps: 15,
    timeLimitMs: 12000,
    reward: 150
  },
  {
    id: 'run-3',
    prompt: 'Olympic Final Sprint!',
    targetTaps: 22,
    timeLimitMs: 15000,
    reward: 220
  },
  {
    id: 'run-4',
    prompt: 'Speed Demon Challenge!',
    targetTaps: 18,
    timeLimitMs: 11000,
    reward: 180
  }
];

const defaultConfig = {
  targetTaps: 12,
  timeLimitMs: 11000,
  reward: 120
};

function buildSprintContainer({ ownerId, prompt, phase, tapCount = 0, timeLeftMs = 0, elapsedMs = 0, rewardError = false, balance = null }) {
  const progressSegments = 10;
  const filledSegments = Math.min(progressSegments, Math.floor((tapCount / prompt.targetTaps) * progressSegments));
  const progressBar = `${'█'.repeat(filledSegments)}${'░'.repeat(progressSegments - filledSegments)}`;

  let title = '# 🏃 Olympac Sprint';
  let body = `**Challenge**\n${prompt.prompt}\n\n` +
    `**Target**\n${formatNumber(prompt.targetTaps)} taps in ${formatNumber(prompt.timeLimitMs / 1000)} seconds\n\n` +
    `**Reward**\n${CURRENCY_EMOJI} $${formatNumber(prompt.reward)}\n\n-# Ready when you are, <@${ownerId}>.`;
  let buttonId = `olympac_start_${ownerId}`;
  let buttonLabel = 'Start sprint';
  let buttonStyle = ButtonStyle.Success;
  let disabled = false;

  if (phase === 'running') {
    title = '# ⚡ Sprint in progress';
    body = `**${prompt.prompt}**\n\n` +
      `**Progress**\n${progressBar}  ${formatNumber(tapCount)} / ${formatNumber(prompt.targetTaps)} taps\n\n` +
      `**Time left**\n${formatNumber(Math.max(0, Math.ceil(timeLeftMs / 1000)))} seconds\n\n-# Tap the button to build speed.`;
    buttonId = `olympac_tap_${ownerId}`;
    buttonLabel = 'Tap';
    buttonStyle = ButtonStyle.Primary;
  } else if (phase === 'finishing') {
    title = '# 🏁 Sprint complete';
    body = `Target reached with **${formatNumber(tapCount)} taps**.\n\n-# Recording your reward...`;
    buttonLabel = 'Finishing';
    buttonStyle = ButtonStyle.Secondary;
    disabled = true;
  } else if (phase === 'finished') {
    const succeeded = tapCount >= prompt.targetTaps;
    title = succeeded ? '# 🏅 Sprint complete' : '# ⏱️ Time is up';
    body = succeeded
      ? `You reached the target with **${formatNumber(tapCount)} taps** in **${formatNumber((elapsedMs / 1000).toFixed(1))} seconds**.\n\n` +
        (rewardError
          ? 'The reward could not be recorded. Please contact the server team.'
          : `**Reward**\n${CURRENCY_EMOJI} +$${formatNumber(prompt.reward)}${balance === null ? '' : `\n**New balance:** $${formatNumber(balance)}`}`)
      : `You reached **${formatNumber(tapCount)} / ${formatNumber(prompt.targetTaps)} taps**. Try another sprint to beat the target.`;
    buttonLabel = 'Sprint ended';
    buttonStyle = ButtonStyle.Secondary;
    disabled = true;
  } else if (phase === 'expired') {
    title = '# ⌛ Sprint expired';
    body = 'The start window ended before the sprint began. Run the command again when you are ready.';
    buttonLabel = 'Expired';
    buttonStyle = ButtonStyle.Secondary;
    disabled = true;
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buttonId)
        .setLabel(buttonLabel)
        .setStyle(buttonStyle)
        .setDisabled(disabled)
        .setEmoji(phase === 'running' ? '⚡' : phase === 'ready' ? '🏁' : '⏹️')
    ));
}

module.exports = {
  name: 'olympac',
  description: 'Olympac is the sprint minigame where you tap as fast as possible to win',
  category: 'mie',
  usage: 'Zolympac',
  olympacPrompts,
  defaultConfig,

  getPrompt(index = 0) {
    return olympacPrompts[index % olympacPrompts.length];
  },

  async execute(message) {
    try {
      const prompt = this.getPrompt(Math.floor(Math.random() * olympacPrompts.length));
      const ownerId = message.author.id;
      const sent = await message.channel.send({
        components: [buildSprintContainer({ ownerId, prompt, phase: 'ready' })],
        flags: [MessageFlags.IsComponentsV2]
      });

      let phase = 'ready';
      let tapCount = 0;
      let startTime = 0;
      let endTime = 0;
      let tapCollector = null;
      let gameTimer = null;
      let clockInterval = null;
      let renderTimer = null;
      let lastRenderAt = 0;

      const renderProgress = () => sent.edit({
        components: [buildSprintContainer({
          ownerId,
          prompt,
          phase,
          tapCount,
          timeLeftMs: endTime - Date.now()
        })]
      }).catch(() => { });

      const scheduleProgressRender = () => {
        if (phase !== 'running' || renderTimer) return;
        const delay = Math.max(0, 900 - (Date.now() - lastRenderAt));
        renderTimer = setTimeout(() => {
          renderTimer = null;
          if (phase !== 'running') return;
          lastRenderAt = Date.now();
          renderProgress();
        }, delay);
      };

      const finishSprint = async () => {
        if (phase !== 'running') return;
        phase = 'finishing';
        clearTimeout(gameTimer);
        clearInterval(clockInterval);
        clearTimeout(renderTimer);
        tapCollector?.stop('finished');

        const elapsedMs = Math.max(0, Math.min(prompt.timeLimitMs, Date.now() - startTime));
        const succeeded = tapCount >= prompt.targetTaps;
        let rewardError = false;
        let balance = null;

        if (succeeded) {
          await sent.edit({
            components: [buildSprintContainer({
              ownerId,
              prompt,
              phase,
              tapCount
            })]
          }).catch(() => { });
        }

        if (succeeded) {
          try {
            await dbmanager.addMoney(ownerId, prompt.reward, { trackEarning: true });
            const user = await dbmanager.getUser(ownerId).catch(() => null);
            balance = user?.balance ?? null;
          } catch (error) {
            rewardError = true;
            console.error('Failed to record Olympac reward:', error);
          }
        }

        phase = 'finished';
        await sent.edit({
          components: [buildSprintContainer({
            ownerId,
            prompt,
            phase,
            tapCount,
            elapsedMs,
            rewardError,
            balance
          })]
        }).catch(() => { });
      };

      const startCollector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000
      });

      startCollector.on('collect', async (interaction) => {
        if (interaction.user.id !== ownerId) {
          return interaction.reply({ content: 'This sprint is not for you!', ephemeral: true });
        }
        if (phase !== 'ready') return;

        phase = 'running';
        try {
          await interaction.deferUpdate();
          startCollector.stop('started');
          startTime = Date.now();
          endTime = startTime + prompt.timeLimitMs;
          lastRenderAt = startTime;

          await renderProgress();
          tapCollector = sent.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: prompt.timeLimitMs + 1500
          });

          tapCollector.on('collect', async (tapInteraction) => {
            if (tapInteraction.user.id !== ownerId) {
              return tapInteraction.reply({ content: 'This is not your sprint!', ephemeral: true });
            }
            if (phase !== 'running') {
              return tapInteraction.reply({ content: 'This sprint has already ended.', ephemeral: true });
            }

            if (Date.now() >= endTime) {
              await tapInteraction.deferUpdate().catch(() => { });
              return finishSprint();
            }

            tapCount++;
            await tapInteraction.deferUpdate().catch(() => { });
            if (tapCount >= prompt.targetTaps) return finishSprint();
            scheduleProgressRender();
          });

          tapCollector.on('end', () => {
            if (phase === 'running') finishSprint();
          });

          gameTimer = setTimeout(finishSprint, prompt.timeLimitMs);
          clockInterval = setInterval(scheduleProgressRender, 1000);
        } catch (error) {
          console.error('Failed to start Olympac sprint:', error);
          phase = 'expired';
          await sent.edit({
            components: [buildSprintContainer({ ownerId, prompt, phase })]
          }).catch(() => { });
        }
      });

      startCollector.on('end', async (_, reason) => {
        if (reason !== 'time' || phase !== 'ready') return;
        phase = 'expired';
        await sent.edit({
          components: [buildSprintContainer({ ownerId, prompt, phase })]
        }).catch(() => { });
      });

    } catch (error) {
      console.error('Error in olympac sprint:', error);
      message.reply('An error occurred while starting the sprint!');
    }
  }
};