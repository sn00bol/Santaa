const { ensureColumn } = require('../connection');

async function migrateGameSchema(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            item_id TEXT,
            item_name TEXT,
            durability INTEGER DEFAULT NULL,
            acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

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
            fishing_profile TEXT DEFAULT '{}',
            mining_profile TEXT DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS pvp_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            winner_id TEXT NOT NULL,
            loser_id TEXT NOT NULL,
            fought_at INTEGER DEFAULT (strftime('%s', 'now')),
            winner_exp_gained INTEGER DEFAULT 20,
            loser_money_lost INTEGER DEFAULT 0
        );
    `);

    const statColumns = [
        ['defense', 'INTEGER DEFAULT 2'],
        ['level', 'INTEGER DEFAULT 1'],
        ['exp', 'INTEGER DEFAULT 0'],
        ['steals', 'INTEGER DEFAULT 0'],
        ['equipped_items', "TEXT DEFAULT '[]'"],
        ['wanted_level', 'INTEGER DEFAULT 0'],
        ['wanted_updated_at', 'INTEGER DEFAULT 0'],
        ['fishing_profile', "TEXT DEFAULT '{}'"],
        ['mining_profile', "TEXT DEFAULT '{}'"],
        ['crimes', 'INTEGER DEFAULT 0'],
        ['begs', 'INTEGER DEFAULT 0'],
        ['items_sold', 'INTEGER DEFAULT 0'],
        ['items_bought', 'INTEGER DEFAULT 0'],
        ['unknown_category_visits', 'INTEGER DEFAULT 0'],
        ['pvp_wins', 'INTEGER DEFAULT 0'],
    ];

    await ensureColumn(db, 'inventory', 'durability', 'INTEGER DEFAULT NULL');
    for (const [column, definition] of statColumns) {
        await ensureColumn(db, 'stats', column, definition);
    }

    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_inventory_user
            ON inventory (user_id, id);
        CREATE INDEX IF NOT EXISTS idx_inventory_item_user
            ON inventory (item_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_stats_level_exp
            ON stats (level DESC, exp DESC, user_id);
        CREATE INDEX IF NOT EXISTS idx_pvp_winner_fought
            ON pvp_history (winner_id, fought_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pvp_loser_fought
            ON pvp_history (loser_id, fought_at DESC);
    `);
}

module.exports = { migrateGameSchema };
