const { getCommandUser, replyToCommand, sendCommandMessage } = require('../../commands/Utils/commandInteraction');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags} = require('discord.js');

function buildGuessContainer(question, ownerId, hint, status, buttonMode = 'answer') {
  const isReplay = buttonMode === 'replay';
  const disabled = buttonMode === 'disabled';
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(isReplay ? `guessmeme_replay_${ownerId}` : `guessmeme_btn_${ownerId}`)
      .setLabel(isReplay ? 'Play again' : disabled ? 'Round finished' : 'Submit answer')
      .setStyle(isReplay ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(disabled)
  );

  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎭 Guess the Meme'))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `${status ? `${status}\n\n` : ''}**Hint**\n\`${hint}\`\n\n-# <@${ownerId}> has one answer attempt.`
    ))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL(question.image)
        .setDescription('Meme to identify')
    ))
    .addActionRowComponents(actionRow);
}

module.exports = {
  name: 'guess',
  description: 'Become a nerd lord and guess the memes',
  category: 'mie',
  usage: 'Zguess',

  async execute(message) {
    try {
      const question = await this.getRandomMeme();
      if (!question) {
        return replyToCommand(message, 'Could not connect to the meme database. Please try again later');
      }

      const hint = this.generateHint(question.answer);
      const ownerId = getCommandUser(message).id;
      const sent = await sendCommandMessage(message, {
        components: [buildGuessContainer(question, ownerId, hint, '')],
        flags: [MessageFlags.IsComponentsV2]
      });

      const showRoundResult = async (roundQuestion, roundHint, status) => {
        await sent.edit({
          components: [buildGuessContainer(roundQuestion, ownerId, roundHint, status, 'replay')]
        }).catch(() => { });
        attachReplayCollector(roundQuestion, roundHint);
      };

      const startRound = async (roundQuestion) => {
        const roundHint = this.generateHint(roundQuestion.answer);
        await sent.edit({
          components: [buildGuessContainer(roundQuestion, ownerId, roundHint, '')]
        }).catch(() => { });
        attachAnswerCollector(roundQuestion, roundHint);
      };

      const attachReplayCollector = (roundQuestion, roundHint) => {
        const replayCollector = sent.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 120000
        });

        replayCollector.on('collect', async (interaction) => {
          if (interaction.user.id !== ownerId) {
            return interaction.reply({
              content: 'This guessing round belongs to someone else.',
              ephemeral: true
            });
          }

          replayCollector.stop('replay');
          await interaction.deferUpdate();
          await sent.edit({
            components: [buildGuessContainer(roundQuestion, ownerId, roundHint, 'Loading the next meme...', 'disabled')]
          }).catch(() => { });

          const nextQuestion = await this.getRandomMeme();
          if (!nextQuestion) {
            await showRoundResult(roundQuestion, roundHint, 'Could not load another meme. Please try again.');
            return;
          }
          await startRound(nextQuestion);
        });

        replayCollector.on('end', async (_, reason) => {
          if (reason !== 'time') return;
          await sent.edit({
            components: [buildGuessContainer(roundQuestion, ownerId, roundHint, 'Replay window expired. Run the command to start a new session.', 'disabled')]
          }).catch(() => { });
        });
      };

      const attachAnswerCollector = (roundQuestion, roundHint) => {
        let gameState = 'playing';
        const buttonCollector = sent.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 90000
        });

        buttonCollector.on('collect', async (interaction) => {
          if (interaction.user.id !== ownerId) {
            return interaction.reply({
              content: 'This guessing round belongs to someone else.',
              ephemeral: true
            });
          }
          if (gameState !== 'playing') return;

          gameState = 'answering';
          buttonCollector.stop('answering');

          const modalId = `guessmeme_modal_${ownerId}_${sent.id}`;
          const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle('Guess the Meme');

          const answerInput = new TextInputBuilder()
            .setCustomId('meme_answer_input')
            .setLabel('Name this meme')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Enter the meme name');

          modal.addComponents(new ActionRowBuilder().addComponents(answerInput));

          try {
            await interaction.showModal(modal);
          } catch (error) {
            await showRoundResult(roundQuestion, roundHint, `The answer form could not open. The meme was **${roundQuestion.answer}**.`);
            return;
          }

          await sent.edit({
            components: [buildGuessContainer(roundQuestion, ownerId, roundHint, 'Submitting answer...', 'disabled')]
          }).catch(() => { });

          const modalSubmit = await interaction.awaitModalSubmit({
            time: 60000,
            filter: submit => submit.customId === modalId && submit.user.id === ownerId
          }).catch(() => null);

          if (!modalSubmit) {
            await showRoundResult(roundQuestion, roundHint, `No answer was submitted in time. The meme was **${roundQuestion.answer}**.`);
            return;
          }

          const userAnswer = modalSubmit.fields.getTextInputValue('meme_answer_input').trim();
          const isCorrect = this.checkAnswer(roundQuestion.answer, userAnswer);
          const resultText = isCorrect
            ? `✅ Correct. The meme was **${roundQuestion.answer}**.`
            : `❌ Not quite. The meme was **${roundQuestion.answer}**.`;
          await showRoundResult(roundQuestion, roundHint, resultText);
          await modalSubmit.reply({
            content: isCorrect ? 'Answer submitted: correct!' : 'Answer submitted: not quite.',
            ephemeral: true
          });
        });

        buttonCollector.on('end', async (_, reason) => {
          if (reason !== 'time' || gameState !== 'playing') return;
          gameState = 'finished';
          await showRoundResult(roundQuestion, roundHint, `Time is up. The meme was **${roundQuestion.answer}**.`);
        });
      };

      attachAnswerCollector(question, hint);

    } catch (error) {
      console.error('Error in guessmeme game:', error);
      replyToCommand(message, 'An error occurred while running the game. Please try again!');
    }
  },

  generateHint(memeName) {
    if (!memeName) return "No hint available.";

    const words = memeName.split(/\s+/).filter(Boolean);

    const processedWords = words.map(word => {
      if (word.length <= 2) return word; // Keep short words visible

      const firstChar = word.charAt(0);
      const lastChar = word.length > 3 ? word.charAt(word.length - 1) : '';
      const hidden = "_".repeat(word.length - (lastChar ? 2 : 1));

      return firstChar + hidden + lastChar;
    });

    const maskText = processedWords.join(' ');
    return `${maskText} (${words.length} words, ${memeName.length} characters)`;
  },

  checkAnswer(correctAnswer, userAnswer) {
    if (!correctAnswer || !userAnswer) return false;

    const normalize = (str) => str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ') // Remove special chars
      .replace(/\s+/g, ' ')
      .trim();

    const target = normalize(correctAnswer);
    const input = normalize(userAnswer);

    // Exact match
    if (target === input) return true;

    const targetWords = target.split(' ').filter(Boolean);
    const inputWords = input.split(' ').filter(Boolean);

    if (targetWords.length === 0 || inputWords.length === 0) return false;

    const matchingWords = targetWords.filter(word =>
      inputWords.some(inputWord =>
        inputWord.includes(word) || word.includes(inputWord)
      )
    );

    const matchRatio = matchingWords.length / targetWords.length;
    return matchRatio >= 0.7 || matchingWords.length >= Math.max(2, Math.floor(targetWords.length * 0.6));
  },

  async getRandomMeme() {
    try {
      const response = await fetch('https://api.imgflip.com/get_memes');
      const data = await response.json();

      if (!data.success || !data.data?.memes?.length) return null;

      const memes = data.data.memes;
      // Filter out very low quality or textless memes if desired
      const filtered = memes.filter(m => m.box_count <= 4); // Prefer classic memes

      const randomMeme = filtered.length
        ? filtered[Math.floor(Math.random() * filtered.length)]
        : memes[Math.floor(Math.random() * memes.length)];

      return {
        id: randomMeme.id,
        answer: randomMeme.name,
        image: randomMeme.url
      };
    } catch (e) {
      console.error('Failed to fetch meme:', e);
      return null;
    }
  }
};