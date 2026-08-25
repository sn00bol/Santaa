const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const config = require('../src/commands/Utils/config');
const { parseFishingProfile, DEFAULT_FISHING_PROFILE } = require('../src/commands/Utils/fishingSchema');

let db;

module.exports = {
    async init() {
        db = await open({
            filename: './database/rpg.db',
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                item_id TEXT,
                item_name TEXT,
                acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.exec(`
            CREATE TABLE IF NOT EXISTS stats (
                user_id TEXT PRIMARY KEY,
                health INTEGER DEFAULT 100,
                stamina INTEGER DEFAULT 100,
                attack INTEGER DEFAULT 5,
                defense INTEGER DEFAULT 2,
                level INTEGER DEFAULT 1,
                exp INTEGER DEFAULT 0,
                steals INTEGER DEFAULT 0,
                equipped_item_id TEXT DEFAULT NULL,
                equipped_items TEXT DEFAULT '[]',
                wanted_level INTEGER DEFAULT 0,
                wanted_updated_at INTEGER DEFAULT 0,
                fishing_profile TEXT DEFAULT '{}'
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS pvp_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                winner_id TEXT NOT NULL,
                loser_id TEXT NOT NULL,
                fought_at INTEGER DEFAULT (strftime('%s', 'now')),
                winner_exp_gained INTEGER DEFAULT 20,
                loser_money_lost INTEGER DEFAULT 0
            )
        `);

        // Ensure columns exist for existing databases
        try { await db.exec(`ALTER TABLE stats ADD COLUMN defense INTEGER DEFAULT 2;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN level INTEGER DEFAULT 1;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN exp INTEGER DEFAULT 0;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN steals INTEGER DEFAULT 0;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN equipped_items TEXT DEFAULT '[]';`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN wanted_level INTEGER DEFAULT 0;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN wanted_updated_at INTEGER DEFAULT 0;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN fishing_profile TEXT DEFAULT '{}';`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN crimes INTEGER DEFAULT 0;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN begs INTEGER DEFAULT 0;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN items_sold INTEGER DEFAULT 0;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN items_bought INTEGER DEFAULT 0;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN unknown_category_visits INTEGER DEFAULT 0;`); } catch (e) {}
        try { await db.exec(`ALTER TABLE stats ADD COLUMN pvp_wins INTEGER DEFAULT 0;`); } catch (e) {}
    },

    // Add item to inventory
    async addItem(userId, itemId, itemName) {
        return await db.run('INSERT INTO inventory (user_id, item_id, item_name) VALUES (?, ?, ?)', [userId, itemId, itemName]);
    },

    // Get user inventory
    async getInventory(userId) {
        return await db.all('SELECT * FROM inventory WHERE user_id = ? ORDER BY id ASC', [userId]);
    },

    // Remove single item from inventory
    async removeItem(inventoryId) {
        return await db.run('DELETE FROM inventory WHERE id = ?', [inventoryId]);
    },

    // Get user stats
    async getStats(userId) {
        let stats = await db.get('SELECT * FROM stats WHERE user_id = ?', [userId]);
        if (!stats) {
            await db.run('INSERT OR IGNORE INTO stats (user_id, health, stamina, attack, defense, level, exp, steals, equipped_item_id, wanted_level, wanted_updated_at, fishing_profile) VALUES (?, 100, 100, 5, 2, 1, 0, 0, NULL, 0, 0, ?)', [userId, JSON.stringify(DEFAULT_FISHING_PROFILE)]);
            stats = { user_id: userId, health: 100, stamina: 100, attack: 5, defense: 2, level: 1, exp: 0, steals: 0, equipped_item_id: null, wanted_level: 0, wanted_updated_at: 0, equipped_items: '[]', fishing_profile: DEFAULT_FISHING_PROFILE };
        }

        if (stats.fishing_profile) {
            stats.fishing_profile = parseFishingProfile(stats.fishing_profile);
        } else {
            stats.fishing_profile = { ...DEFAULT_FISHING_PROFILE };
        }

        // Decay wanted level
        const now = Date.now();
        if (stats.wanted_level > 0 && stats.wanted_updated_at > 0) {
            const decayTime = config.wantedDecay || 24 * 60 * 60 * 1000;
            if (now - stats.wanted_updated_at > decayTime) {
                const newWantedLevel = Math.max(0, stats.wanted_level - 10);
                await db.run('UPDATE stats SET wanted_level = ?, wanted_updated_at = ? WHERE user_id = ?', [newWantedLevel, now, userId]);
                stats.wanted_level = newWantedLevel;
                stats.wanted_updated_at = now;
            }
        }

        return stats;
    },

    // Update wanted level
    async updateWantedLevel(userId, change) {
        let stats = await this.getStats(userId);
        let newLevel = Math.max(0, Math.min(30, (stats.wanted_level || 0) + change));
        const now = Date.now();
        await db.run('UPDATE stats SET wanted_level = ?, wanted_updated_at = ? WHERE user_id = ?', [newLevel, now, userId]);
        return newLevel;
    },

    // Update general stats
    async updateStats(userId, health, stamina) {
        return await db.run('UPDATE stats SET health = ?, stamina = ? WHERE user_id = ?', [health, stamina, userId]);
    },

    // Specifically update attack/defense/level/exp
    async updateProgress(userId, { attack, defense, level, exp, steals, crimes, begs, items_sold, items_bought, unknown_category_visits, pvp_wins, fishing_profile }) {
        const updates = [];
        const params = [];
        if (attack !== undefined) { updates.push('attack = ?'); params.push(attack); }
        if (defense !== undefined) { updates.push('defense = ?'); params.push(defense); }
        if (level !== undefined) { updates.push('level = ?'); params.push(level); }
        if (exp !== undefined) { updates.push('exp = ?'); params.push(exp); }
        if (steals !== undefined) { updates.push('steals = ?'); params.push(steals); }
        if (crimes !== undefined) { updates.push('crimes = ?'); params.push(crimes); }
        if (begs !== undefined) { updates.push('begs = ?'); params.push(begs); }
        if (items_sold !== undefined) { updates.push('items_sold = ?'); params.push(items_sold); }
        if (items_bought !== undefined) { updates.push('items_bought = ?'); params.push(items_bought); }
        if (unknown_category_visits !== undefined) { updates.push('unknown_category_visits = ?'); params.push(unknown_category_visits); }
        if (pvp_wins !== undefined) { updates.push('pvp_wins = ?'); params.push(pvp_wins); }
        if (fishing_profile !== undefined) {
            updates.push('fishing_profile = ?');
            params.push(JSON.stringify(parseFishingProfile(fishing_profile)));
        }

        if (updates.length === 0) return;
        params.push(userId);
        return await db.run(`UPDATE stats SET ${updates.join(', ')} WHERE user_id = ?`, params);
    },

    // Equip item
    async equipItem(userId, itemId) {
        // push itemId into equipped_items JSON array if not already present and limit 3
        // Use SELECT * to avoid SQL error if equipped_items column is missing on older DBs
        const row = await db.get('SELECT * FROM stats WHERE user_id = ?', [userId]);
        let arr = [];
        try { arr = row && row.equipped_items ? JSON.parse(row.equipped_items) : []; } catch (e) { arr = []; }
        if (!arr.includes(itemId)) {
            if (arr.length >= 3) return { changed: false, reason: 'limit' };
            arr.push(itemId);
        }
        await db.run('UPDATE stats SET equipped_items = ? WHERE user_id = ?', [JSON.stringify(arr), userId]);
        return { changed: true };
    },

    // Unequip a specific item from equipped_items
    async unequipItem(userId, itemId) {
        // Use SELECT * to avoid SQL error if equipped_items column is missing
        const row = await db.get('SELECT * FROM stats WHERE user_id = ?', [userId]);
        let arr = [];
        try { arr = row && row.equipped_items ? JSON.parse(row.equipped_items) : []; } catch (e) { arr = []; }
        const idx = arr.indexOf(itemId);
        if (idx !== -1) {
            arr.splice(idx, 1);
            await db.run('UPDATE stats SET equipped_items = ? WHERE user_id = ?', [JSON.stringify(arr), userId]);
            return { changed: true };
        }
        return { changed: false };
    },

    async getFishingProfile(userId) {
        const row = await db.get('SELECT fishing_profile FROM stats WHERE user_id = ?', [userId]);
        if (!row) return { ...DEFAULT_FISHING_PROFILE };
        return parseFishingProfile(row.fishing_profile);
    },

    async setFishingProfile(userId, profile) {
        const fishingProfile = parseFishingProfile(profile);
        await this.getStats(userId);
        return await db.run('UPDATE stats SET fishing_profile = ? WHERE user_id = ?', [JSON.stringify(fishingProfile), userId]);
    },

    // Transfer an inventory item to another user (for trade)
    async transferItem(inventoryId, newUserId) {
        return await db.run('UPDATE inventory SET user_id = ? WHERE id = ?', [newUserId, inventoryId]);
    },

    // ── PVP History ───────────────────────────────────────────────────────

    /**
     * Record the result of a PVP match.
     */
    async recordPvpResult(winnerId, loserId, expGained = 20, moneyLost = 0) {
        return await db.run(
            'INSERT INTO pvp_history (winner_id, loser_id, winner_exp_gained, loser_money_lost) VALUES (?, ?, ?, ?)',
            [winnerId, loserId, expGained, moneyLost]
        );
    },

    /**
     * Get recent PVP matches for a user (as winner or loser).
     * @param {string} userId
     * @param {number} limit  max records to return (default 10)
     */
    async getPvpHistory(userId, limit = 10) {
        return await db.all(
            `SELECT * FROM pvp_history
             WHERE winner_id = ? OR loser_id = ?
             ORDER BY fought_at DESC LIMIT ?`,
            [userId, userId, limit]
        );
    },

    /**
     * Get top players by win count.
     * @param {number} limit  number of top entries (default 10)
     */
    async getPvpLeaderboard(limit = 10) {
        return await db.all(
            `SELECT winner_id,
                    COUNT(*) AS wins,
                    (SELECT COUNT(*) FROM pvp_history l WHERE l.loser_id = w.winner_id) AS losses
             FROM pvp_history w
             GROUP BY winner_id
             ORDER BY wins DESC
             LIMIT ?`,
            [limit]
        );
    },

    /**
     * Get win/loss/win-rate stats for a specific user.
     */
    async getPvpStats(userId) {
        const wins   = (await db.get('SELECT COUNT(*) AS cnt FROM pvp_history WHERE winner_id = ?', [userId]))?.cnt ?? 0;
        const losses = (await db.get('SELECT COUNT(*) AS cnt FROM pvp_history WHERE loser_id  = ?', [userId]))?.cnt ?? 0;
        const total  = wins + losses;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        return { wins, losses, total, winRate };
    },

    async getLevelLeaderboard(limit = 10) {
        return await db.all(
            `SELECT user_id, level, exp FROM stats
             ORDER BY level DESC, exp DESC
             LIMIT ?`,
            [limit]
        );
    },

    async getWinsLeaderboard(limit = 10) {
        return await db.all(
            `SELECT winner_id AS user_id, COUNT(*) AS wins
             FROM pvp_history
             GROUP BY winner_id
             ORDER BY wins DESC
             LIMIT ?`,
            [limit]
        );
    },

    async getStealsLeaderboard(limit = 10) {
        return await db.all(
            `SELECT user_id, steals FROM stats
             WHERE steals > 0
             ORDER BY steals DESC, user_id ASC
             LIMIT ?`,
            [limit]
        );
    },
};

