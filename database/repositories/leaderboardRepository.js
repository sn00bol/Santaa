function createLeaderboardRepository(getDatabase, getStats) {
    return {
        async recordPvpResult(winnerId, loserId, expGained = 20, moneyLost = 0) {
            return getDatabase().run(
                'INSERT INTO pvp_history (winner_id, loser_id, winner_exp_gained, loser_money_lost) VALUES (?, ?, ?, ?)',
                [winnerId, loserId, expGained, moneyLost]
            );
        },

        async getPvpHistory(userId, limit = 10) {
            return getDatabase().all(
                `SELECT * FROM pvp_history
                 WHERE winner_id = ? OR loser_id = ?
                 ORDER BY fought_at DESC LIMIT ?`,
                [userId, userId, limit]
            );
        },

        async getPvpLeaderboard(limit = 10) {
            return getDatabase().all(
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

        async getPvpStats(userId) {
            const [winRow, lossRow] = await Promise.all([
                getDatabase().get('SELECT COUNT(*) AS cnt FROM pvp_history WHERE winner_id = ?', [userId]),
                getDatabase().get('SELECT COUNT(*) AS cnt FROM pvp_history WHERE loser_id = ?', [userId]),
            ]);
            const wins = winRow?.cnt ?? 0;
            const losses = lossRow?.cnt ?? 0;
            const total = wins + losses;
            return { wins, losses, total, winRate: total > 0 ? Math.round((wins / total) * 100) : 0 };
        },

        async getLevelLeaderboard(limit = 10) {
            return getDatabase().all(
                `SELECT user_id, level, exp FROM stats
                 ORDER BY level DESC, exp DESC, user_id ASC
                 LIMIT ?`,
                [limit]
            );
        },

        async getLevelRank(userId) {
            const stats = await getStats(userId);
            const row = await getDatabase().get(
                `SELECT COUNT(*) AS usersAhead FROM stats
                 WHERE level > ?
                    OR (level = ? AND exp > ?)
                    OR (level = ? AND exp = ? AND user_id < ?)`,
                [stats.level, stats.level, stats.exp, stats.level, stats.exp, userId]
            );
            return Number(row?.usersAhead || 0) + 1;
        },

        async getWinsLeaderboard(limit = 10) {
            return getDatabase().all(
                `SELECT winner_id AS user_id, COUNT(*) AS wins
                 FROM pvp_history
                 GROUP BY winner_id
                 ORDER BY wins DESC
                 LIMIT ?`,
                [limit]
            );
        },

        async getStealsLeaderboard(limit = 10) {
            return getDatabase().all(
                `SELECT user_id, steals FROM stats
                 WHERE steals > 0
                 ORDER BY steals DESC, user_id ASC
                 LIMIT ?`,
                [limit]
            );
        },

        async getLeaderboardStats() {
            return getDatabase().all(`
                SELECT stats.user_id, stats.level, stats.exp, stats.steals, stats.climb_best_height,
                    stats.crimes, stats.begs, stats.fishing_profile,
                    COALESCE(wins.count, 0) AS pvp_wins,
                    COALESCE(losses.count, 0) AS pvp_losses
                FROM stats
                LEFT JOIN (
                    SELECT winner_id AS user_id, COUNT(*) AS count
                    FROM pvp_history
                    GROUP BY winner_id
                ) AS wins ON wins.user_id = stats.user_id
                LEFT JOIN (
                    SELECT loser_id AS user_id, COUNT(*) AS count
                    FROM pvp_history
                    GROUP BY loser_id
                ) AS losses ON losses.user_id = stats.user_id
            `);
        },
    };
}

module.exports = { createLeaderboardRepository };
