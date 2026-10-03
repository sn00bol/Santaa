const rpgmanager = require('../../../database/rpgmanager');
const { checkCooldown } = require('../../commands/Utils/Cooldown');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const { rollWoodDrop } = require('./craftCore');
const formatNumber = require('../../commands/Utils/formatNumber');
const axeDefinitions = [
    require('../../items/craft/axe/axe'),
    require('../../items/craft/axe/goldaxe'),
    require('../../items/craft/axe/sliveraxe'),
];

const CUT_COOLDOWN_MS = 30 * 1000; // 30 seconds
const AXE_DURABILITY_COST = 8;
const axeItemIds = new Set(axeDefinitions.map(item => item.id));

module.exports = {
    name: 'cut',
    aliases: ['cuttree', 'choptree'],
    description: 'Chop a tree to get wood for crafting and repairs.',
    category: 'mie',
    usage: 'Zcut',
    async execute(message, args) {
        const userId = message.author.id;
        const inventory = await rpgmanager.getInventory(userId);
        const axe = inventory.find(item =>
            (axeItemIds.has(item.item_id) ||
                axeDefinitions.some(definition => definition.name === item.item_name)) &&
            !item.item_name?.startsWith('Broken ')
        );
        const axeItem = axeDefinitions.find(item => item.id === axe?.item_id)
            || axeDefinitions.find(item => item.name === axe?.item_name)
            || allItemsCache.get(axe?.item_id);

        if (!axe || !axeItem) {
            return message.reply('🪓 You need an axe in your inventory to chop trees.');
        }

        // Cooldown check
        const cooldownLeft = checkCooldown(userId, 'cut', CUT_COOLDOWN_MS);
        if (cooldownLeft) {
            return message.reply(`🌳 You're tired! Wait **${cooldownLeft}** before chopping again.`);
        }

        const maxDurability = Number(axeItem.durability);
        const currentDurability = axe.durability !== null &&
            axe.durability !== undefined &&
            Number.isFinite(Number(axe.durability))
            ? Number(axe.durability)
            : maxDurability;
        const remainingDurability = Math.max(0, currentDurability - AXE_DURABILITY_COST);
        const axeBroke = remainingDurability === 0;
        await rpgmanager.updateInventoryDurability(
            axe.id,
            remainingDurability,
            axeBroke ? `Broken ${axe.item_name}` : null
        );

        // Roll wood drop
        const drop = rollWoodDrop();
        if (!drop) {
            const brokenNotice = axeBroke ? `\n💥 Your **${axe.item_name}** broke.` : '';
            return message.reply(`🌳 You swung your axe but the tree was empty...${brokenNotice}`);
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
        const durabilityLine = axeBroke
            ? `\n💥 Your **${axe.item_name}** broke.`
            : `\n🪓 **${axe.item_name}** durability: ${formatNumber(remainingDurability)}/${formatNumber(maxDurability)}`;

        return message.reply(
            `🌳 You chopped a tree and got:\n• **${formatNumber(drop.quantity)}x ${woodItem.name}**${durabilityLine}${nextLine}`
        );
    }
};
