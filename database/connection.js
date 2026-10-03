const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function openDatabase(filename) {
    const database = await open({
        filename,
        driver: sqlite3.Database,
    });

    try {
        await database.exec(`
            PRAGMA busy_timeout = 5000;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
        `);
        return database;
    } catch (error) {
        await database.close();
        throw error;
    }
}

async function ensureColumn(database, table, column, definition) {
    const columns = await database.all(`PRAGMA table_info(${table})`);
    if (!columns.some(existing => existing.name === column)) {
        await database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

module.exports = { openDatabase, ensureColumn };
