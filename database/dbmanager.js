const { openDatabase } = require('./connection');
const { migrateBalanceSchema } = require('./schema/balance');
const { createSettingsRepository } = require('./repositories/settingsRepository');
const { createJobsRepository } = require('./repositories/jobsRepository');
const { createEconomyRepository } = require('./repositories/economyRepository');
const { createFinancialRepository } = require('./repositories/financialRepository');
const rpgmanager = require('./rpgmanager');
const { allItemsCache } = require('../src/commands/Utils/StatsCalculator');

let db;
const getDatabase = () => db;
let financialRepository;
const settingsRepository = createSettingsRepository(getDatabase);
const jobsRepository = createJobsRepository(getDatabase);
const economyRepository = createEconomyRepository(
    getDatabase,
    userId => financialRepository.updateNetWorthPeak(userId),
    rpgmanager
);
financialRepository = createFinancialRepository(
    getDatabase,
    rpgmanager,
    allItemsCache,
    userId => economyRepository.getUser(userId)
);

module.exports = {
    async init() {
        if (db) return;
        const database = await openDatabase('./database/balance.db');
        try {
            await migrateBalanceSchema(database);
            db = database;
        } catch (error) {
            await database.close();
            throw error;
        }
    },

    ...settingsRepository,
    ...jobsRepository,
    ...economyRepository,
    ...financialRepository,

    async close() {
        if (!db) return;
        const activeDatabase = db;
        db = null;
        await new Promise((resolve, reject) => {
            activeDatabase.close(error => error ? reject(error) : resolve());
        });
    },
};
