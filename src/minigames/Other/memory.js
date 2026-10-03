const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ContainerBuilder,
    MessageFlags,
    ModalBuilder,
    SeparatorBuilder,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { randomUUID } = require('node:crypto');
const { getCommandUser, sendCommandMessage } = require('../../commands/Utils/commandInteraction');

const ANSWER_TIMEOUT_MS = 20000;
const EMOJI_REVEAL_MS = 5000;
const ROUND_TIMEOUT_MS = 90000;
const EMOJI_SET = ['🐻', '🍎', '🚀', '🌙', '🎸', '🐬', '🔥', '🌻', '⚽', '🍕'];
const WORD_LINKS = [
    { start: 'sun', answer: 'sunflower' },
    { start: 'rain', answer: 'rainbow' },
    { start: 'snow', answer: 'snowman' },
    { start: 'star', answer: 'starfish' },
    { start: 'tooth', answer: 'toothbrush' },
    { start: 'book', answer: 'bookstore' },
];

function normalizeAnswer(answer) {
    return String(answer).trim().toLowerCase().replace(/[\s.,!?]/g, '');
}

function createEmojiSequence(random = Math.random) {
    const available = [...EMOJI_SET];
    const sequence = [];
    while (sequence.length < 5) {
        const index = Math.floor(random() * available.length);
        sequence.push(available.splice(index, 1)[0]);
    }
    return sequence;
}

function buildMemoryContainer({ mode, ownerId, roundId, phase, challenge, status = null }) {
    const isEmoji = mode === 'emoji';
    const customId = `memory_answer_${ownerId}_${roundId}`;
    let title = isEmoji ? '# 🧠 Memory — Emoji Order' : '# 🧠 Memory — Word Link';
    let body;
    let buttonLabel = 'Submit answer';
    let disabled = false;

    if (phase === 'revealing') {
        body = `Memorize this sequence:\n\n## ${challenge.sequence.join('　')}\n\n-# It will be hidden in ${EMOJI_REVEAL_MS / 1000} seconds.`;
        buttonLabel = 'Memorize...';
        disabled = true;
    } else if (phase === 'ready') {
        body = isEmoji
            ? `The sequence is hidden. Enter the emojis in the same order using the button below.\n\n-# You have one attempt.`
            : `Continue the word link:\n\n## ${challenge.start} → ?\n\nEnter one compound word beginning with **${challenge.start}**.\n\n-# You have one attempt.`;
    } else if (phase === 'answering') {
        body = isEmoji
            ? 'Your answer form is open. Enter the emoji sequence in the same order.'
            : 'Your answer form is open. Enter a compound word beginning with the shown word.';
        buttonLabel = 'Answer form open';
        disabled = true;
    } else {
        title = phase === 'expired' ? '# ⌛ Memory round expired' : '# 🧠 Memory — Result';
        body = status || 'This round has ended.';
        buttonLabel = phase === 'expired' ? 'Round expired' : 'Round finished';
        disabled = true;
    }

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(customId)
                .setLabel(buttonLabel)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled)
        ));
}

function createAnswerModal(mode, ownerId, roundId, startWord) {
    const isEmoji = mode === 'emoji';
    const input = new TextInputBuilder()
        .setCustomId('memory_answer_input')
        .setLabel(isEmoji ? 'Enter the emoji sequence' : `A word beginning with "${startWord}"`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(isEmoji ? 100 : 50)
        .setPlaceholder(isEmoji ? 'Paste or type the emojis in order' : `${startWord}...`);

    return new ModalBuilder()
        .setCustomId(`memory_modal_${ownerId}_${roundId}`)
        .setTitle(isEmoji ? 'Emoji Memory' : 'Word Link')
        .addComponents(new ActionRowBuilder().addComponents(input));
}

module.exports = {
    name: 'memory',
    description: 'Play a word-link or emoji memory challenge',
    category: 'mie',
    usage: 'Zmemory [word|emoji]',

    async execute(message, args = []) {
        const ownerId = getCommandUser(message).id;
        const requestedMode = String(args[0] || '').toLowerCase();
        const mode = requestedMode === 'word' || requestedMode === 'words'
            ? 'word'
            : requestedMode === 'emoji'
                ? 'emoji'
                : Math.random() < 0.5 ? 'word' : 'emoji';
        const challenge = mode === 'word'
            ? WORD_LINKS[Math.floor(Math.random() * WORD_LINKS.length)]
            : { sequence: createEmojiSequence() };
        const roundId = randomUUID();
        let phase = mode === 'emoji' ? 'revealing' : 'ready';

        const sent = await sendCommandMessage(message, {
            components: [buildMemoryContainer({
                mode,
                ownerId,
                roundId,
                phase,
                challenge,
            })],
            flags: [MessageFlags.IsComponentsV2],
        });

        let finished = false;
        let revealTimer = null;
        const render = (nextPhase, status) => sent.edit({
            components: [buildMemoryContainer({
                mode,
                ownerId,
                roundId,
                phase: nextPhase,
                challenge,
                status,
            })],
        });

        const collector = sent.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: ROUND_TIMEOUT_MS,
            filter: interaction => interaction.customId === `memory_answer_${ownerId}_${roundId}`,
        });

        if (mode === 'emoji') {
            revealTimer = setTimeout(() => {
                if (finished) return;
                phase = 'ready';
                render(phase).catch(error => {
                    console.error('[MEMORY] Failed to hide emoji sequence:', error);
                    collector.stop('render-error');
                });
            }, EMOJI_REVEAL_MS);
        }

        collector.on('collect', async interaction => {
            if (interaction.user.id !== ownerId) {
                return interaction.reply({
                    content: 'This memory round belongs to someone else.',
                    ephemeral: true,
                });
            }
            if (phase !== 'ready') {
                return interaction.reply({
                    content: 'This memory round is not accepting an answer right now.',
                    ephemeral: true,
                });
            }

            phase = 'answering';
            const modal = createAnswerModal(mode, ownerId, roundId, challenge.start);
            try {
                await interaction.showModal(modal);
            } catch (error) {
                phase = 'ready';
                console.error('[MEMORY] Failed to open answer modal:', error);
                await interaction.followUp({
                    content: 'Could not open the answer form. Please try the button again.',
                    ephemeral: true,
                });
                return;
            }

            try {
                await render(phase);
            } catch (error) {
                console.error('[MEMORY] Failed to update answer state:', error);
            }

            const modalId = `memory_modal_${ownerId}_${roundId}`;
            const submission = await interaction.awaitModalSubmit({
                time: ANSWER_TIMEOUT_MS,
                filter: submit => submit.customId === modalId && submit.user.id === ownerId,
            }).catch(() => null);

            if (!submission) {
                if (finished) return;
                finished = true;
                phase = 'expired';
                const answer = mode === 'emoji' ? challenge.sequence.join('') : challenge.answer;
                const result = `⌛ Time is up! The answer was **${answer}**.`;
                try {
                    await render(phase, result);
                } catch (error) {
                    console.error('[MEMORY] Failed to show timeout result:', error);
                }
                collector.stop('answered');
                return;
            }

            if (finished) {
                return submission.reply({ content: 'This memory round has already ended.', ephemeral: true });
            }
            finished = true;
            phase = 'finished';
            const answer = mode === 'emoji' ? challenge.sequence.join('') : challenge.answer;
            const userAnswer = submission.fields.getTextInputValue('memory_answer_input');
            const correct = normalizeAnswer(userAnswer) === normalizeAnswer(answer);
            const result = correct
                ? `✅ Perfect memory! Your answer was correct.\n\n-# Answer: **${answer}**`
                : `❌ Not quite! The answer was **${answer}**.`;

            await submission.deferUpdate();
            try {
                await render(phase, result);
            } catch (error) {
                console.error('[MEMORY] Failed to show round result:', error);
            }
            collector.stop('answered');
        });

        collector.on('end', (_, reason) => {
            if (revealTimer) clearTimeout(revealTimer);
            if (finished || reason !== 'time') return;
            finished = true;
            phase = 'expired';
            const answer = mode === 'emoji' ? challenge.sequence.join('') : challenge.answer;
            render(phase, `⌛ Time is up! The answer was **${answer}**.`)
                .catch(error => console.error('[MEMORY] Failed to show expired round:', error));
        });
    },

    createEmojiSequence,
    normalizeAnswer,
    buildMemoryContainer,
    createAnswerModal,
};
