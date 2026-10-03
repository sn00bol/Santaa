const { getCommandUser, replyToCommand } = require('../../commands/Utils/commandInteraction');
const rpgmanager = require('../../../database/rpgmanager');

const climbers = new Map();
const CLIMB_JUMPS = [
    { threshold: 0.001, height: 100, label: 'LEGENDARY 100m leap' },
    { threshold: 0.01, height: 10, label: '10m leap' },
    { threshold: 0.06, height: 5, label: '5m leap' },
];

function getClimbOdds(height) {
    const safeHeight = Math.max(0, Number(height) || 0);
    const fallChance = Math.min(0.5, 0.01 + safeHeight * 0.01);
    return {
        fallChance,
        groundFallChance: Math.min(fallChance, safeHeight * 0.005),
    };
}

function advanceClimb(userId, random = Math.random) {
    const previousHeight = climbers.get(userId) || 0;
    const odds = getClimbOdds(previousHeight);

    const roll = random();
    if (roll >= odds.fallChance) {
        const jumpRoll = random();
        const jump = CLIMB_JUMPS.find(option => jumpRoll < option.threshold);
        const height = previousHeight + (jump?.height || 1);
        climbers.set(userId, height);
        return {
            outcome: jump ? 'big-climb' : 'climbed',
            previousHeight,
            height,
            gain: height - previousHeight,
            jumpLabel: jump?.label,
            odds,
        };
    }

    if (roll < odds.groundFallChance) {
        climbers.delete(userId);
        return { outcome: 'ground-fall', previousHeight, height: 0, odds };
    }

    if (previousHeight === 0) {
        return { outcome: 'stumbled', previousHeight, height: 0, odds };
    }

    const maxDrop = Math.min(Math.ceil(previousHeight / 2), previousHeight - 1);
    if (maxDrop === 0) {
        return { outcome: 'stumbled', previousHeight, height: previousHeight, odds };
    }
    const drop = Math.floor(random() * maxDrop) + 1;
    const height = previousHeight - drop;
    climbers.set(userId, height);
    return { outcome: 'fell', previousHeight, height, drop, odds };
}

function formatPercent(value) {
    return `${Number((value * 100).toFixed(1))}%`;
}

module.exports = {
    name: 'climb',
    description: 'Try to climb higher without falling',
    category: 'mie',
    usage: 'Zclimb',

    async execute(message) {
        const userId = getCommandUser(message).id;
        const result = advanceClimb(userId);
        if (result.height > 0) {
            await rpgmanager.updateClimbBestHeight(userId, result.height);
        }
        const nextOdds = getClimbOdds(result.height);
        const fallPercent = formatPercent(nextOdds.fallChance);
        const groundPercent = formatPercent(nextOdds.groundFallChance);

        if (result.outcome === 'climbed' || result.outcome === 'big-climb') {
            const climbMessage = result.outcome === 'big-climb'
                ? `🍀 **${result.jumpLabel}!** You gained **${result.gain}m** and reached **${result.height}m**!`
                : `🧗 You climbed up to **${result.height}m**!`;
            return replyToCommand(message,
                `${climbMessage}\n` +
                `Next climb: **${formatPercent(1 - nextOdds.fallChance)}** chance to climb, **${fallPercent}** chance to fall, including **${groundPercent}** to fall to 0m.`
            );
        }
        if (result.outcome === 'ground-fall') {
            return replyToCommand(message,
                `💥 You fell all the way down to **0m** from **${result.previousHeight}m**!\n` +
                `Your climb is over.`
            );
        }
        if (result.outcome === 'stumbled') {
            return replyToCommand(message,
                `😵 You slipped before getting off the ground and stayed at **0m**.\n` +
                `Next climb: **${formatPercent(1 - nextOdds.fallChance)}** chance to climb, **${fallPercent}** chance to fall, with **${groundPercent}** chance to fall to 0m.`
            );
        }
        return replyToCommand(message,
            `😵 You slipped **${result.drop}m** and landed at **${result.height}m**.\n` +
            `Next climb: **${formatPercent(1 - nextOdds.fallChance)}** chance to climb, **${fallPercent}** chance to fall, including **${groundPercent}** to fall to 0m.`
        );
    },

    advanceClimb,
    getClimbOdds,
    CLIMB_JUMPS,
    climbers,
};
