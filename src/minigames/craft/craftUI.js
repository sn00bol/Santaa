const {
    ActionRowBuilder,
    ContainerBuilder,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const { getPaginationRow } = require('../../commands/Utils/NavigateManager');
const formatNumber = require('../../commands/Utils/formatNumber');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');
const {
    MAX_UPGRADE_LEVEL,
    isFixable,
    isUpgradable,
    getUpgradeType,
    getFixCost,
    getUpgradeTier,
    getAppliedStats,
    getUpgradeLevel,
    formatTierCost,
    PICKAXE_UPGRADE_TIERS,
    HELMET_UPGRADE_TIERS,
} = require('./craftCore');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
function buildMainMenu(commandText) {
    const pfx = process.env.PFX || 'Z';
    const enteredCommand = String(commandText || `${pfx}craft`).trim();
    const content = [
        `**"${enteredCommand}" is not valid, check these:**`,
        '',
        `- ${pfx}craft fix \`<item>\``,
        '-# Repair a broken item using wood and money',
        '',
        `- ${pfx}craft upgrade \`<item>\``,
        '-# Upgrade a pickaxe or helmet',
        '',
        `- ${pfx}craft table`,
        '-# View repair and upgrade recipes',
        '',
        `- ${pfx}cut`,
        '-# Chop a tree for crafting materials',
    ].join('\n');

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}
function buildTable(view = 'fix', page = 0, disabled = false) {
    const SELECT_OPTIONS = [
        { label: '🔨 Fix Recipes', value: 'fix', description: 'Repair cost for all fixable items', default: view === 'fix' },
        { label: '⬆️ Pickaxe Upgrades', value: 'pickaxe', description: 'Upgrade tiers for pickaxes', default: view === 'pickaxe' },
        { label: '🪖 Helmet Upgrades', value: 'helmet', description: 'Upgrade tiers for helmets', default: view === 'helmet' },
    ];

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('craft_table_select')
            .setPlaceholder('Select a category')
            .addOptions(SELECT_OPTIONS)
            .setDisabled(disabled)
    );

    let bodyLines = [];
    let entries = [];
    let totalPages = 1;
    const itemsPerPage = 5;

    if (view === 'fix') {
        entries = [...allItemsCache.values()].filter(isFixable).sort((a, b) => (a.cost || 0) - (b.cost || 0));
        totalPages = Math.ceil(entries.length / itemsPerPage) || 1;
        const start = page * itemsPerPage;
        bodyLines.push('## 🔨 Fix Recipes\n> `craft fix <item>` · Wood + money\n');
        bodyLines.push(entries.slice(start, start + itemsPerPage).map((item, index) => {
            const cost = getFixCost(item);
            return `**${formatNumber(start + index + 1)}. ${item.name}** · ${formatNumber(item.durability)} durability\n${cost.woodCost}x Wood + ${CURRENCY_EMOJI}${formatNumber(cost.moneyCost)}`;
        }).join('\n\n') || '*No fixable items found.*');
    } else if (view === 'pickaxe') {
        entries = PICKAXE_UPGRADE_TIERS;
        totalPages = Math.ceil(entries.length / itemsPerPage) || 1;
        const start = page * itemsPerPage;
        bodyLines.push('## ⬆️ Pickaxe Upgrade Tiers\n> `craft upgrade <pickaxe>`\n');
        bodyLines.push(entries.slice(start, start + itemsPerPage).map((tier, index) => {
            const tierNumber = start + index;
            return `**${formatNumber(tierNumber + 1)}. +${tierNumber} → +${tierNumber + 1}**\n${formatTierCost(tier, 'pickaxe')}\nLuck +${tier.luckBonus.toFixed(2)} · Durability +${tier.durabilityBonus}`;
        }).join('\n\n'));
    } else if (view === 'helmet') {
        entries = HELMET_UPGRADE_TIERS;
        totalPages = Math.ceil(entries.length / itemsPerPage) || 1;
        const start = page * itemsPerPage;
        bodyLines.push('## 🪖 Helmet Upgrade Tiers\n> `craft upgrade <helmet>`\n');
        bodyLines.push(entries.slice(start, start + itemsPerPage).map((tier, index) => {
            const tierNumber = start + index;
            return `**${formatNumber(tierNumber + 1)}. +${tierNumber} → +${tierNumber + 1}**\n${formatTierCost(tier, 'helmet')}\nHealth +${tier.healthBonus}`;
        }).join('\n\n'));
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 📋 Crafting Table'))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${bodyLines.join('\n')}\n\n*Page ${formatNumber(page + 1)} of ${formatNumber(totalPages)}*`))
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(selectRow);

    if (totalPages > 1) {
        container.addSeparatorComponents(new SeparatorBuilder());
        const paginationRow = getPaginationRow(page, totalPages);
        if (disabled) paginationRow.components.forEach(button => button.setDisabled(true));
        container.addActionRowComponents(paginationRow);
    }

    return { container, totalPages };
}

function buildFixResult({ item, cost, oldDurability, newDurability, error = null }) {
    if (error) {
        return new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔨 Fix Item\n> ❌ ${error}`));
    }

    const content = [
        `# 🔨 Fixed: ${item.name}`,
        `> Durability restored: **${formatNumber(oldDurability)} → ${formatNumber(newDurability)}**`,
        '',
        `**Materials used:**`,
        `• ${cost.woodCost}x Wood`,
        `• ${CURRENCY_EMOJI}${formatNumber(cost.moneyCost)}`,
    ].join('\n');

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}
function buildUpgradeResult({ item, upgradeType, oldLevel, newLevel, tier, error = null }) {
    if (error) {
        return new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⬆️ Upgrade Item\n> ❌ ${error}`));
    }

    const appliedNow = getAppliedStats(upgradeType, newLevel);
    const statsLines = [];
    if (upgradeType === 'pickaxe') {
        statsLines.push(`• Luck bonus: **+${appliedNow.luckBonus.toFixed(2)}** total`);
        statsLines.push(`• Durability bonus: **+${formatNumber(appliedNow.durabilityBonus)}** total`);
    } else {
        statsLines.push(`• Health bonus: **+${formatNumber(appliedNow.healthBonus)}** total`);
    }

    const nextTier = getUpgradeTier(upgradeType, newLevel);
    const nextLine = nextTier
        ? `\n**Next upgrade (+${newLevel + 1}):** ${formatTierCost(nextTier, upgradeType)}`
        : `\n✅ **Max level reached (+${MAX_UPGRADE_LEVEL})!**`;

    const content = [
        `# ⬆️ Upgraded: ${item.name} → **+${newLevel}**`,
        `> Was +${oldLevel} → now **+${newLevel}**`,
        '',
        '**Cumulative bonuses:**',
        ...statsLines,
        nextLine,
    ].join('\n');

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    buildMainMenu,
    buildTable,
    buildFixResult,
    buildUpgradeResult,
};
