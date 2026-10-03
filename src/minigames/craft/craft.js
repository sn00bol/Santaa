const { getCommandUser, replyToCommand, sendCommandMessage } = require('../../commands/Utils/commandInteraction');
const { MessageFlags } = require('discord.js');
const rpgmanager = require('../../../database/rpgmanager');
const dbmanager = require('../../../database/dbmanager');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const formatNumber = require('../../commands/Utils/formatNumber');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');
const craftUI = require('./craftUI');
const {
    isFixable,
    isUpgradable,
    getUpgradeType,
    getFixCost,
    getUpgradeTier,
    getUpgradeLevel,
    setUpgradeLevel,
    MAX_UPGRADE_LEVEL,
} = require('./craftCore');

function findItemInInventory(inventory, itemName) {
    const query = itemName.toLowerCase().trim();
    for (const entry of inventory) {
        const def = allItemsCache.get(entry.item_id);
        if (!def) continue;
        if (
            def.name.toLowerCase().includes(query) ||
            def.id.toLowerCase().includes(query)
        ) {
            return { inventoryEntry: entry, itemDef: def };
        }
    }
    return null;
}

function countItem(inventory, itemId) {
    return inventory.filter(e => e.item_id === itemId).length;
}

async function removeItems(userId, inventory, itemId, quantity) {
    const entries = inventory.filter(e => e.item_id === itemId);
    if (entries.length < quantity) return false;
    for (let i = 0; i < quantity; i++) {
        await rpgmanager.removeItem(entries[i].id);
    }
    return true;
}

function attachTableCollector(message, msg) {
    let currentView = 'fix';
    let currentPage = 0;
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.user.id !== getCommandUser(message).id) {
            return i.reply({ content: 'Not your menu!', ephemeral: true });
        }

        if (i.customId === 'craft_table_select' && i.isStringSelectMenu()) {
            currentView = i.values[0];
            currentPage = 0;
        } else if (i.isButton()) {
            const { totalPages } = craftUI.buildTable(currentView, currentPage);
            switch (i.customId) {
                case 'first': currentPage = 0; break;
                case 'prev': currentPage = Math.max(0, currentPage - 1); break;
                case 'next': currentPage = Math.min(totalPages - 1, currentPage + 1); break;
                case 'last': currentPage = totalPages - 1; break;
                default: return i.deferUpdate();
            }
        } else {
            return i.deferUpdate();
        }

        return i.update({
            components: [craftUI.buildTable(currentView, currentPage).container],
            flags: [MessageFlags.IsComponentsV2],
        });
    });

    collector.on('end', () => {
        msg.edit({
            components: [craftUI.buildTable(currentView, currentPage, true).container],
        }).catch(() => {});
    });
}

async function handleTable(message) {
    const msg = await replyToCommand(message, {
        components: [craftUI.buildTable('fix').container],
        flags: [MessageFlags.IsComponentsV2],
    });
    attachTableCollector(message, msg);
}

async function handleFix(message, itemName) {
    if (!itemName) {
        return replyToCommand(message, '❌ Please specify an item to fix. Usage: `Zcraft fix <item name>`');
    }

    const userId = getCommandUser(message).id;
    const inventory = await rpgmanager.getInventory(userId);

    // Find item in inventory
    const found = findItemInInventory(inventory, itemName);
    if (!found) {
        return replyToCommand(message, `❌ You don't have an item matching **"${itemName}"** in your inventory.`);
    }

    const { itemDef } = found;

    // Check fixable
    if (!isFixable(itemDef)) {
        return replyToCommand(message, {
            components: [craftUI.buildFixResult({
                error: `**${itemDef.name}** cannot be fixed. (Food, wood, and starter items are not fixable.)`,
            })],
            flags: [MessageFlags.IsComponentsV2],
        });
    }

    const maxDur = Number(itemDef.durability);
    const cost = getFixCost(itemDef);

    // Find current durability from mining profile
    const stats = await rpgmanager.getStats(userId);
    let profile = {};
    try { profile = JSON.parse(stats.mining_profile || '{}'); } catch { profile = {}; }

    const equipment = profile.equipment || {};
    let currentDur = maxDur;
    let durField = null;
    if (equipment.currentPickaxe === itemDef.id) {
        currentDur = Number(equipment.pickaxeDurability ?? maxDur);
        durField = 'pickaxeDurability';
    } else if (equipment.currentHelmet === itemDef.id) {
        currentDur = Number(equipment.helmetHealth ?? maxDur);
        durField = 'helmetHealth';
    } else {
        currentDur = 0;
    }

    if (currentDur >= maxDur) {
        return replyToCommand(message, `✅ **${itemDef.name}** is already at full durability (${formatNumber(maxDur)}).`);
    }

    // Check wood in inventory
    const woodOwned = countItem(inventory, cost.woodId);
    if (woodOwned < cost.woodCost) {
        return replyToCommand(message,
            `❌ Not enough wood! You need **${cost.woodCost}x Wood** but only have **${woodOwned}x**.\n` +
            `Use \`Zcut\` to chop more wood.`
        );
    }

    // Check money
    const account = await dbmanager.getUser(userId);
    if (account.balance < cost.moneyCost) {
        return replyToCommand(message,
            `❌ Not enough money! You need **${CURRENCY_EMOJI}${formatNumber(cost.moneyCost)}** but only have **${CURRENCY_EMOJI}${formatNumber(account.balance)}**.`
        );
    }

    await removeItems(userId, inventory, cost.woodId, cost.woodCost);
    await dbmanager.removeMoney(userId, cost.moneyCost);

    if (durField) {
        profile.equipment[durField] = maxDur;
        await rpgmanager.updateProgress(userId, { mining_profile: profile });
    }

    return replyToCommand(message, {
        components: [craftUI.buildFixResult({
            item: itemDef,
            cost,
            oldDurability: currentDur,
            newDurability: maxDur,
        })],
        flags: [MessageFlags.IsComponentsV2],
    });
}

async function handleUpgrade(message, itemName) {
    if (!itemName) {
        return replyToCommand(message, '❌ Please specify an item to upgrade. Usage: `Zcraft upgrade <item name>`');
    }

    const userId = getCommandUser(message).id;
    const inventory = await rpgmanager.getInventory(userId);

    const found = findItemInInventory(inventory, itemName);
    if (!found) {
        return replyToCommand(message, `❌ You don't have an item matching **"${itemName}"** in your inventory.`);
    }

    const { itemDef } = found;

    // Check upgradable
    if (!isUpgradable(itemDef)) {
        return replyToCommand(message, {
            components: [craftUI.buildUpgradeResult({
                error: `**${itemDef.name}** cannot be upgraded. Only pickaxes and helmets (excluding starters) are upgradable.`,
            })],
            flags: [MessageFlags.IsComponentsV2],
        });
    }

    const upgradeType = getUpgradeType(itemDef);

    // Get profile for upgrade level
    const stats = await rpgmanager.getStats(userId);
    let profile = {};
    try { profile = JSON.parse(stats.mining_profile || '{}'); } catch { profile = {}; }

    const currentLevel = getUpgradeLevel(profile, itemDef.id);

    if (currentLevel >= MAX_UPGRADE_LEVEL) {
        return replyToCommand(message, {
            components: [craftUI.buildUpgradeResult({
                item: itemDef,
                upgradeType,
                oldLevel: currentLevel,
                newLevel: currentLevel,
                error: `**${itemDef.name}** is already at max upgrade level (+${MAX_UPGRADE_LEVEL})!`,
            })],
            flags: [MessageFlags.IsComponentsV2],
        });
    }

    const tier = getUpgradeTier(upgradeType, currentLevel);
    if (!tier) {
        return replyToCommand(message, '❌ Unable to determine upgrade cost. Please try again.');
    }

    // Build material requirements
    const requirements = [];
    if (upgradeType === 'pickaxe') {
        if (tier.oak  > 0) requirements.push({ id: 'oakwood',  qty: tier.oak });
        if (tier.pine > 0) requirements.push({ id: 'pinewood', qty: tier.pine });
    } else {
        if (tier.wood > 0) requirements.push({ id: 'wood',    qty: tier.wood });
        if (tier.oak  > 0) requirements.push({ id: 'oakwood', qty: tier.oak });
    }

    // Check materials
    for (const req of requirements) {
        const owned = countItem(inventory, req.id);
        const woodDef = allItemsCache.get(req.id);
        const woodName = woodDef?.name || req.id;
        if (owned < req.qty) {
            return replyToCommand(message,
                `❌ Not enough materials! You need **${req.qty}x ${woodName}** but only have **${owned}x**.\n` +
                `Use \`Zcut\` to get more wood.`
            );
        }
    }

    // Check money
    const account = await dbmanager.getUser(userId);
    if (account.balance < tier.money) {
        return replyToCommand(message,
            `❌ Not enough money! You need **${CURRENCY_EMOJI}${formatNumber(tier.money)}** but only have **${CURRENCY_EMOJI}${formatNumber(account.balance)}**.`
        );
    }

    // Deduct resources
    for (const req of requirements) {
        await removeItems(userId, inventory, req.id, req.qty);
    }
    await dbmanager.removeMoney(userId, tier.money);

    // Apply upgrade
    const newLevel = currentLevel + 1;
    setUpgradeLevel(profile, itemDef.id, newLevel);
    await rpgmanager.updateProgress(userId, { mining_profile: profile });

    return replyToCommand(message, {
        components: [craftUI.buildUpgradeResult({
            item: itemDef,
            upgradeType,
            oldLevel: currentLevel,
            newLevel,
            tier,
        })],
        flags: [MessageFlags.IsComponentsV2],
    });
}

async function handleMain(message) {
    return replyToCommand(message, {
        components: [craftUI.buildMainMenu(message.isChatInputCommand?.() ? '/craft' : message.content)],
        flags: [MessageFlags.IsComponentsV2],
    });
}

module.exports = {
    name: 'craft',
    aliases: ['crafting'],
    description: 'Fix or upgrade items using wood and materials.',
    category: 'mie',
    usage: 'Zcraft [fix <item> | upgrade <item> | table]',
    slashOptions: [
        { name: 'action', description: 'Action: fix, upgrade, or table', type: 'string', required: false },
        { name: 'item', description: 'Item name for fix or upgrade', type: 'string', required: false },
    ],
    async execute(message, args) {
        const isSlash = message.isChatInputCommand?.();
        const action = isSlash ? message.options.getString('action') : args[0];
        const item = isSlash ? message.options.getString('item') : null;
        const sub = String(action || '').toLowerCase();
        const rest = isSlash ? String(item || '') : args.slice(1).join(' ');

        switch (sub) {
            case 'fix':
                return handleFix(message, rest);
            case 'upgrade':
            case 'up':
                return handleUpgrade(message, rest);
            case 'table':
            case 'recipes':
                return handleTable(message);
            default:
                return handleMain(message);
        }
    }
};
