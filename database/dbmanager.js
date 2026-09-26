const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const rpgmanager = require('./rpgmanager');
const { allItemsCache } = require('../src/commands/Utils/StatsCalculator');

let db;

module.exports = {
    async init() {
        db = await open({
            filename: './database/balance.db',
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS balances (
                user_id TEXT PRIMARY KEY,
                balance INTEGER DEFAULT 0,
                bank INTEGER DEFAULT 0,
                total_earned INTEGER DEFAULT 0
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS net_worth_peaks (
                user_id TEXT PRIMARY KEY,
                peak_total INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS job_states (
                user_id TEXT PRIMARY KEY,
                job_id TEXT DEFAULT NULL,
                work_count INTEGER DEFAULT 0,
                last_worked_at INTEGER DEFAULT 0,
                fired_at INTEGER DEFAULT 0,
                fired_until INTEGER DEFAULT 0,
                first_bonus_received INTEGER DEFAULT 0
            )
        `);

        try {
            await db.exec('ALTER TABLE balances ADD COLUMN total_earned INTEGER DEFAULT 0');
        } catch (e) {
            // Column already exists on older databases.
        }

        await db.exec(`
            CREATE TABLE IF NOT EXISTS help_preferences (
                user_id TEXT PRIMARY KEY,
                last_categories TEXT DEFAULT 'all'
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id TEXT NOT NULL,
                setting_id TEXT NOT NULL,
                value INTEGER NOT NULL DEFAULT 0 CHECK (value IN (0, 1)),
                PRIMARY KEY (user_id, setting_id)
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS settings_migrations (
                migration_id TEXT PRIMARY KEY,
                applied_at INTEGER NOT NULL
            )
        `);

        const notificationMigration = await db.get(
            'SELECT migration_id FROM settings_migrations WHERE migration_id = ?',
            ['split_notification_settings_v1']
        );
        if (!notificationMigration) {
            await db.run(`
                INSERT OR IGNORE INTO user_settings (user_id, setting_id, value)
                SELECT user_id, 'daily_reminder', value FROM user_settings
                WHERE setting_id = 'reminder' AND value = 1
            `);
            await db.run(`
                INSERT OR IGNORE INTO user_settings (user_id, setting_id, value)
                SELECT user_id, 'reminder', value FROM user_settings
                WHERE setting_id = 'dm_notify' AND value = 1
            `);
            await db.run(`
                INSERT OR IGNORE INTO user_settings (user_id, setting_id, value)
                SELECT user_id, 'lvl_notifi', value FROM user_settings
                WHERE setting_id = 'dm_notify' AND value = 1
            `);
            await db.run(
                'INSERT INTO settings_migrations (migration_id, applied_at) VALUES (?, ?)',
                ['split_notification_settings_v1', Date.now()]
            );
        }

        await db.exec(`
            CREATE TABLE IF NOT EXISTS user_activity (
                user_id TEXT PRIMARY KEY,
                last_command_at INTEGER NOT NULL
            )
        `);

        await db.run(`
            INSERT OR IGNORE INTO user_activity (user_id, last_command_at)
            SELECT user_id, CAST(strftime('%s', 'now') AS INTEGER) * 1000
            FROM user_settings
            WHERE setting_id = 'passive' AND value = 1
        `);

        // for debug @
        // console.log("Database initialized and ready to use.");
    },

    // Get the last help categories the user viewed
    async getHelpPreference(userId) {
        const row = await db.get('SELECT last_categories FROM help_preferences WHERE user_id = ?', [userId]);
        if (!row || !row.last_categories) return ['all'];
        try {
            const parsed = JSON.parse(row.last_categories);
            return Array.isArray(parsed) && parsed.length > 0 ? parsed : ['all'];
        } catch {
            return [row.last_categories]; // fallback: treat as single string value
        }
    },

    // Save the last help categories the user viewed
    async setHelpPreference(userId, categories) {
        const value = JSON.stringify(Array.isArray(categories) ? categories : [categories]);
        return await db.run(`
            INSERT INTO help_preferences (user_id, last_categories)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET last_categories = excluded.last_categories
        `, [userId, value]);
    },

    async getUserSettings(userId) {
        const rows = await db.all(
            'SELECT setting_id, value FROM user_settings WHERE user_id = ?',
            [userId]
        );
        return rows.reduce((settings, row) => {
            settings[row.setting_id] = Boolean(row.value);
            return settings;
        }, {});
    },

    async setUserSetting(userId, settingId, value) {
        const result = await db.run(`
            INSERT INTO user_settings (user_id, setting_id, value)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, setting_id) DO UPDATE SET value = excluded.value
        `, [userId, settingId, value ? 1 : 0]);

        if (settingId === 'passive' && value) {
            await this.recordUserActivity(userId, Date.now(), true);
        }

        return result;
    },

    async getUsersWithSettingEnabled(settingId) {
        const rows = await db.all(
            'SELECT user_id FROM user_settings WHERE setting_id = ? AND value = 1',
            [settingId]
        );
        return rows.map(row => row.user_id);
    },

    async recordUserActivity(userId, timestamp = Date.now(), force = false) {
        return await db.run(`
            INSERT INTO user_activity (user_id, last_command_at)
            SELECT ?, ?
            WHERE ? = 1 OR EXISTS (
                SELECT 1 FROM user_settings
                WHERE user_id = ? AND setting_id = 'passive' AND value = 1
            )
            ON CONFLICT(user_id) DO UPDATE SET last_command_at = excluded.last_command_at
        `, [userId, timestamp, force ? 1 : 0, userId]);
    },

    async expireInactivePassiveSettings(inactiveBefore) {
        const candidates = await db.all(`
            SELECT settings.user_id
            FROM user_settings AS settings
            JOIN user_activity AS activity ON activity.user_id = settings.user_id
            WHERE settings.setting_id = 'passive'
                AND settings.value = 1
                AND activity.last_command_at <= ?
        `, [inactiveBefore]);
        const expiredUserIds = [];

        for (const { user_id: userId } of candidates) {
            const result = await db.run(`
                UPDATE user_settings
                SET value = 0
                WHERE user_id = ?
                    AND setting_id = 'passive'
                    AND value = 1
                    AND EXISTS (
                        SELECT 1 FROM user_activity
                        WHERE user_id = ? AND last_command_at <= ?
                    )
            `, [userId, userId, inactiveBefore]);
            if (result.changes > 0) expiredUserIds.push(userId);
        }

        return expiredUserIds;
    },

    // get user info
    async getUser(userId) {
        let user = await db.get('SELECT * FROM balances WHERE user_id = ?', [userId]);
        if (!user) {
            await db.run('INSERT OR IGNORE INTO balances (user_id, balance, bank, total_earned) VALUES (?, 0, 0, 0)', [userId]);
            user = { user_id: userId, balance: 0, bank: 0, total_earned: 0 };
        }
        if (user.total_earned === undefined) user.total_earned = 0;
        return user;
    },

    // Add money to user balance
    async addMoney(userId, amount, options = {}) {
        await this.getUser(userId);
        await db.run('UPDATE balances SET balance = balance + ? WHERE user_id = ?', [amount, userId]);
        if (options.trackEarning && amount > 0) {
            await db.run('UPDATE balances SET total_earned = total_earned + ? WHERE user_id = ?', [amount, userId]);
        }
        await this.updateNetWorthPeak(userId);
        return true;
    },
    // Set user money
    async setMoney(userId, amount) {
        await this.getUser(userId);
        const result = await db.run('UPDATE balances SET balance = ? WHERE user_id = ?', [amount, userId]);
        await this.updateNetWorthPeak(userId);
        return result;
    },

    // Remove money from user balance
    async removeMoney(userId, amount) {
        await this.getUser(userId);
        const result = await db.run('UPDATE balances SET balance = balance - ? WHERE user_id = ?', [amount, userId]);
        await this.updateNetWorthPeak(userId);
        return result;
    },

    // Reset user balance to 0
    async resetMoney(userId) {
        await this.getUser(userId);
        const result = await db.run('UPDATE balances SET balance = 0 WHERE user_id = ?', [userId]);
        await this.updateNetWorthPeak(userId);
        return result;
    },

    async getJobState(userId) {
        let state = await db.get('SELECT * FROM job_states WHERE user_id = ?', [userId]);
        if (!state) {
            await db.run(`
                INSERT OR IGNORE INTO job_states (user_id, job_id, work_count, last_worked_at, fired_at, fired_until, first_bonus_received)
                VALUES (?, NULL, 0, 0, 0, 0, 0)
            `, [userId]);
            state = { user_id: userId, job_id: null, work_count: 0, last_worked_at: 0, fired_at: 0, fired_until: 0, first_bonus_received: 0 };
        }
        return state;
    },

    async setJobState(userId, jobId, workCount, lastWorkedAt, firedAt, firedUntil, firstBonusReceived) {
        return await db.run(`
            INSERT INTO job_states (user_id, job_id, work_count, last_worked_at, fired_at, fired_until, first_bonus_received)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                job_id = excluded.job_id,
                work_count = excluded.work_count,
                last_worked_at = excluded.last_worked_at,
                fired_at = excluded.fired_at,
                fired_until = excluded.fired_until,
                first_bonus_received = excluded.first_bonus_received
        `, [userId, jobId, workCount, lastWorkedAt, firedAt, firedUntil, firstBonusReceived]);
    },

    async updateJobProgress(userId, updates) {
        const state = await this.getJobState(userId);
        const nextState = {
            job_id: updates.job_id ?? state.job_id,
            work_count: updates.work_count ?? state.work_count,
            last_worked_at: updates.last_worked_at ?? state.last_worked_at,
            fired_at: updates.fired_at ?? state.fired_at,
            fired_until: updates.fired_until ?? state.fired_until,
            first_bonus_received: updates.first_bonus_received ?? state.first_bonus_received
        };
        return await this.setJobState(userId, nextState.job_id, nextState.work_count, nextState.last_worked_at, nextState.fired_at, nextState.fired_until, nextState.first_bonus_received);
    },

    async resetJobState(userId) {
        return await db.run(`
            UPDATE job_states
            SET job_id = NULL, work_count = 0, last_worked_at = 0, fired_at = 0, fired_until = 0, first_bonus_received = 0
            WHERE user_id = ?
        `, [userId]);
    },

    // Remove money from user bank
    async removeBank(userId, amount) {
        await this.getUser(userId);
        const result = await db.run('UPDATE balances SET bank = bank - ? WHERE user_id = ?', [amount, userId]);
        await this.updateNetWorthPeak(userId);
        return result;
    },

    // Add money to user bank
    async getBankLimit(userId) {
        const stats = await rpgmanager.getStats(userId);
        const level = Math.max(1, Number(stats.level) || 1);
        return 500000 * (2 ** Math.floor(level / 15));
    },

    async addBank(userId, amount) {
        await this.getUser(userId);
        const limit = await this.getBankLimit(userId);
        const result = await db.run(
            'UPDATE balances SET bank = bank + ? WHERE user_id = ? AND bank + ? <= ?',
            [amount, userId, amount, limit]
        );
        if (result.changes > 0) await this.updateNetWorthPeak(userId);
        return result.changes > 0;
    },

    async getInventoryValue(userId) {
        const inventory = await rpgmanager.getInventory(userId);
        if (!Array.isArray(inventory) || inventory.length === 0) return 0;

        return inventory.reduce((total, item) => {
            const definition = allItemsCache.get(item.item_id);
            const value = definition ? (definition.sell ?? definition.cost ?? 0) : 0;
            return total + value;
        }, 0);
    },

    async getNetWorthBreakdown(userId) {
        const user = await this.getUser(userId);
        const inventoryValue = await this.getInventoryValue(userId);
        const totalAssets = Number(user.balance) + Number(user.bank) + Number(inventoryValue);

        return {
            cash: Number(user.balance),
            bank: Number(user.bank),
            inventoryValue,
            totalAssets,
            totalEarned: Number(user.total_earned || 0)
        };
    },

    async updateNetWorthPeak(userId, currentTotal) {
        const total = currentTotal ?? (await this.getNetWorthBreakdown(userId)).totalAssets;
        await db.run(`
            INSERT INTO net_worth_peaks (user_id, peak_total, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                peak_total = MAX(net_worth_peaks.peak_total, excluded.peak_total),
                updated_at = CASE
                    WHEN excluded.peak_total > net_worth_peaks.peak_total THEN excluded.updated_at
                    ELSE net_worth_peaks.updated_at
                END
        `, [userId, total, Date.now()]);
        const row = await db.get('SELECT peak_total FROM net_worth_peaks WHERE user_id = ?', [userId]);
        return Number(row?.peak_total || 0);
    },

    async getNetWorthSummary(userId) {
        const breakdown = await this.getNetWorthBreakdown(userId);
        const totalCoins = breakdown.cash + breakdown.bank;
        const peakTotal = await this.updateNetWorthPeak(userId, breakdown.totalAssets);
        return { ...breakdown, totalCoins, peakTotal };
    },

    async getFinancialLeaderboard() {
        const [accounts, inventory] = await Promise.all([
            db.all('SELECT user_id, balance, bank FROM balances'),
            rpgmanager.getAllInventory(),
        ]);
        const inventoryValues = new Map();
        const accountsByUser = new Map(accounts.map(account => [account.user_id, account]));

        for (const item of inventory) {
            const definition = allItemsCache.get(item.item_id);
            const value = Number(definition?.sell ?? definition?.cost ?? 0);
            inventoryValues.set(item.user_id, (inventoryValues.get(item.user_id) || 0) + value);
            if (!accountsByUser.has(item.user_id)) {
                accountsByUser.set(item.user_id, { user_id: item.user_id, balance: 0, bank: 0 });
            }
        }

        return [...accountsByUser.values()].map(account => {
            const balance = Number(account.balance || 0);
            const bank = Number(account.bank || 0);
            const inventoryValue = inventoryValues.get(account.user_id) || 0;
            return {
                user_id: account.user_id,
                balance,
                bank,
                inventoryValue,
                totalAssets: balance + bank + inventoryValue,
            };
        });
    },

    async getMoneyLeaderboard(limit = 10) {
        const rows = await db.all('SELECT user_id, balance, bank FROM balances ORDER BY balance + bank DESC LIMIT ?', [limit]);
        const enriched = [];

        for (const row of rows) {
            const breakdown = await this.getNetWorthBreakdown(row.user_id);
            enriched.push({
                user_id: row.user_id,
                balance: Number(row.balance || 0),
                bank: Number(row.bank || 0),
                inventoryValue: Number(breakdown.inventoryValue || 0),
                totalAssets: Number(breakdown.totalAssets || 0),
            });
        }

        return enriched.sort((a, b) => b.totalAssets - a.totalAssets).slice(0, limit);
    },

    async getMoneyRank(userId) {
        const rows = await db.all('SELECT user_id FROM balances');
        const ranked = await Promise.all(rows.map(async row => {
            const breakdown = await this.getNetWorthBreakdown(row.user_id);
            return { user_id: row.user_id, totalAssets: breakdown.totalAssets };
        }));

        ranked.sort((a, b) => b.totalAssets - a.totalAssets);
        const rank = ranked.findIndex(entry => entry.user_id === userId);
        return rank === -1 ? null : rank + 1;
    }
};
