const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const formatNumber = require('../../commands/Utils/formatNumber');

const CELL_EMOJI = {
    hidden: '🔲',
    empty: '🟫',
    bomb: '💣',
    mineral: '💎',
};

const COUNT_EMOJI = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];

function buildEmbed(user, stats, session) {
    const title = `Mining — ${user.username}`;
    const description = 'Click a tile to mine. Cash Out anytime to keep loot.';
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .addFields(
            { name: 'HP / Revealed', value: `${formatNumber(stats.health)}/100 • ${formatNumber(session.revealedCount || 0)}/${formatNumber(session.safeCells || 0)}` },
            { name: 'Session Loot', value: (session.sessionLoot && session.sessionLoot.length) ? session.sessionLoot.map(m => `${m.name}`).join(', ') : 'None' }
        );
    return embed;
}

function getCellLabel(cell, revealAll) {
    if (!cell) return CELL_EMOJI.hidden;
    if (!cell.revealed && !revealAll) return CELL_EMOJI.hidden;
    if (cell.type === 'cashout') return 'Cash';
    if (cell.type === 'bomb') return CELL_EMOJI.bomb;
    if (cell.type === 'mineral') return CELL_EMOJI.mineral;
    if (cell.type === 'empty') return (cell.adjacentMines ? COUNT_EMOJI[cell.adjacentMines] : CELL_EMOJI.empty);
    return CELL_EMOJI.hidden;
}

function buildButtonRows(session, revealAll = false) {
    const rows = [];
    const board = session.board || [];

    for (let r = 0; r < 5; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 5; c++) {
            const idx = r * 5 + c;
            // skip building a 5th column on last row (index 24 is cashout)
            if (idx >= 25) continue;
            const cell = board[idx];
            const label = getCellLabel(cell, revealAll);

            // For playable indices (0..23) use mine_cell_X, for index 24 use mine_cashout custom id
            let customId;
            let disabled = revealAll || session.status !== 'playing';
            let style = ButtonStyle.Secondary;

            if (idx === 24) {
                customId = 'mine_cashout';
            } else if (!cell || !cell.revealed) {
                customId = `mine_cell_${idx}`;
                disabled = disabled;
            } else {
                // revealed cell
                if (cell.type === 'mineral') {
                    if (cell.committed) {
                        customId = `mine_cell_${idx}`;
                        disabled = true;
                        style = ButtonStyle.Success;
                    } else if (cell.keepable) {
                        customId = `mine_keep_${idx}`;
                        disabled = false; // allow keeping
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
            }

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(disabled)
            );
        }
        rows.push(row);
    }
    // Adjust last row: ensure cashout is at last position, and there are only 5 rows max
    return rows.slice(0, 5);
}

module.exports = { buildEmbed, buildButtonRows };
