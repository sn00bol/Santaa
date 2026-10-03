const config = require('../../src/commands/Utils/config');
const { parseFishingProfile, DEFAULT_FISHING_PROFILE } = require('../../src/commands/Utils/fishingSchema');
const { parseMiningProfile, DEFAULT_MINING_PROFILE } = require('../../src/commands/Utils/miningSchema');

function createStatsRepository(getDatabase) {
    async function getStats(userId) {
        const db = getDatabase();
        let stats = await db.get('SELECT * FROM stats WHERE user_id = ?', [userId]);
        if (!stats) {
            await db.run(
                `INSERT OR IGNORE INTO stats (
                    user_id, health, stamina, attack, defense, level, exp, steals,
                    equipped_item_id, wanted_level, wanted_updated_at, fishing_profile, mining_profile
                ) VALUES (?, 100, 100, 5, 2, 1, 0, 0, NULL, 0, 0, ?, ?)`,
                [userId, JSON.stringify(DEFAULT_FISHING_PROFILE), JSON.stringify(DEFAULT_MINING_PROFILE)]
            );
            stats = {
                user_id: userId,
                health: 100,
                stamina: 100,
                attack: 5,
                defense: 2,
                level: 1,
                exp: 0,
                steals: 0,
                equipped_item_id: null,
                wanted_level: 0,
                wanted_updated_at: 0,
                equipped_items: '[]',
                fishing_profile: DEFAULT_FISHING_PROFILE,
                mining_profile: DEFAULT_MINING_PROFILE,
            };
        }

        stats.fishing_profile = stats.fishing_profile
            ? parseFishingProfile(stats.fishing_profile)
            : { ...DEFAULT_FISHING_PROFILE };
        stats.mining_profile = parseMiningProfile(stats.mining_profile);

        const now = Date.now();
        if (stats.wanted_level > 0 && stats.wanted_updated_at > 0) {
            const decayTime = config.wantedDecay || 24 * 60 * 60 * 1000;
            if (now - stats.wanted_updated_at > decayTime) {
                const newWantedLevel = Math.max(0, stats.wanted_level - 10);
                await db.run(
                    'UPDATE stats SET wanted_level = ?, wanted_updated_at = ? WHERE user_id = ?',
                    [newWantedLevel, now, userId]
                );
                stats.wanted_level = newWantedLevel;
                stats.wanted_updated_at = now;
            }
        }
        return stats;
    }

    return {
        getStats,

        async updateWantedLevel(userId, change) {
            const stats = await getStats(userId);
            const newLevel = Math.max(0, Math.min(30, (stats.wanted_level || 0) + change));
            await getDatabase().run(
                'UPDATE stats SET wanted_level = ?, wanted_updated_at = ? WHERE user_id = ?',
                [newLevel, Date.now(), userId]
            );
            return newLevel;
        },

        async updateClimbBestHeight(userId, height) {
            await getStats(userId);
            return getDatabase().run(
                'UPDATE stats SET climb_best_height = MAX(climb_best_height, ?) WHERE user_id = ?',
                [Math.max(0, Math.floor(Number(height) || 0)), userId]
            );
        },

        async updateStats(userId, health, stamina) {
            return getDatabase().run(
                'UPDATE stats SET health = ?, stamina = ? WHERE user_id = ?',
                [health, stamina, userId]
            );
        },

        async updateProgress(userId, {
            attack, defense, level, exp, steals, crimes, begs, items_sold, items_bought,
            unknown_category_visits, pvp_wins, climb_best_height, fishing_profile, mining_profile,
        }) {
            const updates = [];
            const params = [];
            const fields = {
                attack,
                defense,
                level,
                exp,
                steals,
                crimes,
                begs,
                items_sold,
                items_bought,
                unknown_category_visits,
                pvp_wins,
                climb_best_height,
            };
            for (const [column, value] of Object.entries(fields)) {
                if (value !== undefined) {
                    updates.push(`${column} = ?`);
                    params.push(value);
                }
            }
            if (fishing_profile !== undefined) {
                updates.push('fishing_profile = ?');
                params.push(JSON.stringify(parseFishingProfile(fishing_profile)));
            }
            if (mining_profile !== undefined) {
                updates.push('mining_profile = ?');
                params.push(JSON.stringify(parseMiningProfile(mining_profile)));
            }
            if (updates.length === 0) return;
            params.push(userId);
            return getDatabase().run(`UPDATE stats SET ${updates.join(', ')} WHERE user_id = ?`, params);
        },

        async equipItem(userId, itemId) {
            const row = await getDatabase().get('SELECT * FROM stats WHERE user_id = ?', [userId]);
            let equipped = [];
            try {
                equipped = row?.equipped_items ? JSON.parse(row.equipped_items) : [];
            } catch {
                equipped = [];
            }
            if (!equipped.includes(itemId)) {
                if (equipped.length >= 3) return { changed: false, reason: 'limit' };
                equipped.push(itemId);
            }
            await getDatabase().run(
                'UPDATE stats SET equipped_items = ? WHERE user_id = ?',
                [JSON.stringify(equipped), userId]
            );
            return { changed: true };
        },

        async unequipItem(userId, itemId) {
            const row = await getDatabase().get('SELECT * FROM stats WHERE user_id = ?', [userId]);
            let equipped = [];
            try {
                equipped = row?.equipped_items ? JSON.parse(row.equipped_items) : [];
            } catch {
                equipped = [];
            }
            const index = equipped.indexOf(itemId);
            if (index === -1) return { changed: false };
            equipped.splice(index, 1);
            await getDatabase().run(
                'UPDATE stats SET equipped_items = ? WHERE user_id = ?',
                [JSON.stringify(equipped), userId]
            );
            return { changed: true };
        },

        async getFishingProfile(userId) {
            const row = await getDatabase().get(
                'SELECT fishing_profile FROM stats WHERE user_id = ?',
                [userId]
            );
            if (!row) return { ...DEFAULT_FISHING_PROFILE };
            return parseFishingProfile(row.fishing_profile);
        },

        async setFishingProfile(userId, profile) {
            const fishingProfile = parseFishingProfile(profile);
            await getStats(userId);
            return getDatabase().run(
                'UPDATE stats SET fishing_profile = ? WHERE user_id = ?',
                [JSON.stringify(fishingProfile), userId]
            );
        },

        async getMiningProfile(userId) {
            const stats = await getStats(userId);
            return stats.mining_profile;
        },

        async setMiningProfile(userId, profile) {
            const miningProfile = parseMiningProfile(profile);
            await getStats(userId);
            return getDatabase().run(
                'UPDATE stats SET mining_profile = ? WHERE user_id = ?',
                [JSON.stringify(miningProfile), userId]
            );
        },
    };
}

module.exports = { createStatsRepository };
