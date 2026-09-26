const {
    ActionRowBuilder,
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const dbmanager = require('../../../database/dbmanager');
const rpgmanager = require('../../../database/rpgmanager');
const achievementManager = require('../../minigames/achievement/achievementManager');
const { allItemsCache } = require('../Utils/StatsCalculator');
const { getPaginationRow } = require('../Utils/NavigateManager');
const formatNumber = require('../Utils/formatNumber');
const { CURRENCY_EMOJI } = require('../Utils/config');

const PAGE_SIZE = 5;
const MODES = new Set(['stat', 'item', 'achieve', 'user']);
const SCOPES = new Set(['global', 'server']);
const SCOPE_OPTIONS = [
    { label: 'Global', value: 'global' },
    { label: 'Server', value: 'server' },
];
const STAT_OPTIONS = [
    { key: 'money', label: 'Total Money' },
    { key: 'balance', label: 'Balance' },
    { key: 'bank', label: 'Bank' },
    { key: 'level', label: 'Level' },
    { key: 'wins', label: 'PvP Wins' },
    { key: 'pvp_rank', label: 'PvP Rank' },
    { key: 'steals', label: 'Steals' },
    { key: 'crimes', label: 'Crimes' },
    { key: 'begs', label: 'Begs' },
];
const MEDALS = { 1: '\uD83E\uDD47', 2: '\uD83E\uDD48', 3: '\uD83E\uDD49' };

function parseLeaderboardRequest(args = [], slashOptions = {}) {
    const firstArg = String(slashOptions.mode || args[0] || '').toLowerCase();
    const hasMode = MODES.has(firstArg);
    const mode = hasMode ? firstArg : 'stat';
    const positional = hasMode ? args.slice(1) : args;
    const positionalScope = [...positional].reverse().find(value => SCOPES.has(String(value).toLowerCase()));

    if (mode === 'stat') {
        const stat = String(slashOptions.stat || (hasMode ? positional[0] : args[0]) || 'money').toLowerCase();
        return {
            mode,
            stat,
            scope: String(slashOptions.scope || positionalScope || 'global').toLowerCase(),
        };
    }

    if (mode === 'item') {
        let itemName = String(slashOptions.item || '').trim();
        let itemScope = String(slashOptions.scope || '').toLowerCase();
        if (!itemName) {
            const itemArgs = [...positional];
            const lastArg = String(itemArgs[itemArgs.length - 1] || '').toLowerCase();
            if (!itemScope && SCOPES.has(lastArg)) itemScope = itemArgs.pop().toLowerCase();
            itemName = itemArgs.join(' ').trim();
        }
        return { mode, itemName, scope: itemScope || 'global' };
    }

    if (mode === 'user') {
        return {
            mode,
            userId: slashOptions.user || positional[0] || '',
            scope: String(slashOptions.scope || positionalScope || 'global').toLowerCase(),
        };
    }

    return { mode: 'achieve', scope: 'global' };
}

function sortLeaderboardRows(rows) {
    return [...rows]
        .sort((first, second) => {
            const scoreDifference = Number(second.score || 0) - Number(first.score || 0);
            if (scoreDifference !== 0) return scoreDifference;
            const tieDifference = Number(second.tieBreaker || 0) - Number(first.tieBreaker || 0);
            return tieDifference || String(first.userId).localeCompare(String(second.userId));
        })
        .map((row, index) => ({ ...row, rank: index + 1 }));
}

function hasLeaderboardArguments(args = [], slashOptions = {}) {
    return args.length > 0 || Object.values(slashOptions).some(value => value !== undefined && value !== null && value !== '');
}

function createMainMenu(commandText) {
    const prefix = process.env.PFX || 'Z';
    const enteredCommand = String(commandText || `${prefix}leaderboard`).trim();
    const content = [
        `**"${enteredCommand}" is not valid, check these:**`,
        '',
        `- ${prefix}leaderboard \`stat?\` \`scope?\``,
        '-# Traditional leaderboard: money, bank, level, PvP wins/rank,...',
        '',
        `- ${prefix}leaderboard \`item?\` \`scope?\``,
        '-# Rank players by how many copies of an item they own',
        '',
        `- ${prefix}leaderboard \`achieve\``,
        '-# Rank players by their total earned achievements. Scope is not used',
        '',
        `- ${prefix}leaderboard \`user?\` \`scope?\``,
        '-# View every supported rank for a user',
    ].join('\n');

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function parseProfile(profileValue) {
    if (profileValue && typeof profileValue === 'object') return profileValue;
    try {
        return JSON.parse(profileValue || '{}');
    } catch {
        return {};
    }
}

function resolveItem(itemName) {
    const normalizedName = String(itemName || '').trim().toLowerCase();
    if (!normalizedName) return null;

    for (const [itemId, item] of allItemsCache) {
        if (String(itemId).toLowerCase() === normalizedName || String(item.name || '').toLowerCase() === normalizedName) {
            return { id: itemId, name: item.name || itemId };
        }
    }
    return null;
}

async function getServerMemberIds(message, scope, scopeCache) {
    if (scope === 'global') return null;
    if (scope !== 'server') throw new Error('Scope must be `global` or `server`. Friend scope is unavailable.');
    if (!message.guild) throw new Error('Server scope can only be used inside a server.');

    if (scopeCache?.has(message.guild.id)) return scopeCache.get(message.guild.id);
    const members = await message.guild.members.fetch();
    const memberIds = new Set(members.filter(member => !member.user.bot).keys());
    scopeCache?.set(message.guild.id, memberIds);
    return memberIds;
}

function applyScope(rows, memberIds) {
    if (!memberIds) return rows;
    return rows.filter(row => memberIds.has(String(row.userId)));
}

async function getStatLeaderboard(statKey) {
    if (!STAT_OPTIONS.some(stat => stat.key === statKey)) {
        throw new Error(`Unknown stat \`${statKey}\`. Choose one of: ${STAT_OPTIONS.map(stat => stat.key).join(', ')}.`);
    }

    if (['money', 'balance', 'bank'].includes(statKey)) {
        const finances = await dbmanager.getFinancialLeaderboard();
        return finances.map(row => {
            const score = statKey === 'money' ? row.totalAssets : Number(row[statKey] || 0);
            return {
                userId: row.user_id,
                score,
                displayValue: `${CURRENCY_EMOJI} ${formatNumber(score)}`,
            };
        });
    }

    const stats = await rpgmanager.getLeaderboardStats();
    return stats.map(row => {
        const wins = Number(row.pvp_wins || 0);
        const losses = Number(row.pvp_losses || 0);
        const matchCount = wins + losses;
        const winRate = matchCount ? (wins / matchCount) * 100 : 0;
        const score = statKey === 'pvp_rank' ? winRate : Number(row[statKey === 'wins' ? 'pvp_wins' : statKey] || 0);
        const displayValue = statKey === 'pvp_rank'
            ? `${formatNumber(Math.round(winRate))}% win rate (${formatNumber(wins)}W/${formatNumber(losses)}L)`
            : formatNumber(score);

        return {
            userId: row.user_id,
            score,
            displayValue,
            tieBreaker: wins,
        };
    });
}

async function getAchievementLeaderboard() {
    const achievements = achievementManager.getAchievements();
    const achievementIds = new Set(achievements.map(achievement => achievement.id));
    const stats = await rpgmanager.getLeaderboardStats();

    return stats.map(row => {
        const earned = new Set(parseProfile(row.fishing_profile).achievements || []);
        const score = [...earned].filter(achievementId => achievementIds.has(achievementId)).length;
        return {
            userId: row.user_id,
            score,
            displayValue: `${formatNumber(score)} / ${formatNumber(achievementIds.size)} achievements`,
        };
    });
}

async function getItemLeaderboard(itemName) {
    const item = resolveItem(itemName);
    if (!item) throw new Error(`Item \`${itemName || ''}\` not found. Use an item ID or exact item name.`);
    const owners = await rpgmanager.getItemOwnershipLeaderboard(item.id);
    return owners.map(row => ({
        userId: row.user_id,
        score: Number(row.owned_count || 0),
        displayValue: `${formatNumber(row.owned_count)} owned`,
    }));
}

async function resolveUsername(message, userId) {
    try {
        const cachedMember = message.guild?.members.cache.get(userId);
        if (cachedMember) return cachedMember.displayName;
        if (message.guild) {
            const member = await message.guild.members.fetch(userId).catch(() => null);
            if (member) return member.displayName;
        }
        const cachedUser = message.client.users.cache.get(userId);
        if (cachedUser) return cachedUser.globalName || cachedUser.username;
        const user = await message.client.users.fetch(userId).catch(() => null);
        if (user) return user.globalName || user.username;
    } catch { }
    return `<@${userId}>`;
}

async function addNames(message, rows) {
    return Promise.all(rows.map(async row => ({
        ...row,
        name: await resolveUsername(message, row.userId),
    })));
}

async function getUserOverview(message, userId, scope, memberIds) {
    await Promise.all([dbmanager.getUser(userId), rpgmanager.getStats(userId)]);
    const overview = await Promise.all(STAT_OPTIONS.map(async stat => {
        const allRows = sortLeaderboardRows(applyScope(await getStatLeaderboard(stat.key), memberIds));
        const position = allRows.find(row => row.userId === userId);
        return {
            rank: stat.key,
            label: stat.label,
            score: position?.score || 0,
            displayValue: position?.displayValue || 'No data',
            position: position?.rank || null,
            total: allRows.length,
        };
    }));

    return {
        rows: overview.map((row, index) => ({
            userId,
            rank: index + 1,
            score: row.score,
            label: row.label,
            displayValue: row.position ? `#${formatNumber(row.position)} of ${formatNumber(row.total)} · ${row.displayValue}` : row.displayValue,
        })),
        position: null,
        title: `Ranks for ${await resolveUsername(message, userId)}`,
        positionLabel: `Scope: ${scope}`,
        overview: true,
    };
}

async function getLeaderboardData(message, request, invokerId, scopeCache) {
    const scope = request.mode === 'achieve' ? 'global' : request.scope;
    const memberIds = await getServerMemberIds(message, scope, scopeCache);

    if (request.mode === 'user') {
        const rawUserId = request.userId || message.mentions.users.first()?.id;
        const userId = String(rawUserId || '').match(/^<@!?(\d+)>$/)?.[1] || String(rawUserId || '');
        if (!/^\d{17,20}$/.test(userId)) throw new Error('Use `Zleaderboard user @user [global|server]`.');
        if (memberIds && !memberIds.has(userId)) throw new Error('That user is not a member of this server.');
        return getUserOverview(message, userId, scope, memberIds);
    }

    let rows;
    let title;
    if (request.mode === 'stat') {
        rows = await getStatLeaderboard(request.stat);
        const stat = STAT_OPTIONS.find(option => option.key === request.stat);
        title = `${stat.label} ${scope} Leaderboard`;
    } else if (request.mode === 'item') {
        const item = resolveItem(request.itemName);
        if (!item) throw new Error(`Item \`${request.itemName || ''}\` not found. Use an item ID or exact item name.`);
        rows = await getItemLeaderboard(item.id);
        title = `${item.name} ${scope} Leaderboard`;
    } else {
        rows = await getAchievementLeaderboard();
        title = 'Achievement Leaderboard';
    }

    const sortedRows = sortLeaderboardRows(applyScope(rows, memberIds));
    const position = sortedRows.find(row => row.userId === invokerId);
    return {
        rows: sortedRows,
        position: position?.rank || null,
        title,
        positionLabel: `My position: ${position ? `#${formatNumber(position.rank)}` : '—'}`,
        overview: false,
    };
}

async function addCurrentPageNames(message, data, page) {
    if (data.overview) return data;
    const start = page * PAGE_SIZE;
    const visibleRows = data.rows.slice(start, start + PAGE_SIZE);
    const namedRows = await addNames(message, visibleRows);
    return {
        ...data,
        rows: [
            ...data.rows.slice(0, start),
            ...namedRows,
            ...data.rows.slice(start + visibleRows.length),
        ],
    };
}

function createStatSelect(currentStat, disabled = false) {
    const select = new StringSelectMenuBuilder()
        .setCustomId('leaderboard_stat')
        .setPlaceholder('Select stat')
        .addOptions(STAT_OPTIONS.map(stat => ({
            label: stat.label,
            value: stat.key,
            default: stat.key === currentStat,
        })))
        .setDisabled(disabled);
    return new ActionRowBuilder().addComponents(select);
}

function createScopeSelect(currentScope, disabled = false) {
    const select = new StringSelectMenuBuilder()
        .setCustomId('leaderboard_scope')
        .setPlaceholder('Select scope')
        .addOptions(SCOPE_OPTIONS.map(scope => ({
            label: scope.label,
            value: scope.value,
            default: scope.value === currentScope,
        })))
        .setDisabled(disabled);
    return new ActionRowBuilder().addComponents(select);
}

function createLeaderboardContainer(data, request, page, disabled = false) {
    const totalPages = Math.max(1, Math.ceil(data.rows.length / PAGE_SIZE));
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const pageRows = data.rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
    const heading = new TextDisplayBuilder().setContent(
        `# ${data.title}\n-# ${data.positionLabel}`
    );
    const list = pageRows.length === 0
        ? '*No leaderboard entries found.*'
        : pageRows.map(row => {
            if (data.overview) return `**${row.label}** · ${row.displayValue}`;
            const medal = MEDALS[row.rank] || '🔹';
            const entry = `${medal} **${formatNumber(row.rank)} ${row.name}** · ${row.displayValue}`;
            return row.rank === 1 ? `## ${entry}` : entry;
        }).join('\n');

    const container = new ContainerBuilder()
        .addTextDisplayComponents(heading)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(list))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# Page ${formatNumber(currentPage + 1)} of ${formatNumber(totalPages)}`
        ));

    if (request.mode === 'stat') {
        container.addSeparatorComponents(new SeparatorBuilder())
            .addActionRowComponents(createStatSelect(request.stat, disabled));
    }
    if (request.mode !== 'achieve') {
        container.addSeparatorComponents(new SeparatorBuilder())
            .addActionRowComponents(createScopeSelect(request.scope, disabled));
    }

    const pagination = getPaginationRow(currentPage, totalPages, {
        includeReload: true,
        reloadCustomId: 'leaderboard_reload',
    });
    if (disabled) pagination.components.forEach(button => button.setDisabled(true));
    container.addSeparatorComponents(new SeparatorBuilder()).addActionRowComponents(pagination);

    return { container, totalPages, currentPage };
}

function getUserArgument(message, request, args) {
    if (request.userId) return request.userId;
    const mention = message.mentions.users.first();
    if (mention) return mention.id;
    return args.find(arg => /^<@!?\d{17,20}>$/.test(arg)) || '';
}

module.exports = {
    name: 'leaderboard',
    description: 'View stat, item, achievement, or user leaderboards.',
    category: 'utl',
    usage: 'Zleaderboard [stat|item|achieve|user] [target] [global|server]',
    args: [
        { name: 'mode', description: 'Leaderboard mode: stat, item, achieve, or user', type: 'string', required: false },
        { name: 'stat', description: 'Stat to rank', type: 'string', required: false },
        { name: 'item', description: 'Item ID or exact name', type: 'string', required: false },
        { name: 'user', description: 'User whose ranks to check', type: 'user', required: false },
        { name: 'scope', description: 'global or server', type: 'string', required: false },
    ],

    async execute(message, args = []) {
        if (!hasLeaderboardArguments(args, message.slashOptions)) {
            return message.channel.send({
                components: [createMainMenu(message.content)],
                flags: [MessageFlags.IsComponentsV2],
            });
        }

        if (args.some(arg => String(arg).toLowerCase() === 'friend')
            || String(message.slashOptions?.scope || '').toLowerCase() === 'friend') {
            return message.reply('Friend scope is unavailable; choose `global` or `server`.');
        }

        let request = parseLeaderboardRequest(args, message.slashOptions);
        if (request.mode === 'user' && !request.userId) {
            request.userId = getUserArgument(message, request, args);
        }
        if (!SCOPES.has(request.scope)) {
            return message.reply('Scope must be `global` or `server`. Friend scope is unavailable.');
        }
        if (request.mode === 'achieve' && args.some(arg => String(arg).toLowerCase() === 'friend')) {
            return message.reply('Achievement leaderboard does not use a scope.');
        }

        let currentPage = 0;
        const scopeCache = new Map();
        let data;
        try {
            data = await getLeaderboardData(message, request, message.author.id, scopeCache);
        } catch (error) {
            return message.reply(error.message || 'Could not load the leaderboard.');
        }

        data = await addCurrentPageNames(message, data, currentPage);
        const initial = createLeaderboardContainer(data, request, currentPage);
        const response = await message.channel.send({
            components: [initial.container],
            flags: [MessageFlags.IsComponentsV2],
        });
        const collector = response.createMessageComponentCollector({ time: 120_000 });

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: 'This leaderboard belongs to another user.', ephemeral: true });
            }

            try {
                await interaction.deferUpdate();
                if (interaction.isStringSelectMenu()) {
                    if (interaction.customId === 'leaderboard_stat') request.stat = interaction.values[0];
                    if (interaction.customId === 'leaderboard_scope') request.scope = interaction.values[0];
                    currentPage = 0;
                }

                data = await getLeaderboardData(message, request, message.author.id, scopeCache);
                const pageCount = Math.max(1, Math.ceil(data.rows.length / PAGE_SIZE));
                if (interaction.isButton()) {
                    switch (interaction.customId) {
                        case 'first': currentPage = 0; break;
                        case 'prev': currentPage = Math.max(0, currentPage - 1); break;
                        case 'next': currentPage = Math.min(pageCount - 1, currentPage + 1); break;
                        case 'last': currentPage = pageCount - 1; break;
                        case 'leaderboard_reload': currentPage = Math.min(currentPage, pageCount - 1); break;
                    }
                }

                data = await addCurrentPageNames(message, data, currentPage);
                const updated = createLeaderboardContainer(data, request, currentPage);
                currentPage = updated.currentPage;
                await response.edit({ components: [updated.container] });
            } catch (error) {
                console.error('Leaderboard interaction failed:', error);
                await interaction.followUp({ content: error.message || 'Could not refresh this leaderboard.', ephemeral: true }).catch(() => { });
            }
        });

        collector.on('end', () => {
            const final = createLeaderboardContainer(data, request, currentPage, true);
            response.edit({ components: [final.container] }).catch(() => { });
        });
    },

    parseLeaderboardRequest,
    sortLeaderboardRows,
    createStatSelect,
    createScopeSelect,
    createLeaderboardContainer,
    hasLeaderboardArguments,
    createMainMenu,
};
