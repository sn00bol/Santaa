function createEconomyRepository(getDatabase, getNetWorthPeak, rpgmanager) {
    async function getUser(userId) {
        const db = getDatabase();
        let user = await db.get('SELECT * FROM balances WHERE user_id = ?', [userId]);
        if (!user) {
            await db.run(
                'INSERT OR IGNORE INTO balances (user_id, balance, bank, total_earned) VALUES (?, 0, 0, 0)',
                [userId]
            );
            user = { user_id: userId, balance: 0, bank: 0, total_earned: 0 };
        }
        if (user.total_earned === undefined) user.total_earned = 0;
        return user;
    }

    return {
        getUser,

        async addMoney(userId, amount, options = {}) {
            const db = getDatabase();
            await getUser(userId);
            await db.run(
                `UPDATE balances
                 SET balance = balance + ?,
                     total_earned = total_earned + ?
                 WHERE user_id = ?`,
                [amount, options.trackEarning && amount > 0 ? amount : 0, userId]
            );
            await getNetWorthPeak(userId);
            return true;
        },

        async setMoney(userId, amount) {
            await getUser(userId);
            const result = await getDatabase().run(
                'UPDATE balances SET balance = ? WHERE user_id = ?',
                [amount, userId]
            );
            await getNetWorthPeak(userId);
            return result;
        },

        async removeMoney(userId, amount) {
            await getUser(userId);
            const result = await getDatabase().run(
                'UPDATE balances SET balance = balance - ? WHERE user_id = ?',
                [amount, userId]
            );
            await getNetWorthPeak(userId);
            return result;
        },

        async resetMoney(userId) {
            await getUser(userId);
            const result = await getDatabase().run(
                'UPDATE balances SET balance = 0 WHERE user_id = ?',
                [userId]
            );
            await getNetWorthPeak(userId);
            return result;
        },

        async removeBank(userId, amount) {
            await getUser(userId);
            const result = await getDatabase().run(
                'UPDATE balances SET bank = bank - ? WHERE user_id = ?',
                [amount, userId]
            );
            await getNetWorthPeak(userId);
            return result;
        },

        async getBankLimit(userId) {
            const stats = await rpgmanager.getStats(userId);
            const level = Math.max(1, Number(stats.level) || 1);
            return 500000 * (2 ** Math.floor(level / 15));
        },

        async addBank(userId, amount) {
            await getUser(userId);
            const stats = await rpgmanager.getStats(userId);
            const level = Math.max(1, Number(stats.level) || 1);
            const limit = 500000 * (2 ** Math.floor(level / 15));
            const result = await getDatabase().run(
                'UPDATE balances SET bank = bank + ? WHERE user_id = ? AND bank + ? <= ?',
                [amount, userId, amount, limit]
            );
            if (result.changes > 0) await getNetWorthPeak(userId);
            return result.changes > 0;
        },
    };
}

module.exports = { createEconomyRepository };
