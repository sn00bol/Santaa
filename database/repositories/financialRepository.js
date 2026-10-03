function createFinancialRepository(getDatabase, rpgmanager, allItemsCache, getUser) {
    async function getInventoryValue(userId) {
        const inventory = await rpgmanager.getInventory(userId);
        if (!Array.isArray(inventory) || inventory.length === 0) return 0;
        return inventory.reduce((total, item) => {
            const definition = allItemsCache.get(item.item_id);
            return total + Number(definition?.sell ?? definition?.cost ?? 0);
        }, 0);
    }

    async function getNetWorthBreakdown(userId) {
        const user = await getUser(userId);
        const inventoryValue = await getInventoryValue(userId);
        const cash = Number(user.balance);
        const bank = Number(user.bank);
        return {
            cash,
            bank,
            inventoryValue,
            totalAssets: cash + bank + inventoryValue,
            totalEarned: Number(user.total_earned || 0),
        };
    }

    async function getFinancialSnapshot() {
        const [accounts, inventory] = await Promise.all([
            getDatabase().all('SELECT user_id, balance, bank FROM balances'),
            rpgmanager.getAllInventory(),
        ]);
        const accountsByUser = new Map(accounts.map(account => [account.user_id, {
            user_id: account.user_id,
            balance: Number(account.balance || 0),
            bank: Number(account.bank || 0),
            inventoryValue: 0,
            hasBalanceRecord: true,
        }]));

        for (const item of inventory) {
            const definition = allItemsCache.get(item.item_id);
            const itemValue = Number(definition?.sell ?? definition?.cost ?? 0);
            let account = accountsByUser.get(item.user_id);
            if (!account) {
                account = {
                    user_id: item.user_id,
                    balance: 0,
                    bank: 0,
                    inventoryValue: 0,
                    hasBalanceRecord: false,
                };
                accountsByUser.set(item.user_id, account);
            }
            account.inventoryValue += itemValue;
        }

        return [...accountsByUser.values()].map(account => ({
            ...account,
            totalAssets: account.balance + account.bank + account.inventoryValue,
        }));
    }

    function sortByAssets(accounts) {
        return accounts.sort((left, right) =>
            right.totalAssets - left.totalAssets ||
            String(left.user_id).localeCompare(String(right.user_id))
        );
    }

    return {
        getInventoryValue,
        getNetWorthBreakdown,

        async updateNetWorthPeak(userId, currentTotal) {
            const db = getDatabase();
            const total = currentTotal ?? (await getNetWorthBreakdown(userId)).totalAssets;
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
            const row = await db.get(
                'SELECT peak_total FROM net_worth_peaks WHERE user_id = ?',
                [userId]
            );
            return Number(row?.peak_total || 0);
        },

        async getNetWorthSummary(userId) {
            const breakdown = await getNetWorthBreakdown(userId);
            const totalCoins = breakdown.cash + breakdown.bank;
            const peakTotal = await this.updateNetWorthPeak(userId, breakdown.totalAssets);
            return { ...breakdown, totalCoins, peakTotal };
        },

        async getFinancialLeaderboard() {
            return (await getFinancialSnapshot()).map(({ hasBalanceRecord, ...account }) => account);
        },

        async getMoneyLeaderboard(limit = 10) {
            const parsedLimit = Number(limit);
            const safeLimit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 10;
            const accounts = (await getFinancialSnapshot())
                .filter(account => account.hasBalanceRecord);
            return sortByAssets(accounts)
                .slice(0, safeLimit < 0 ? undefined : safeLimit)
                .map(({ hasBalanceRecord, ...account }) => account);
        },

        async getMoneyRank(userId) {
            const ranked = sortByAssets((await getFinancialSnapshot())
                .filter(account => account.hasBalanceRecord));
            const rank = ranked.findIndex(entry => entry.user_id === userId);
            return rank === -1 ? null : rank + 1;
        },
    };
}

module.exports = { createFinancialRepository };
