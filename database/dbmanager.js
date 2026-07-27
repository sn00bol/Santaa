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
        return true;
    },
    // Set user money
    async setMoney(userId, amount) {
        await this.getUser(userId);
        return await db.run('UPDATE balances SET balance = ? WHERE user_id = ?', [amount, userId]);
    },

    // Remove money from user balance
    async removeMoney(userId, amount) {
        await this.getUser(userId);
        return await db.run('UPDATE balances SET balance = balance - ? WHERE user_id = ?', [amount, userId]);
    },

    // Reset user balance to 0
    async resetMoney(userId) {
        await this.getUser(userId);
        return await db.run('UPDATE balances SET balance = 0 WHERE user_id = ?', [userId]);
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
        return await db.run('UPDATE balances SET bank = bank - ? WHERE user_id = ?', [amount, userId]);
    },

    // Add money to user bank
    async addBank(userId, amount) {
        await this.getUser(userId);
        return await db.run('UPDATE balances SET bank = bank + ? WHERE user_id = ?', [amount, userId]);
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
    }
};
