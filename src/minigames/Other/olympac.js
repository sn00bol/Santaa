const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const formatNumber = require('../../commands/Utils/formatNumber');

const olympacPrompts = [
  {
    id: 'run-1',
    prompt: 'Tap as fast as you can!',
    targetTaps: 10,
    timeLimitMs: 5000,
    reward: 100
  },
  {
    id: 'run-2',
    prompt: 'Lightning Sprint! Go!',
    targetTaps: 15,
    timeLimitMs: 6000,
    reward: 150
  },
  {
    id: 'run-3',
    prompt: 'Olympic Final Sprint!',
    targetTaps: 22,
    timeLimitMs: 7000,
    reward: 220
  },
  {
    id: 'run-4',
    prompt: 'Speed Demon Challenge!',
    targetTaps: 18,
    timeLimitMs: 5500,
    reward: 180
  }
];

const defaultConfig = {
  targetTaps: 12,
  timeLimitMs: 5500,
  reward: 120
};

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

      const startEmbed = new EmbedBuilder()
        .setTitle('🏃‍♂️ Olympac Sprint')
        .setDescription(`**Challenge:** ${prompt.prompt}\n\n` +
          `**Target:** ${formatNumber(prompt.targetTaps)} taps in ${formatNumber(prompt.timeLimitMs / 1000)} seconds\n` +
          `**Reward:** ${formatNumber(prompt.reward)} points`)
        .setColor('#F59E0B')
        .setFooter({ text: 'Click Start to begin!' });

      const startRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`olympac_start_${message.author.id}`)
          .setLabel('Start Sprint!')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🏁')
      );

      const sent = await message.channel.send({
        embeds: [startEmbed],
        components: [startRow]
      });

      const startCollector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000,
        max: 1
      });

      startCollector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({ content: 'This sprint is not for you!', ephemeral: true });
        }

        await interaction.deferUpdate();

        let tapCount = 0;
        const startTime = Date.now();
        const endTime = startTime + prompt.timeLimitMs;

        // Main Game Embed
        const gameEmbed = new EmbedBuilder()
          .setTitle('🏃‍♂️ SPRINTING!')
          .setDescription(`**${prompt.prompt}**\n\n` +
            `**Taps:** ${formatNumber(tapCount)}/${formatNumber(prompt.targetTaps)}\n` +
            `**Time Left:** ${formatNumber(Math.ceil(prompt.timeLimitMs / 1000))}s`)
          .setColor('#EA580C')
          .setFooter({ text: 'TAP THE BUTTON AS FAST AS POSSIBLE!' });

        const tapRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`olympac_tap_${message.author.id}`)
            .setLabel('TAP! TAP! TAP!')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⚡')
        );

        await sent.edit({ embeds: [gameEmbed], components: [tapRow] });

        // Tap Collector
        const tapCollector = sent.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: prompt.timeLimitMs + 1000
        });

        tapCollector.on('collect', async (tapInteraction) => {
          if (tapInteraction.user.id !== message.author.id) {
            return tapInteraction.reply({
              content: 'This is not your sprint!',
              ephemeral: true
            });
          }

          tapCount++;

          const timeLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));

          // Update embed every few taps to avoid rate limits
          if (tapCount % 3 === 0 || timeLeft <= 3) {
            gameEmbed.setDescription(`**${prompt.prompt}**\n\n` +
              `**Taps:** ${formatNumber(tapCount)}/${formatNumber(prompt.targetTaps)}\n` +
              `**Time Left:** ${formatNumber(timeLeft)}s`);
            await sent.edit({ embeds: [gameEmbed] }).catch(() => { });
          }

          await tapInteraction.deferUpdate().catch(() => { });
        });

        // End of game
        tapCollector.on('end', async () => {
          const timeTaken = Date.now() - startTime;
          const success = tapCount >= prompt.targetTaps;

          const resultEmbed = new EmbedBuilder()
            .setTitle(success ? '🏅 SPRINT COMPLETE!' : '⏱️ Time\'s Up!')
            .setDescription(success
              ? `**Excellent!** You tapped **${formatNumber(tapCount)}** times in ${formatNumber(Math.floor(timeTaken / 1000))}s!\n\n` +
              `**Reward:** +${formatNumber(prompt.reward)} points`
              : `You managed **${formatNumber(tapCount)}** taps.\n` +
              `You needed **${formatNumber(prompt.targetTaps)}** taps.`)
            .setColor(success ? '#22C55E' : '#EF4444')
            .addFields(
              { name: 'Taps', value: formatNumber(tapCount), inline: true },
              { name: 'Target', value: formatNumber(prompt.targetTaps), inline: true },
              { name: 'Time', value: `${formatNumber(Math.floor(timeTaken / 1000))}s`, inline: true }
            );

          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('disabled')
              .setLabel('Sprint Ended')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

          await sent.edit({
            embeds: [resultEmbed],
            components: [disabledRow]
          }).catch(() => { });

          // TODO: Add reward logic here (economy system)
          if (success) {
            // Example: await addPoints(message.author.id, prompt.reward);
          }
        });
      });

    } catch (error) {
      console.error('Error in olympac sprint:', error);
      message.reply('An error occurred while starting the sprint!');
    }
  }
};