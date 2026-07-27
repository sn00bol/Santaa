const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const rpgmanager = require('../../../database/rpgmanager');
const dbmanager = require('../../../database/dbmanager');
const fs = require('fs');
const path = require('path');
const { applySelectMenuDefaults } = require('../Utils/NavigateManager');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');

const ITEMS_PER_PAGE = 25; // Discord Select Menu limit
const TRADE_TIMEOUT = 120_000; // 2 minutes

/** Load all known items into a Map<id, itemData> */
const loadItems = () => {
    const shopItemsRoot = path.join(__dirname, '..', '..', 'items', 'shopItems');
    const legacyShopItemsRoot = path.join(__dirname, 'shopUtils');
    const allItems = new Map();
    const dirs = ['gepora', 'kimori'];

    const resolveDir = (basePath, dirName) => {
        const candidates = [path.join(basePath, dirName), path.join(legacyShopItemsRoot, dirName)];
        return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
    };

    for (const d of dirs) {
        const dirPath = resolveDir(shopItemsRoot, d);
        if (!fs.existsSync(dirPath)) continue;
        for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.js'))) {
            const item = require(path.join(dirPath, file));
            allItems.set(item.id, item);
        }
    }
    return allItems;
};

/** Build the main trade embed showing both sides */
const buildTradeEmbed = (userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB) => {
    const formatOffer = (items, money, bank) => {
        const parts = [];
        if (items.length === 0 && money === 0 && bank === 0) parts.push('*(nothing yet)*');
        if (money > 0) parts.push(`${CURRENCY_EMOJI} **$${money.toLocaleString()}** (Balance)`);
        if (bank > 0) parts.push(`🏦 **$${bank.toLocaleString()}** (Bank)`);
        items.forEach(it => parts.push(`• ${it.item_name} (\`${it.item_id}\`)`));
        return parts.join('\n');
    };

    return new EmbedBuilder()
        .setTitle('🔄 Trade in Progress')
        .setColor(0x5865F2)
        .addFields(
            {
                name: `${readyA ? '✅' : '⏳'} ${userA.username}'s Offer`,
                value: formatOffer(offerA, moneyA, bankA),
                inline: true,
            },
            { name: '\u200B', value: '⇌', inline: true },
            {
                name: `${readyB ? '✅' : '⏳'} ${userB.username}'s Offer`,
                value: formatOffer(offerB, moneyB, bankB),
                inline: true,
            }
        )
        .setFooter({ text: 'Both must click ✅ Ready to confirm • Trade expires in 2 minutes' });
};

/** Build Select Menu rows for a user's inventory page */
const buildSelectRows = (inventoryItems, page, side, username, selectedId) => {
    const rows = [];
    const totalPages = Math.max(1, Math.ceil(inventoryItems.length / ITEMS_PER_PAGE));
    const start = page * ITEMS_PER_PAGE;
    const pageItems = inventoryItems.slice(start, start + ITEMS_PER_PAGE);

    if (pageItems.length > 0) {
        let options = pageItems.map((item, idx) => ({
            label: `${start + idx + 1}. ${item.item_name}`,
            value: item.id.toString(),
            description: `ID: ${item.item_id}`,
        }));
        options = applySelectMenuDefaults(options, selectedId);
        rows.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`trade_select_${side}`)
                    .setPlaceholder(`[${username}] Select item to add to offer (page ${page + 1}/${totalPages})`)
                    .addOptions(options)
            )
        );
    }
    // When inventory is empty, no select menu is pushed (nothing to show)

    // Pagination row per user (only if needed, kept here for reference in buildComponents)
    if (totalPages > 1) {
        rows.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`trade_prev_${side}`)
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId(`trade_next_${side}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages - 1)
            )
        );
    }

    return rows;
};

/** Shared confirm/cancel row */
const buildConfirmRow = () =>
    new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('trade_ready')
            .setLabel('✅ Ready')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('trade_cancel')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
    );

// ─── Command ────────────────────────────────────────────────────────────────

module.exports = {
    name: 'trade',
    description: 'Trade items and money with another user',
    category: 'eco',
    usage: 'Ztrade `@user`',
    notes: 'Can only trade items that are tradeable.',

    async execute(message, args) {
        const allItems = loadItems();
        const userA = message.author;

        const userB = message.mentions.users.first();
        if (!userB)
            return message.reply('Usage: `Ztrade `@user``');
        if (userB.id === userA.id)
            return message.reply('You cannot trade with yourself!');
        if (userB.bot)
            return message.reply('You cannot trade with a bot!');

        const requestEmbed = new EmbedBuilder()
            .setTitle('📨 Trade Request')
            .setColor(0xFEE75C)
            .setDescription(
                `**${userA.username}** wants to trade with **${userB.username}**!\n\n` +
                `${userB}, do you accept?`
            )
            .setFooter({ text: 'This request expires in 60 seconds.' });

        const requestRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('trade_accept')
                .setLabel('✅ Accept')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('trade_decline')
                .setLabel('❌ Decline')
                .setStyle(ButtonStyle.Danger)
        );

        const requestMsg = await message.channel.send({
            content: `${userB}`,
            embeds: [requestEmbed],
            components: [requestRow],
        });

        const requestCollector = requestMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60_000,
        });

        requestCollector.on('collect', async (i) => {
            // Only B can respond to the request
            if (i.user.id !== userB.id)
                return i.reply({ content: 'This trade request is not for you!', ephemeral: true });

            requestCollector.stop(i.customId); // pass the action as reason
        });

        requestCollector.on('end', async (_, reason) => {
            if (reason !== 'trade_accept') {
                const declineEmbed = new EmbedBuilder()
                    .setTitle('❌ Trade Declined')
                    .setColor(0xED4245)
                    .setDescription(
                        reason === 'trade_decline'
                            ? `**${userB.username}** declined the trade request.`
                            : `The trade request timed out.`
                    );
                return requestMsg.edit({ content: '', embeds: [declineEmbed], components: [] }).catch(() => { });
            }

            // Trade state
            let invA = await rpgmanager.getInventory(userA.id);
            let invB = await rpgmanager.getInventory(userB.id);

            const offerA = []; // Array of inventory rows
            const offerB = [];
            let moneyA = 0, moneyB = 0;
            let bankA = 0, bankB = 0;
            let readyA = false, readyB = false;
            let pageA = 0, pageB = 0;
            let selectedA = null, selectedB = null; // pending selected inventory id

            // Build message components
            const buildComponents = () => {
                // Available items = inventory minus already offered and minus untradeable items
                const offeredIdsA = new Set(offerA.map(it => it.id));
                const offeredIdsB = new Set(offerB.map(it => it.id));
                const availA = invA.filter(it => {
                    if (offeredIdsA.has(it.id)) return false;
                    const itemDef = allItems.get(it.item_id);
                    return !itemDef || itemDef.is_tradeable !== false;
                });
                const availB = invB.filter(it => {
                    if (offeredIdsB.has(it.id)) return false;
                    const itemDef = allItems.get(it.item_id);
                    return !itemDef || itemDef.is_tradeable !== false;
                });

                // Clamp pages
                const totalPagesA = Math.max(1, Math.ceil(availA.length / ITEMS_PER_PAGE));
                const totalPagesB = Math.max(1, Math.ceil(availB.length / ITEMS_PER_PAGE));
                if (pageA >= totalPagesA) pageA = totalPagesA - 1;
                if (pageB >= totalPagesB) pageB = totalPagesB - 1;

                // rows[0] = select menu, rows[1] = pagination (optional)
                const rowsA = buildSelectRows(availA, pageA, 'A', userA.username, selectedA);
                const rowsB = buildSelectRows(availB, pageB, 'B', userB.username, selectedB);
                const confirmRow = buildConfirmRow();
                const components = [];

                // A select menu
                if (rowsA[0]) components.push(rowsA[0]);
                // B select menu
                if (rowsB[0]) components.push(rowsB[0]);

                // Shared action buttons — one row for both users
                const hasSelectedA = selectedA !== null;
                const hasSelectedB = selectedB !== null;
                components.push(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('trade_add')
                            .setLabel('➕ Add Item')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('trade_remove')
                            .setLabel('🗑️ Remove Last')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('trade_money')
                            .setLabel(`${CURRENCY_EMOJI} Set Money`)
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('trade_bank')
                            .setLabel('🏦 Set Bank')
                            .setStyle(ButtonStyle.Secondary),
                    )
                );

                // Merged pagination row (A prev/next + B prev/next) — only shown if either needs it
                const needsPagA = availA.length > ITEMS_PER_PAGE;
                const needsPagB = availB.length > ITEMS_PER_PAGE;
                if (needsPagA || needsPagB) {
                    const pagRow = new ActionRowBuilder();
                    if (needsPagA) {
                        pagRow.addComponents(
                            new ButtonBuilder().setCustomId('trade_prev_A').setLabel('A ◀').setStyle(ButtonStyle.Secondary).setDisabled(pageA === 0),
                            new ButtonBuilder().setCustomId('trade_next_A').setLabel('A ▶').setStyle(ButtonStyle.Secondary).setDisabled(pageA >= totalPagesA - 1),
                        );
                    }
                    if (needsPagB) {
                        pagRow.addComponents(
                            new ButtonBuilder().setCustomId('trade_prev_B').setLabel('B ◀').setStyle(ButtonStyle.Secondary).setDisabled(pageB === 0),
                            new ButtonBuilder().setCustomId('trade_next_B').setLabel('B ▶').setStyle(ButtonStyle.Secondary).setDisabled(pageB >= totalPagesB - 1),
                        );
                    }
                    components.push(pagRow);
                }

                // Confirm row
                components.push(confirmRow);
                return components;
            };

            const embed = buildTradeEmbed(userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB);

            await requestMsg.edit({
                content: `${userA} ${userB} — **Trade Panel** (both add items, then click ✅ Ready)`,
                embeds: [embed],
                components: buildComponents(),
            });

            const tradeCollector = requestMsg.createMessageComponentCollector({
                time: TRADE_TIMEOUT,
            });

            tradeCollector.on('collect', async (i) => {
                try {
                    const isA = i.user.id === userA.id;
                    const isB = i.user.id === userB.id;

                    if (!isA && !isB)
                        return i.reply({ content: 'You are not part of this trade!', ephemeral: true });

                    const side = isA ? 'A' : 'B';

                    if (i.isStringSelectMenu()) {
                        // Route by WHO clicked, not which dropdown — ensures A's selection always goes to selectedA
                        if (isA) selectedA = i.values[0];
                        else if (isB) selectedB = i.values[0];
                        return i.update({ embeds: [buildTradeEmbed(userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB)], components: buildComponents() });
                    }

                    if (!i.isButton()) return;

                    if (i.customId === 'trade_add') {
                        const pending = side === 'A' ? selectedA : selectedB;
                        if (!pending)
                            return i.reply({ content: '⚠️ Select an item from the dropdown first!', ephemeral: true });

                        const inv = side === 'A' ? invA : invB;
                        const offer = side === 'A' ? offerA : offerB;
                        const offeredIds = new Set(offer.map(it => it.id));

                        const item = inv.find(it => it.id.toString() === pending && !offeredIds.has(it.id));
                        if (!item)
                            return i.reply({ content: '⚠️ Item not available!', ephemeral: true });

                        // Check if item is tradeable
                        const itemDataCheck = allItems.get(item.item_id);
                        if (itemDataCheck && !itemDataCheck.is_tradeable) {
                            return i.reply({ content: '🔒 Vật phẩm này bị khóa (untradeable), không thể giao dịch!', ephemeral: true });
                        }

                        offer.push(item);
                        if (side === 'A') { selectedA = null; readyA = false; }
                        else { selectedB = null; readyB = false; }

                        return i.update({ embeds: [buildTradeEmbed(userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB)], components: buildComponents() });
                    }

                    if (i.customId === 'trade_remove') {
                        const offer = side === 'A' ? offerA : offerB;
                        if (offer.length === 0)
                            return i.reply({ content: '⚠️ Your offer is already empty!', ephemeral: true });

                        offer.pop();
                        if (side === 'A') readyA = false;
                        else readyB = false;

                        return i.update({ embeds: [buildTradeEmbed(userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB)], components: buildComponents() });
                    }

                    if (i.customId === 'trade_money') {
                        await i.reply({ content: '💬 Type the **Balance** amount you want to add (type `0` to remove):', ephemeral: true });
                        const filter = m => m.author.id === i.user.id;
                        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30_000 }).catch(() => null);
                        if (!collected || collected.size === 0) return;

                        const val = parseInt(collected.first().content);
                        collected.first().delete().catch(() => { });
                        if (isNaN(val) || val < 0)
                            return message.channel.send({ content: `${i.user} ❌ Invalid amount.`, allowedMentions: { users: [i.user.id] } }).then(m => setTimeout(() => m.delete().catch(() => { }), 4000));

                        // Validate user has enough
                        const userDb = await dbmanager.getUser(i.user.id);
                        if (val > userDb.balance)
                            return message.channel.send({ content: `${i.user} ❌ You only have **$${userDb.balance.toLocaleString()}** balance.`, allowedMentions: { users: [i.user.id] } }).then(m => setTimeout(() => m.delete().catch(() => { }), 4000));

                        if (side === 'A') { moneyA = val; readyA = false; }
                        else { moneyB = val; readyB = false; }

                        return requestMsg.edit({ embeds: [buildTradeEmbed(userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB)], components: buildComponents() });
                    }

                    if (i.customId === 'trade_bank') {
                        await i.reply({ content: '💬 Type the **Bank Balance** amount you want to add (type `0` to remove):', ephemeral: true });
                        const filter = m => m.author.id === i.user.id;
                        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30_000 }).catch(() => null);
                        if (!collected || collected.size === 0) return;

                        const val = parseInt(collected.first().content);
                        collected.first().delete().catch(() => { });
                        if (isNaN(val) || val < 0)
                            return message.channel.send({ content: `${i.user} ❌ Invalid amount.`, allowedMentions: { users: [i.user.id] } }).then(m => setTimeout(() => m.delete().catch(() => { }), 4000));

                        const userDb = await dbmanager.getUser(i.user.id);
                        if (val > userDb.bank)
                            return message.channel.send({ content: `${i.user} ❌ You only have **$${userDb.bank.toLocaleString()}** bank balance.`, allowedMentions: { users: [i.user.id] } }).then(m => setTimeout(() => m.delete().catch(() => { }), 4000));

                        if (side === 'A') { bankA = val; readyA = false; }
                        else { bankB = val; readyB = false; }

                        return requestMsg.edit({ embeds: [buildTradeEmbed(userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB)], components: buildComponents() });
                    }

                    if (i.customId === `trade_prev_${side}`) {
                        if (side === 'A' && pageA > 0) pageA--;
                        if (side === 'B' && pageB > 0) pageB--;
                        return i.update({ embeds: [buildTradeEmbed(userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB)], components: buildComponents() });
                    }
                    if (i.customId === `trade_next_${side}`) {
                        const offeredIdsA = new Set(offerA.map(it => it.id));
                        const offeredIdsB = new Set(offerB.map(it => it.id));
                        const availA = invA.filter(it => !offeredIdsA.has(it.id));
                        const availB = invB.filter(it => !offeredIdsB.has(it.id));
                        const maxPagesA = Math.max(1, Math.ceil(availA.length / ITEMS_PER_PAGE));
                        const maxPagesB = Math.max(1, Math.ceil(availB.length / ITEMS_PER_PAGE));
                        if (side === 'A' && pageA < maxPagesA - 1) pageA++;
                        if (side === 'B' && pageB < maxPagesB - 1) pageB++;
                        return i.update({ embeds: [buildTradeEmbed(userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB)], components: buildComponents() });
                    }

                    if (i.customId === 'trade_ready') {
                        if (side === 'A') readyA = true;
                        else readyB = true;

                        if (readyA && readyB) {
                            tradeCollector.stop('confirmed');
                            return;
                        }

                        return i.update({ embeds: [buildTradeEmbed(userA, userB, offerA, offerB, moneyA, moneyB, bankA, bankB, readyA, readyB)], components: buildComponents() });
                    }

                    if (i.customId === 'trade_cancel') {
                        tradeCollector.stop('cancelled');
                        await i.update({
                            content: '',
                            embeds: [new EmbedBuilder().setTitle('❌ Trade Cancelled').setColor(0xED4245).setDescription(`**${i.user.username}** cancelled the trade.`)],
                            components: [],
                        });
                    }
                } catch (err) {
                    console.error('[Trade] Collector error:', err);
                    if (!i.replied && !i.deferred) {
                        await i.deferUpdate().catch(() => { });
                    }
                }
            });

            tradeCollector.on('end', async (_, reason) => {
                if (reason === 'cancelled' || reason === 'time') {
                    if (reason === 'time') {
                        requestMsg.edit({
                            content: '',
                            embeds: [new EmbedBuilder().setTitle('⏰ Trade Expired').setColor(0x99AAB5).setDescription('The trade timed out.')],
                            components: [],
                        }).catch(() => { });
                    }
                    return;
                }

                if (reason !== 'confirmed') return;

                try {
                    // Re-validate balances before executing
                    const dbA = await dbmanager.getUser(userA.id);
                    const dbB = await dbmanager.getUser(userB.id);

                    if (moneyA > dbA.balance || bankA > dbA.bank || moneyB > dbB.balance || bankB > dbB.bank) {
                        return requestMsg.edit({
                            content: '',
                            embeds: [new EmbedBuilder().setTitle('❌ Trade Failed').setColor(0xED4245).setDescription('One of the traders no longer has sufficient funds. Trade aborted.')],
                            components: [],
                        }).catch(() => { });
                    }

                    // Transfer items
                    for (const item of offerA) await rpgmanager.transferItem(item.id, userB.id);
                    for (const item of offerB) await rpgmanager.transferItem(item.id, userA.id);

                    // Transfer money (balance)
                    if (moneyA > 0) { await dbmanager.removeMoney(userA.id, moneyA); await dbmanager.addMoney(userB.id, moneyA); }
                    if (moneyB > 0) { await dbmanager.removeMoney(userB.id, moneyB); await dbmanager.addMoney(userA.id, moneyB); }

                    // Transfer bank
                    if (bankA > 0) { await dbmanager.removeBank(userA.id, bankA); await dbmanager.addBank(userB.id, bankA); }
                    if (bankB > 0) { await dbmanager.removeBank(userB.id, bankB); await dbmanager.addBank(userA.id, bankB); }

                    const formatResult = (items, money, bank) => {
                        const parts = [];
                        if (money > 0) parts.push(`$${CURRENCY_EMOJI} $${money.toLocaleString()} Balance`);
                        if (bank > 0) parts.push(`🏦 $${bank.toLocaleString()} Bank`);
                        items.forEach(it => parts.push(`• ${it.item_name}`));
                        return parts.length > 0 ? parts.join('\n') : '*(nothing)*';
                    };

                    const resultEmbed = new EmbedBuilder()
                        .setTitle('✅ Trade Complete!')
                        .setColor(0x57F287)
                        .addFields(
                            { name: `${userB.username} received`, value: formatResult(offerA, moneyA, bankA), inline: true },
                            { name: '\u200B', value: '⇌', inline: true },
                            { name: `${userA.username} received`, value: formatResult(offerB, moneyB, bankB), inline: true }
                        )
                        .setTimestamp();

                    await requestMsg.edit({ content: '', embeds: [resultEmbed], components: [] });
                } catch (err) {
                    console.error('[Trade] Error executing trade:', err);
                    requestMsg.edit({
                        content: '',
                        embeds: [new EmbedBuilder().setTitle('❌ Trade Error').setColor(0xED4245).setDescription('An error occurred while processing the trade. No changes were made.')],
                        components: [],
                    }).catch(() => { });
                }
            });
        });
    },
};
