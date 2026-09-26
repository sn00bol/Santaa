process.env.COOLDOWN_MODE = 'test';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Collection } = require('discord.js');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const cooldownConfig = require('../src/commands/Utils/config');
const { checkCooldown, getCooldownDuration } = require('../src/commands/Utils/Cooldown');
const { getSetting } = require('../src/commands/MainCMD/stgfiles');
const { createNotificationPayload, notifyLevelUp, sendDailyReminders, sendJobReminders, sendPassiveExpiryNotifications } = require('../src/commands/Utils/notifi');
const { retryWithBackoff } = require('../src/commands/Utils/retry');
const { buildSlashCommand, getSlashCommandSignature, getSlashCommandValidationError } = require('../src/commands/Utils/slashCommand');
const { shouldResetSlashCommands, synchronizeSlashCommands } = require('../src/scripts/slashRegister');
const {
    parseLeaderboardRequest,
    sortLeaderboardRows,
    createStatSelect,
    createScopeSelect,
    createLeaderboardContainer,
    hasLeaderboardArguments,
    createMainMenu,
} = require('../src/commands/UtilsCMD/leaderboard');
const leaderboardCommand = require('../src/commands/UtilsCMD/leaderboard');
const { generateLevelCard } = require('../src/commands/UtilsCMD/level');

test('test mode uses a five-second command cooldown', () => {
    assert.equal(cooldownConfig.mode, 'test');
    assert.equal(getCooldownDuration('crime'), 5_000);
    assert.equal(getCooldownDuration('steal'), 5_000);
    assert.equal(cooldownConfig.dailyReminderCooldownMs, cooldownConfig.daily);
    assert.equal(cooldownConfig.dailyReminderCooldownMs, 10 * 60 * 1000);
    assert.equal(cooldownConfig.jobReminderCooldownMs, 10 * 60 * 1000);
    assert.equal(cooldownConfig.passiveInactivityMs, 5 * 60 * 1000);
    assert.equal(cooldownConfig.passiveInactivityLabel, '5 minutes');
});

test('test-mode cooldown expires after five seconds', t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const userId = 'cooldown-test-user';

    assert.equal(checkCooldown(userId, 'crime'), null);
    assert.equal(checkCooldown(userId, 'crime'), '5s');

    t.mock.timers.tick(5_000);
    assert.equal(checkCooldown(userId, 'crime'), null);
});

test('connection retry uses capped exponential backoff and recovers', async () => {
    let attempts = 0;
    const delays = [];

    const result = await retryWithBackoff(async () => {
        attempts += 1;
        if (attempts < 4) throw new Error('temporary connection failure');
        return 'connected';
    }, {
        initialDelayMs: 1_000,
        maxDelayMs: 2_000,
        sleep: async delayMs => delays.push(delayMs),
    });

    assert.equal(result, 'connected');
    assert.equal(attempts, 4);
    assert.deepEqual(delays, [1_000, 2_000, 2_000]);
});

test('connection retry stops for permanent authentication failures', async () => {
    let attempts = 0;

    await assert.rejects(() => retryWithBackoff(async () => {
        attempts += 1;
        const error = new Error('invalid token');
        error.code = 'TokenInvalid';
        throw error;
    }, {
        shouldRetry: error => error.code !== 'TokenInvalid',
        sleep: async () => assert.fail('permanent error should not retry'),
    }), /invalid token/);

    assert.equal(attempts, 1);
});

test('connection retry stops after the configured maximum attempts', async () => {
    let attempts = 0;
    const delays = [];

    await assert.rejects(() => retryWithBackoff(async () => {
        attempts += 1;
        throw new Error('connection unavailable');
    }, {
        initialDelayMs: 100,
        maxAttempts: 3,
        sleep: async delayMs => delays.push(delayMs),
    }), /connection unavailable/);

    assert.equal(attempts, 3);
    assert.deepEqual(delays, [100, 200]);
});

test('slash reset can be selected by CLI flag or environment variable', () => {
    assert.equal(shouldResetSlashCommands(['--reset'], 'false'), true);
    assert.equal(shouldResetSlashCommands([], 'yes'), true);
    assert.equal(shouldResetSlashCommands([], 'false'), false);
});

test('slash signature comparison preserves API command IDs', () => {
    const registeredCommand = {
        id: '123456789012345678',
        application_id: '234567890123456789',
        version: '345678901234567890',
        name: 'balance',
        description: 'Manage a balance.',
        type: 1,
    };

    getSlashCommandSignature(registeredCommand);

    assert.equal(registeredCommand.id, '123456789012345678');
    assert.equal(registeredCommand.application_id, '234567890123456789');
    assert.equal(registeredCommand.version, '345678901234567890');
});

test('slash signatures ignore API defaults and object key ordering', () => {
    const remoteCommand = {
        id: '123456789012345678',
        name: 'balance',
        description: 'Manage a balance.',
        default_member_permissions: null,
        contexts: null,
        integration_types: [0, 1],
        nsfw: false,
        options: [{ type: 6, name: 'target', description: 'Target user' }],
    };
    const localCommand = {
        options: [{ description: 'Target user', name: 'target', required: false, type: 6 }],
        dm_permission: true,
        description: 'Manage a balance.',
        name: 'balance',
    };

    assert.equal(getSlashCommandSignature(remoteCommand), getSlashCommandSignature(localCommand));
    assert.equal(
        getSlashCommandSignature({ name: 'ping', description: 'Ping.' }),
        getSlashCommandSignature({ name: 'ping', description: 'Ping.', options: [] })
    );
});

test('slash reset deletes existing commands before registering current commands', async () => {
    const events = [];
    const registered = new Collection([
        ['old-command-id', { id: 'old-command-id', name: 'old-command' }],
    ]);
    const commandManager = {
        async fetch(options) {
            assert.deepEqual(options, { guildId: 'test-guild' });
            return registered;
        },
        async delete(commandId, guildId) {
            events.push(['delete', commandId, guildId]);
        },
        async create(data, guildId) {
            events.push(['create', data.name, guildId]);
        },
        async edit() {
            assert.fail('reset should create commands instead of editing old registrations');
        },
    };
    const commands = new Collection([
        ['ping', { name: 'ping', description: 'Ping the bot.', execute: async () => { } }],
    ]);

    const result = await synchronizeSlashCommands(commandManager, commands, {
        guildId: 'test-guild',
        reset: true,
    });

    assert.deepEqual(events, [
        ['delete', 'old-command-id', 'test-guild'],
        ['create', 'ping', 'test-guild'],
    ]);
    assert.deepEqual(result, { total: 1, created: 1, updated: 0, deleted: 1, reset: true });
});

test('leaderboard parser accepts positional and named slash arguments', () => {
    assert.deepEqual(parseLeaderboardRequest(['stat', 'wins', 'server']), {
        mode: 'stat', stat: 'wins', scope: 'server',
    });
    assert.deepEqual(parseLeaderboardRequest(['money', 'global']), {
        mode: 'stat', stat: 'money', scope: 'global',
    });
    assert.deepEqual(parseLeaderboardRequest(['item', 'Gold Ore', 'server']), {
        mode: 'item', itemName: 'Gold Ore', scope: 'server',
    });
    assert.deepEqual(parseLeaderboardRequest(['user', '<@12345678901234567>', 'server']), {
        mode: 'user', userId: '<@12345678901234567>', scope: 'server',
    });
    assert.deepEqual(parseLeaderboardRequest(['achieve', 'server']), {
        mode: 'achieve', scope: 'global',
    });
    assert.deepEqual(parseLeaderboardRequest([], { mode: 'stat', stat: 'level', scope: 'global' }), {
        mode: 'stat', stat: 'level', scope: 'global',
    });
});

test('leaderboard ranking sorts by score then tie breaker and stable user ID', () => {
    const ranked = sortLeaderboardRows([
        { userId: 'b', score: 4, tieBreaker: 1 },
        { userId: 'c', score: 4, tieBreaker: 2 },
        { userId: 'a', score: 4, tieBreaker: 2 },
    ]);

    assert.deepEqual(ranked.map(row => [row.rank, row.userId]), [[1, 'a'], [2, 'c'], [3, 'b']]);
});

test('leaderboard stat and scope selects have no icons or descriptions', () => {
    const rows = [createStatSelect('money').toJSON(), createScopeSelect('global').toJSON()];
    for (const row of rows) {
        for (const option of row.components[0].options) {
            assert.equal(option.emoji, undefined);
            assert.equal(option.description, undefined);
        }
    }
});

test('leaderboard without arguments displays the usage main menu', () => {
    assert.equal(hasLeaderboardArguments([], {}), false);
    assert.equal(hasLeaderboardArguments([], { mode: 'stat' }), true);
    assert.equal(hasLeaderboardArguments(['item']), true);

    const components = createMainMenu('Zleaderboard').toJSON().components;
    const content = components[0].content;
    assert.match(content, /"Zleaderboard" is not valid/);
    assert.ok(content.includes('Zleaderboard `stat?` `scope?`'));
    assert.ok(content.includes('Zleaderboard `item?` `scope?`'));
    assert.ok(content.includes('Zleaderboard `achieve`'));
    assert.ok(content.includes('Zleaderboard `user?` `scope?`'));
});

test('leaderboard page indicator appears immediately before stat/scope controls', () => {
    const request = { mode: 'stat', stat: 'money', scope: 'global' };
    const data = {
        rows: [],
        positionLabel: 'My position: —',
        title: '`Total Money` `global` Leaderboard',
        overview: false,
    };
    const components = createLeaderboardContainer(data, request, 0).container.toJSON().components;
    const pageIndex = components.findIndex(component => component.type === 10 && component.content?.includes('Page 1 of 1'));
    const statIndex = components.findIndex(component => component.type === 1 && component.components?.[0]?.custom_id === 'leaderboard_stat');

    assert.ok(pageIndex >= 0);
    assert.equal(statIndex, pageIndex + 2);
});

test('daily reminders use the separate daily_reminder setting', async () => {
    const dailyReminder = getSetting('daily_reminder');
    const reminder = getSetting('reminder');
    const queriedSettings = [];
    const sentPayloads = [];

    assert.ok(dailyReminder);
    assert.equal(dailyReminder.shouldRemind({ daily_reminder: true }), true);
    assert.equal(reminder.shouldRemind({ reminder: true }), true);

    const sentCount = await sendDailyReminders({
        db: {
            async getUsersWithSettingEnabled(settingId) {
                queriedSettings.push(settingId);
                return ['daily-user'];
            },
        },
        users: {
            async fetch() {
                return {
                    bot: false,
                    async send(payload) {
                        sentPayloads.push(payload);
                    },
                };
            },
        },
    });

    assert.deepEqual(queriedSettings, ['daily_reminder']);
    assert.equal(sentCount, 1);
    assert.equal(sentPayloads[0].embeds[0].data.title, 'Your daily reward is ready!');
    assert.match(sentPayloads[0].embeds[0].data.description, /daily/);
    assert.equal(sentPayloads[0].embeds[0].data.thumbnail.url, 'attachment://calendar.png');
    assert.equal(sentPayloads[0].files[0].name, 'calendar.png');
});

test('job reminders only DM users with an active job', async () => {
    const sentMessages = [];
    const client = {
        db: {
            async getUsersWithSettingEnabled() {
                return ['employed-user', 'unemployed-user'];
            },
            async getJobState(userId) {
                return { job_id: userId === 'employed-user' ? 'builder' : null };
            },
        },
        users: {
            async fetch(userId) {
                return {
                    bot: false,
                    async send(content) {
                        sentMessages.push({ userId, payload: content });
                    },
                };
            },
        },
    };

    const sentCount = await sendJobReminders(client);

    assert.equal(sentCount, 1);
    assert.equal(sentMessages[0].userId, 'employed-user');
    assert.match(sentMessages[0].payload.embeds[0].data.description, /job work/);
    assert.equal(sentMessages[0].payload.embeds[0].data.thumbnail.url, 'attachment://suitcase.png');
});

test('passive expiry sends an embed with an asset thumbnail', async () => {
    const sentMessages = [];
    const client = {
        db: {
            async expireInactivePassiveSettings(cutoff) {
                assert.equal(typeof cutoff, 'number');
                return ['expired-user'];
            },
        },
        users: {
            async fetch() {
                return {
                    bot: false,
                    async send(payload) {
                        sentMessages.push(payload);
                    },
                };
            },
        },
    };

    assert.equal(await sendPassiveExpiryNotifications(client), 1);
    assert.equal(sentMessages[0].embeds[0].data.title, 'Passive Mode expired');
    assert.match(sentMessages[0].embeds[0].data.description, /without command use/);
    assert.equal(sentMessages[0].embeds[0].data.thumbnail.url, 'attachment://bell.png');
});

test('level-up notifications call the level command and DM its result', async () => {
    let commandCalled = false;
    const sentMessages = [];
    const user = {
        id: 'level-user',
        bot: false,
        async send(payload) {
            sentMessages.push(payload);
        },
    };
    const client = {
        db: {
            async getUserSettings() {
                return { lvl_notifi: true };
            },
        },
        users: { fetch: async () => user },
        commands: {
            get(commandName) {
                assert.equal(commandName, 'level');
                return {
                    async execute(message, args) {
                        commandCalled = true;
                        assert.equal(message.author.id, user.id);
                        assert.deepEqual(args, []);
                        await message.reply({ files: ['level.png'] });
                    },
                };
            },
        },
    };

    assert.equal(await notifyLevelUp(client, user.id, 3), true);
    assert.equal(commandCalled, true);
    assert.deepEqual(sentMessages, [{ files: ['level.png'] }]);
});

test('level card generator returns a PNG without relying on other image generators', async () => {
    const image = await generateLevelCard({
        username: 'TestUser',
        displayAvatarURL: () => null,
    }, { level: 5, exp: 120 }, 'TestUser', 3);

    assert.equal(image.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16), 1000);
    assert.equal(image.readUInt32BE(20), 320);
});

test('notification embeds attach the selected asset as a right-side thumbnail', () => {
    const payload = createNotificationPayload({
        title: 'Test notification',
        description: 'Notification body',
        image: 'bell.png',
    });

    assert.equal(payload.embeds[0].data.title, 'Test notification');
    assert.equal(payload.embeds[0].data.description, 'Notification body');
    assert.equal(payload.embeds[0].data.thumbnail.url, 'attachment://bell.png');
    assert.equal(payload.files[0].name, 'bell.png');
});

test('leaderboard slash command exposes all named mode options', () => {
    assert.equal(getSlashCommandValidationError(leaderboardCommand), null);
    const slashData = buildSlashCommand(leaderboardCommand);
    assert.deepEqual(slashData.options.map(option => option.name), ['mode', 'stat', 'item', 'user', 'scope']);
});

test('net worth high-water total persists increases without decreasing', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    try {
        await db.exec(`
            CREATE TABLE net_worth_peaks (
                user_id TEXT PRIMARY KEY,
                peak_total INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            )
        `);
        const updatePeak = async total => {
            await db.run(`
                INSERT INTO net_worth_peaks (user_id, peak_total, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    peak_total = MAX(net_worth_peaks.peak_total, excluded.peak_total),
                    updated_at = CASE
                        WHEN excluded.peak_total > net_worth_peaks.peak_total THEN excluded.updated_at
                        ELSE net_worth_peaks.updated_at
                    END
            `, ['user-1', total, Date.now()]);
            return (await db.get('SELECT peak_total FROM net_worth_peaks WHERE user_id = ?', ['user-1'])).peak_total;
        };

        assert.equal(await updatePeak(500), 500);
        assert.equal(await updatePeak(300), 500);
        assert.equal(await updatePeak(750), 750);
    } finally {
        await db.close();
    }
});