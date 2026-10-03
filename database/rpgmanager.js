const { openDatabase } = require('./connection');
const { migrateGameSchema } = require('./schema/game');
const { createInventoryRepository } = require('./repositories/inventoryRepository');
const { createStatsRepository } = require('./repositories/statsRepository');
const { createLeaderboardRepository } = require('./repositories/leaderboardRepository');

let db;
const getDatabase = () => db;
const statsRepository = createStatsRepository(getDatabase);
const inventoryRepository = createInventoryRepository(
    getDatabase,
    userId => require('./dbmanager').updateNetWorthPeak(userId)
);
const leaderboardRepository = createLeaderboardRepository(
    getDatabase,
    userId => statsRepository.getStats(userId)
);

module.exports = {
    async init() {
        if (db) return;
        const database = await openDatabase('./database/rpg.db');
        try {
            await migrateGameSchema(database);
            db = database;
        } catch (error) {
            await database.close();
            throw error;
        }
    },

    ...inventoryRepository,
    ...statsRepository,
    ...leaderboardRepository,

    async close() {
        if (!db) return;
        const activeDatabase = db;
        db = null;
        await new Promise((resolve, reject) => {
            activeDatabase.close(error => error ? reject(error) : resolve());
        });
    },
};
