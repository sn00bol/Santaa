function createInventoryRepository(getDatabase, updateNetWorthPeak) {
    return {
        async addItem(userId, itemId, itemName) {
            const result = await getDatabase().run(
                'INSERT INTO inventory (user_id, item_id, item_name) VALUES (?, ?, ?)',
                [userId, itemId, itemName]
            );
            await updateNetWorthPeak(userId);
            return result;
        },

        async getInventory(userId) {
            return getDatabase().all(
                'SELECT * FROM inventory WHERE user_id = ? ORDER BY id ASC',
                [userId]
            );
        },

        async removeItem(inventoryId) {
            const db = getDatabase();
            const item = await db.get('SELECT user_id FROM inventory WHERE id = ?', [inventoryId]);
            const result = await db.run('DELETE FROM inventory WHERE id = ?', [inventoryId]);
            if (result.changes > 0 && item?.user_id) {
                await updateNetWorthPeak(item.user_id);
            }
            return result;
        },

        async markItemBroken(userId, itemId, brokenName) {
            const db = getDatabase();
            const row = await db.get(
                "SELECT id FROM inventory WHERE user_id = ? AND item_id = ? AND item_name NOT LIKE 'Broken %' ORDER BY id ASC LIMIT 1",
                [userId, itemId]
            );
            if (!row) return false;
            await db.run('UPDATE inventory SET item_name = ? WHERE id = ?', [brokenName, row.id]);
            return true;
        },

        async updateInventoryDurability(inventoryId, durability, brokenName = null) {
            if (brokenName) {
                return getDatabase().run(
                    'UPDATE inventory SET durability = ?, item_name = ? WHERE id = ?',
                    [durability, brokenName, inventoryId]
                );
            }
            return getDatabase().run(
                'UPDATE inventory SET durability = ? WHERE id = ?',
                [durability, inventoryId]
            );
        },

        async transferItem(inventoryId, newUserId) {
            const db = getDatabase();
            const item = await db.get('SELECT user_id FROM inventory WHERE id = ?', [inventoryId]);
            const result = await db.run(
                'UPDATE inventory SET user_id = ? WHERE id = ?',
                [newUserId, inventoryId]
            );
            if (result.changes > 0 && item?.user_id) {
                await updateNetWorthPeak(item.user_id);
                if (item.user_id !== newUserId) await updateNetWorthPeak(newUserId);
            }
            return result;
        },

        async getAllInventory() {
            return getDatabase().all('SELECT user_id, item_id FROM inventory');
        },

        async getItemOwnershipLeaderboard(itemId) {
            return getDatabase().all(`
                SELECT user_id, COUNT(*) AS owned_count
                FROM inventory
                WHERE item_id = ?
                GROUP BY user_id
                ORDER BY owned_count DESC, user_id ASC
            `, [itemId]);
        },
    };
}

module.exports = { createInventoryRepository };
