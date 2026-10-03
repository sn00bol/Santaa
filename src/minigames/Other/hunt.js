const { getCommandUser, replyToCommand, sendCommandMessage } = require('../../commands/Utils/commandInteraction');
const formatNumber = require('../../commands/Utils/formatNumber');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const rpgmanager = require('../../../database/rpgmanager');

const HUNT_EXP_REWARD = 5;
const ANSWER_TIMEOUT_MS = 20000;
const CIPHER_PUZZLES = [
    { encoded: 'gpy', answer: 'fox' },
    { encoded: 'dbu', answer: 'cat' },
    { encoded: 'ipq', answer: 'hop' },
    { encoded: 'mblf', answer: 'lake' },
];
const WORD_PUZZLES = [
    { scrambled: 'xof', answer: 'fox' },
    { scrambled: 'tac', answer: 'cat' },
    { scrambled: 'hsif', answer: 'fish' },
    { scrambled: 'koob', answer: 'book' },
];

function getRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function createPuzzle() {
    const type = Math.floor(Math.random() * 3);
    if (type === 0) {
        const left = Math.floor(Math.random() * 16) + 12;
        const right = Math.floor(Math.random() * 9) + 3;
        return {
            kind: 'calculation',
            question: `Solve this before time runs out: **${left} × ${right} − ${right}**`,
            answer: String(left * right - right),
        };
    }
    if (type === 1) {
        const puzzle = getRandom(CIPHER_PUZZLES);
        return {
            kind: 'cipher',
            question: `Easy code: every letter was shifted **forward by 1**. Decode **${puzzle.encoded}** by shifting each letter back by 1.`,
            answer: puzzle.answer,
        };
    }

    const puzzle = getRandom(WORD_PUZZLES);
    return {
        kind: 'word',
        question: `Unscramble this word: **${puzzle.scrambled}**`,
        answer: puzzle.answer,
    };
}

function normalizeAnswer(answer) {
    return String(answer).trim().toLowerCase().replace(/\s+/g, '');
}

function addHuntRewards(userId, axe) {
    return Promise.all([
        (async () => {
            const stats = await rpgmanager.getStats(userId);
            let exp = Number(stats.exp) || 0;
            let level = Number(stats.level) || 1;
            exp += HUNT_EXP_REWARD;
            while (exp >= level * 100) {
                exp -= level * 100;
                level += 1;
            }
            await rpgmanager.updateProgress(userId, { exp, level });
        })(),
        rpgmanager.addItem(userId, axe.id, axe.name),
    ]);
}

module.exports = {
    name: 'hunt',
    description: 'Solve a quick puzzle while hunting for an axe',
    category: 'mie',
    usage: 'Zhunt',

    async execute(message) {
        const userId = getCommandUser(message).id;
        const puzzle = createPuzzle();
        await sendCommandMessage(message,
            `🏹 **Hunt — ${puzzle.kind === 'calculation' ? 'Calculation' : puzzle.kind === 'cipher' ? 'Decode the cipher' : 'Unscramble the word'}**\n` +
            `${puzzle.question}\n\nYou have **20 seconds**. Reply in this channel to answer.`
        );

        const answers = await message.channel.awaitMessages({
            filter: response => response.author.id === userId && !response.author.bot,
            max: 1,
            time: ANSWER_TIMEOUT_MS,
        });
        const response = answers.first();
        if (!response) {
            return replyToCommand(message, '⌛ Time is up. The hunt got away; try again!');
        }

        if (normalizeAnswer(response.content) !== normalizeAnswer(puzzle.answer)) {
            return replyToCommand(message, `❌ Not quite! The answer was **${puzzle.answer}**. Better luck on the next hunt.`);
        }

        const axes = [...allItemsCache.values()].filter(item =>
            /axe/i.test(item.id) && Array.isArray(item.type) && item.type.includes('craft')
        );
        if (axes.length === 0) {
            throw new Error('Hunt reward unavailable: no craft axe items are registered.');
        }
        const axe = getRandom(axes);
        await addHuntRewards(userId, axe);
        return replyToCommand(message,
            `✅ **You solved the puzzle and completed the hunt!**\n` +
            `✨ +${formatNumber(HUNT_EXP_REWARD)} EXP\n🪓 You found **${axe.name}**!`
        );
    },

    createPuzzle,
    normalizeAnswer,
};
