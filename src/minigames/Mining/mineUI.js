const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const formatNumber = require('../../commands/Utils/formatNumber');
const mineCore = require('./mineCore');
const mineBackpack = require('./mineBackpack');
const { getPaginationRow } = require('../../commands/Utils/NavigateManager');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');

const CELL_EMOJI = {
    hidden: '🔲',
    empty: '🟫',
    bomb: '💣',
    mineral: '💎',
};

const COUNT_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

function buildBar(current, max, length = 10) {
    if (current === '∞' || max === '∞') {
        return '█'.repeat(length);
    }
    const parsedCurrent = Number(current);
    const parsedMax = Number(max);
    if (!Number.isFinite(parsedCurrent) || !Number.isFinite(parsedMax) || parsedMax <= 0) {
        return '█'.repeat(length);
    }
    const safeCurrent = Math.max(0, Math.min(parsedMax, parsedCurrent));
    const filled = Math.min(length, Math.max(0, Math.round((safeCurrent / parsedMax) * length)));
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function formatStatLine(current, max, label, length = 10) {
    const currentText = String(current);
    const maxText = String(max);
    const formattedCurrent = currentText === '∞' ? '∞' : formatNumber(currentText);
    const formattedMax = maxText === '∞' ? '∞' : formatNumber(maxText);
    const width = Math.max(formattedCurrent.length, formattedMax.length);
    const currentPadded = formattedCurrent.padStart(width, ' ');
    const maxPadded = formattedMax.padStart(width, ' ');
    const bar = buildBar(currentText, maxText, length);
    const labelSuffix = label ? ` ${label}` : '';
    return `\`${currentPadded} / ${maxPadded}\` ${bar}${labelSuffix}`;
}

function buildMain(user, stats, inventory = [], backpacks = [], notice = null, profile = {}) {
    const backpackSummary = mineBackpack.getBackpackSummary(profile, inventory);
    const totalCapacity = backpackSummary.capacity || 1;
    const usedCapacity = backpackSummary.filled;
    const backpackLabel = backpackSummary.owned > 1 ? ` (${formatNumber(backpackSummary.owned)} backpacks)` : '';
    const backpackStatus = { line: formatStatLine(String(usedCapacity), String(totalCapacity), backpackLabel, 10) };
    const equipment = profile.equipment || {};

    const pickaxeItem = backpacks.find(item => item.id === equipment.currentPickaxe);
    const pickaxeName = pickaxeItem ? pickaxeItem.name : (equipment.currentPickaxe === 'minehand' || !equipment.currentPickaxe ? 'Your Hand' : equipment.currentPickaxe);
    const isHand = !pickaxeItem || pickaxeItem.id === 'minehand';
    const durabilityCurrent = isHand ? '∞' : String(equipment.pickaxeDurability ?? pickaxeItem?.durability ?? 80);
    const durabilityMax = isHand ? '∞' : String(pickaxeItem?.durability ?? 80);
    const durabilityLine = formatStatLine(durabilityCurrent, durabilityMax, pickaxeName, 10);
    const locationLine = profile.currentMap
        ? `📍 ${profile.currentMap}`
        : `📍 Default Mine`;

    const text1 = new TextDisplayBuilder()
        .setContent(`# ⛏️ Mining\n> Prepare your gear, then head underground, ${user.username}.\n> **Daily Streak:** ${(profile.dailyStreak || 0)} days`);

    const text2 = new TextDisplayBuilder()
        .setContent(`**Current Equipment**\n${durabilityLine}\n\n**Backpack capacity**\n${backpackStatus.line}\n\n**Current Location:**\n${locationLine}`);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(text1)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(text2);

    if (notice) {
        container.addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> ${notice}`));
    }

    const firstRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mine_backpack').setLabel('View backpack').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mine_skills').setLabel('Upgrade skills').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mine_shop').setLabel('Visit shop').setStyle(ButtonStyle.Secondary)
    );
    const secondRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mine_equipment').setLabel('Equipment').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mine_location').setLabel('Location').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mine_now').setLabel('Mining now').setStyle(ButtonStyle.Success)
    );

    return container
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(firstRow)
        .addActionRowComponents(secondRow);
}

function formatItemStats(stats) {
    if (!stats) return '';
    if (typeof stats === 'string') return stats;
    if (typeof stats === 'object') {
        return Object.entries(stats)
            .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: +${formatNumber(v)}`)
            .join(', ');
    }
    return '';
}

function buildEquipment(profile = {}, inventory = [], itemGroups = {}, infoMessage = null) {
    const equipment = profile.equipment || {};
    const ownedItems = new Map();
    for (const item of inventory) {
        ownedItems.set(item.item_id, (ownedItems.get(item.item_id) || 0) + 1);
    }

    const pickaxes = itemGroups.pickaxes || [];
    const helmets = itemGroups.helmets || [];
    const handPickaxe = pickaxes.find(item => item.id === 'minehand');
    const ownedPickaxes = pickaxes.filter(item => item.id !== 'minehand' && ownedItems.has(item.id));
    const availableHelmets = helmets.filter(item => ownedItems.has(item.id));

    const pickaxe = pickaxes.find(item => item.id === equipment.currentPickaxe) || handPickaxe;
    const helmet = helmets.find(item => item.id === equipment.currentHelmet) || null;


    const statsText = item => {
        if (!item) return '• No stats';
        if (typeof item.stats === 'string') return item.stats;
        if (item.stats && typeof item.stats === 'object') {
            return Object.entries(item.stats).map(([key, value]) => `• ${key.charAt(0).toUpperCase() + key.slice(1)}: +${formatNumber(value)}`).join('\n');
        }
        return '• No stats';
    };

    const pickaxeOptions = [
        ...ownedPickaxes.map(item => {
            const owned = ownedItems.get(item.id) || 1;
            const durStr = item.id === 'minehand' ? 'Durability: ∞' : `Durability: ${formatNumber(item.durability || 80)}`;
            const desc = `Your owned: ${owned} | ${durStr}`;
            return {
                label: String(item.name).slice(0, 100),
                value: item.id,
                description: desc.slice(0, 100),
                default: item.id === equipment.currentPickaxe,
            };
        }),
        ...(handPickaxe ? [{
            label: String(handPickaxe.name).slice(0, 100),
            value: handPickaxe.id,
            description: 'Always available | Durability: ∞',
            default: handPickaxe.id === equipment.currentPickaxe || !equipment.currentPickaxe,
        }] : []),
    ];

    const helmetOptions = [
        { label: 'No helmet', value: 'none', description: 'Leave the helmet slot empty (no protection)', default: !equipment.currentHelmet },
        ...availableHelmets.map(item => {
            const hasUsable = inventory.some(inv => inv.item_id === item.id && !inv.item_name?.startsWith('Broken '));
            const maxHp = item.stats?.health || 15;
            const currentHp = hasUsable
                ? (equipment.helmetHealths?.[item.id] ?? (item.id === equipment.currentHelmet ? (equipment.helmetHealth ?? maxHp) : maxHp))
                : 0;
            const desc = !hasUsable
                ? '0 HP (Broken) - Cannot be equipped'
                : `Health: ${currentHp}/${maxHp} HP | Protects on fail (-3 HP)`;

            return {
                label: (!hasUsable ? `[Broken] ${item.name}` : String(item.name)).slice(0, 100),
                value: item.id,
                description: desc.slice(0, 100),
                default: item.id === equipment.currentHelmet,
            };
        }),
    ];

    const pickaxeSelect = new StringSelectMenuBuilder()
        .setCustomId('mine_equipment_select_pickaxe')
        .setPlaceholder('Choose a pickaxe')
        .addOptions(pickaxeOptions);

    const helmetSelect = new StringSelectMenuBuilder()
        .setCustomId('mine_equipment_select_helmet')
        .setPlaceholder('Choose a helmet')
        .addOptions(helmetOptions);

    const pickaxeDurCurrent = pickaxe?.id === 'minehand' ? '∞' : String(equipment.pickaxeDurability ?? pickaxe?.durability ?? 80);
    const pickaxeDurMax = pickaxe?.id === 'minehand' ? '∞' : String(pickaxe?.durability ?? 80);
    const pickaxeDurLine = formatStatLine(pickaxeDurCurrent, pickaxeDurMax, '', 10);
    const pickaxeStatsText = statsText(pickaxe);

    const detailsLines = [
        `**Pickaxe: ${pickaxe?.name || 'Your Hand'}**`,
        `Durability:`,
        ` ${pickaxeDurLine}`,
        ``,
        `Stats:`,
        pickaxeStatsText,
    ];

    const details = new TextDisplayBuilder().setContent(detailsLines.join('\n'));

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🧰 Mining Equipment\n> Select your pickaxe and helmet before heading underground.'))
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(new ActionRowBuilder().addComponents(pickaxeSelect));

    if (infoMessage) {
        container
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> ${infoMessage}`));
    }

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mine_equipment_back').setLabel('Go back').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mine_equipment_shop').setLabel('Open shop').setStyle(ButtonStyle.Success)
    );

    return container
        .addTextDisplayComponents(details)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(new ActionRowBuilder().addComponents(helmetSelect))
        .addActionRowComponents(navRow);
}

function backpackSellValue(items = []) {
    return items.reduce((sum, entry) => {
        const def = allItemsCache.get(entry.id) || mineCore.getMineralData(entry.id);
        return sum + ((def?.cost) || 0);
    }, 0);
}

function buildBackpackCompactLine(backpack) {
    const value = backpackSellValue(backpack.items);
    const badges = [];
    if (backpack.locked) badges.push('🔒');
    if (backpack.isActive) badges.push('**(Active)**');
    return `**${backpack.name}**${badges.length ? ' ' + badges.join(' ') : ''}\n• ${formatNumber(backpack.items.length)} / ${formatNumber(backpack.capacity)} Minerals (${formatNumber(value)} ${CURRENCY_EMOJI})`;
}

function safeSlice(text, maxLen) {
    let sliced = String(text).slice(0, maxLen);
    while (sliced.length > 0 && sliced.charCodeAt(sliced.length - 1) >= 0xD800 && sliced.charCodeAt(sliced.length - 1) <= 0xDBFF) {
        sliced = sliced.slice(0, -1);
    }
    return sliced;
}

function buildBackpackDetailText(backpack) {
    if (!backpack) return '*No backpack selected.*';
    const value = backpackSellValue(backpack.items);
    const head = `• ${formatNumber(backpack.items.length)} / ${formatNumber(backpack.capacity)} Minerals (${formatNumber(value)} ${CURRENCY_EMOJI})`;
    if (backpack.items.length === 0) return `${head}\n\n*No minerals in this backpack yet.*`;
    const mineralLines = backpack.items.map((entry, index) => {
        const def = allItemsCache.get(entry.id) || mineCore.getMineralData(entry.id);
        const name = (def && def.name) || entry.name || entry.id;
        const itemCost = (def && def.cost) || 0;
        return `**${formatNumber(index + 1)}.** ${name} — ${formatNumber(itemCost)} ${CURRENCY_EMOJI}`;
    });
    return `${head}\n\n${mineralLines.slice(0, 25).join('\n')}${mineralLines.length > 25 ? `\n…and ${formatNumber(mineralLines.length - 25)} more.` : ''}`;
}

function buildBackpack(profile = {}, inventory = [], state = null) {
    const view = state && state.view === 'detail' ? 'detail' : 'overview';
    const owned = mineBackpack.getOwnedBackpacks(profile, inventory);

    let headerContent;
    if (view === 'overview') {
        const totals = mineBackpack.getBackpackTotals(owned);
        const capLine = formatStatLine(String(totals.filled), String(totals.capacity) || '1', '', 12);
        headerContent = `# 🎒 Viewing current backpacks\n\n**Own backpacks:** ${formatNumber(owned.length)}\n**Backpacks capacity:**\n${capLine}`;
    } else {
        const backpack = owned.find(b => String(b.rowId) === String(state && state.backpackKey)) || owned[0] || null;
        if (backpack) {
            const badges = [];
            if (backpack.locked) badges.push('🔒');
            if (backpack.isActive) badges.push('**(Active)**');
            const capLine = formatStatLine(String(backpack.items.length), String(backpack.capacity), '', 12);
            headerContent = `## ${backpack.name}${badges.length ? ' ' + badges.join(' ') : ''}\n**Own backpacks:** ${formatNumber(owned.length)}\n**Backpacks capacity:**\n${capLine}`;
        } else {
            headerContent = `# 🎒 Backpacks\n> Viewing current backpacks\n\n**Own backpacks:** 0\n**Backpacks capacity:**\n${formatStatLine('0', '1', '', 12)}`;
        }
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent));

    if (owned.length === 0) {
        container.addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('*You do not own any backpacks yet! Visit the shop to buy one.*'));
    } else if (view === 'overview') {
        const freeCount = mineBackpack.FREE_SLOT_COUNT;
        const maxPages = Math.max(1, Math.ceil(owned.length / freeCount));
        const page = Math.min(Math.max(0, Number(state && state.page) || 0), maxPages - 1);
        const slotLines = [];
        for (let i = 0; i < freeCount; i++) {
            const backpack = owned[page * freeCount + i];
            slotLines.push(backpack ? buildBackpackCompactLine(backpack) : '❌ ***No slot***');
        }

        let body = slotLines.join('\n\n');
        const pageNote = maxPages > 1 ? `\n\n_Arrows: page ${formatNumber(page + 1)}/${formatNumber(maxPages)} (${formatNumber(owned.length)} backpacks)_` : '';
        body = `${body}${pageNote}`;
        if (body.length > 1900) body = safeSlice(body, 1900);
        container.addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

        if (maxPages > 1) {
            container.addActionRowComponents(getPaginationRow(page, maxPages));
        }
    } else {
        const backpack = owned.find(b => String(b.rowId) === String(state && state.backpackKey)) || owned[0] || null;
        container.addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(backpack ? buildBackpackDetailText(backpack) : '*No backpack selected.*'));
    }

    if (view === 'overview') {
        const menuOptions = [
            { label: 'All backpacks', value: 'all', description: 'View every owned backpack', default: true },
            ...owned.map(backpack => {
                const option = {
                    label: `${backpack.name} (${formatNumber(backpack.items.length)}/${formatNumber(backpack.capacity)})`,
                    value: backpack.rowId,
                    default: false,
                };
                option.description = backpack.locked ? '🔒 Locked' : (backpack.isActive ? 'Active backpack' : 'Backpack');
                return option;
            }),
        ].slice(0, 25);

        container.addSeparatorComponents(new SeparatorBuilder())
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('mine_backpack_select')
                        .setPlaceholder('Select a backpack to view')
                        .addOptions(menuOptions)
                )
            );
    }

    if (view === 'detail' && state && state.showMineralSelect) {
        const backpack = owned.find(b => String(b.rowId) === String(state && state.backpackKey)) || owned[0] || null;
        if (backpack && backpack.items.length > 0) {
            const mineralOptions = backpack.items.map((entry, index) => {
                const def = allItemsCache.get(entry.id) || mineCore.getMineralData(entry.id);
                const option = {
                    label: `${formatNumber(index + 1)}. ${(def && def.name) || entry.name || entry.id}`,
                    value: `${backpack.rowId}:${index}`,
                };
                if (def && typeof def.cost === 'number') option.description = `${formatNumber(def.cost)} ${CURRENCY_EMOJI}`;
                return option;
            });
            container.addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('mine_backpack_mineral_select')
                        .setPlaceholder('Select a mineral to sell')
                        .addOptions(mineralOptions)
                )
            );
        } else {
            container.addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('> *This backpack has no minerals to sell.*'));
        }
    }

    let buttonsRow;
    if (view === 'overview') {
        buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('mine_menu_back').setLabel('Go back').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('mine_backpack_shop').setLabel('Visit shop').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('mine_backpack_sell_all').setLabel('Sell all minerals').setStyle(ButtonStyle.Danger)
        );
    } else {
        const backpack = owned.find(b => String(b.rowId) === String(state && state.backpackKey)) || owned[0] || null;
        const locked = Boolean(backpack && backpack.locked);
        const isEmpty = Boolean(!backpack || backpack.items.length === 0);
        buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('mine_backpack_back').setLabel('Go back').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('mine_backpack_sell_all').setLabel('Sell all minerals').setStyle(ButtonStyle.Danger).setDisabled(locked),
            new ButtonBuilder().setCustomId('mine_backpack_select_mineral_toggle').setLabel(state && state.showMineralSelect ? 'Hide list' : 'Select mineral').setStyle(ButtonStyle.Primary).setDisabled(locked || isEmpty),
            new ButtonBuilder().setCustomId('mine_backpack_lock').setLabel(locked ? '🔓 Unlock' : '🔒 Lock').setStyle(locked ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(buttonsRow);

    if (view === 'detail') {
        const nav = mineBackpack.getBackpackNavigation(profile, inventory, state && state.backpackKey);
        container.addSeparatorComponents(new SeparatorBuilder())
            .addActionRowComponents(getPaginationRow(nav.index, nav.total));
    }
    return container;
}

function buildPlaceholder(section) {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${section}`))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('*This section is coming soon.*'))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('mine_menu_back').setLabel('Back to Mining').setStyle(ButtonStyle.Secondary)
        ));
}

function getCellLabel(cell, revealAll, flagMode) {
    if (!cell) return CELL_EMOJI.hidden;
    if (cell.type === 'cashout') return '💸';
    if (cell.type === 'filler') return '⬛';

    if (!cell.revealed && !revealAll) {
        return cell.flagged ? '🚩' : CELL_EMOJI.hidden;
    }
    if (cell.type === 'bomb') return CELL_EMOJI.bomb;
    if (cell.type === 'goldmine') return '💰';
    if (cell.type === 'chest') return '🎁';
    if (cell.type === 'trap') return '🕸️';
    if (cell.type === 'mineral') return CELL_EMOJI.mineral;
    if (cell.type === 'empty') return (cell.adjacentMines ? COUNT_EMOJI[cell.adjacentMines] : CELL_EMOJI.empty);
    return CELL_EMOJI.hidden;
}

function buildButtonRows(session, revealAll = false) {
    const rows = [];
    const board = session.board || [];
    const flagMode = session.flagMode || false;

    for (let r = 0; r < 5; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 5; c++) {
            const idx = r * 5 + c;
            const cell = board[idx];
            const label = getCellLabel(cell, revealAll, flagMode);
            let customId = `mine_cell_${idx}`;
            let disabled = revealAll || session.status !== 'playing';
            let style = ButtonStyle.Secondary;

            if (idx === 22 || idx === 23) {
                customId = `mine_filler_${idx}`;
                disabled = true;
                style = ButtonStyle.Secondary;
            } else if (idx === 24) {
                customId = 'mine_cashout';
                style = ButtonStyle.Success;
                disabled = revealAll || session.status !== 'playing';
            } else if (!cell || !cell.revealed) {
                customId = `mine_cell_${idx}`;
                if (flagMode) {
                    style = cell.flagged ? ButtonStyle.Success : ButtonStyle.Secondary;
                } else {
                    if (cell.flagged) {
                        disabled = true;
                    }
                }
            } else if (cell.type === 'mineral') {
                if (cell.committed) {
                    customId = `mine_cell_${idx}`;
                    disabled = true;
                    style = ButtonStyle.Success;
                } else if (cell.keepable) {
                    customId = `mine_keep_${idx}`;
                    disabled = revealAll || session.status !== 'playing';
                    style = ButtonStyle.Primary;
                } else {
                    customId = `mine_cell_${idx}`;
                    disabled = true;
                    style = ButtonStyle.Success;
                }
            } else {
                customId = `mine_cell_${idx}`;
                disabled = true;
                style = ButtonStyle.Success;
            }

            row.addComponents(new ButtonBuilder()
                .setCustomId(customId)
                .setLabel(label)
                .setStyle(style)
                .setDisabled(disabled));
        }
        rows.push(row);
    }
    return rows;
}

function buildBoardContainer(user, stats, session, { revealAll = false, notice = null } = {}) {
    const flagMode = session.flagMode || false;
    const frozenLeft = session.frozenUntil && session.frozenUntil > Date.now()
        ? ` · ❄️ Frozen ${Math.ceil((session.frozenUntil - Date.now()) / 1000)}s`
        : '';
    const footer = `-# Safe tiles: ${formatNumber(session.revealedCount || 0)}/${formatNumber(session.safeCells || 0)}${frozenLeft}`;
    const bodyText = `${notice ? `> ${notice}\n\n` : ''}${footer}`;
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⛏️ Mining · ${user.username}`))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyText));

    for (const row of buildButtonRows(session, revealAll)) {
        container.addActionRowComponents(row);
    }

    const isPlaying = !revealAll && session.status === 'playing';
    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('mine_flagToggle')
            .setLabel(flagMode ? '🚩 Flag Mode: ON' : '🚩 Flag Mode')
            .setStyle(flagMode ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!isPlaying),
        new ButtonBuilder()
            .setCustomId('mine_exit')
            .setLabel('🚪 Exit')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!isPlaying)
    );
    container.addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(controlRow);

    return container;
}

function buildLocation(profile = {}, notice = null) {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 📍 Mining Location\n> Select a mining site to start excavating.'))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('🔒 **UNDER CONSTRUCTION**\n*New mining locations are being surveyed! Default Mine is currently active.*'));

    if (notice) {
        container.addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> ${notice}`));
    }

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mine_menu_back').setLabel('Back to Mining').setStyle(ButtonStyle.Secondary)
    );

    return container
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(navRow);
}

function buildSkill(profile = {}, notice = null) {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🧠 Mining Skills\n> Level up your mining masteries to extract rare ores.'))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('*Mining skill tree is coming soon!*'));

    if (notice) {
        container.addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> ${notice}`));
    }

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mine_menu_back').setLabel('Back to Mining').setStyle(ButtonStyle.Secondary)
    );

    return container
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(navRow);
}

module.exports = {
    buildMain,
    buildBackpack,
    buildEquipment,
    buildLocation,
    buildSkill,
    buildPlaceholder,
    buildBoardContainer,
    buildButtonRows,
};
