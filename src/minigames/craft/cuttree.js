const rpgmanager = require('../../../database/rpgmanager');
const { checkCooldown } = require('../../commands/Utils/Cooldown');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const { rollWoodDrop } = require('./craftCore');
const formatNumber = require('../../commands/Utils/formatNumber');

const CUT_COOLDOWN_MS = 30 * 1000; // 30 seconds

module.exports = {
    name: 'cut',
    aliases: ['cuttree', 'choptree'],
    description: 'Chop a tree to get wood for crafting and repairs.',
    category: 'mie',
    usage: 'Zcut',
    async execute(message, args) {
        const userId = message.author.id;

        // Cooldown check
        const cooldownLeft = checkCooldown(userId, 'cut', CUT_COOLDOWN_MS);
        if (cooldownLeft) {
            return message.reply(`🌳 You're tired! Wait **${cooldownLeft}** before chopping again.`);
        }

        // Roll wood drop
        const drop = rollWoodDrop();
        if (!drop) {
            return message.reply('🌳 You swung your axe but the tree was empty...');
        }

        const woodItem = allItemsCache.get(drop.id);
        if (!woodItem) {
            return message.reply('🌳 Something went wrong while chopping. Try again later.');
        }

        // Add items to inventory
        for (let i = 0; i < drop.quantity; i++) {
            await rpgmanager.addItem(userId, woodItem.id, woodItem.name);
        }

        const nextLine = `\n-# Next cut in: **30s**`;

        return message.reply(
            `🌳 You chopped a tree and got:\n• **${formatNumber(drop.quantity)}x ${woodItem.name}**${nextLine}`
        );
    }
};
