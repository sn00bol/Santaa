const { ensureColumn } = require('../connection');

async function migrateBalanceSchema(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS balances (
            user_id TEXT PRIMARY KEY,
            balance INTEGER DEFAULT 0,
            bank INTEGER DEFAULT 0,
            total_earned INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS net_worth_peaks (
            user_id TEXT PRIMARY KEY,
            peak_total INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS job_states (
            user_id TEXT PRIMARY KEY,
            job_id TEXT DEFAULT NULL,
            work_count INTEGER DEFAULT 0,
            last_worked_at INTEGER DEFAULT 0,
            fired_at INTEGER DEFAULT 0,
            fired_until INTEGER DEFAULT 0,
            first_bonus_received INTEGER DEFAULT 0,
            reminded_for_last_worked_at INTEGER NOT NULL DEFAULT -1
        );

        CREATE TABLE IF NOT EXISTS daily_claims (
            user_id TEXT PRIMARY KEY,
            claimed_at INTEGER NOT NULL DEFAULT 0,
            reminded_claimed_at INTEGER NOT NULL DEFAULT -1
        );

        CREATE TABLE IF NOT EXISTS help_preferences (
            user_id TEXT PRIMARY KEY,
            last_categories TEXT DEFAULT 'all'
        );

        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT NOT NULL,
            setting_id TEXT NOT NULL,
            value INTEGER NOT NULL DEFAULT 0 CHECK (value IN (0, 1)),
            PRIMARY KEY (user_id, setting_id)
        );

        CREATE TABLE IF NOT EXISTS settings_migrations (
            migration_id TEXT PRIMARY KEY,
            applied_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_activity (
            user_id TEXT PRIMARY KEY,
            last_command_at INTEGER NOT NULL
        );
    `);

    await ensureColumn(db, 'balances', 'total_earned', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'job_states', 'reminded_for_last_worked_at', 'INTEGER NOT NULL DEFAULT -1');

    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_settings_setting_value
            ON user_settings (setting_id, value);
        CREATE INDEX IF NOT EXISTS idx_user_activity_last_command
            ON user_activity (last_command_at);
        CREATE INDEX IF NOT EXISTS idx_job_states_active
            ON job_states (job_id) WHERE job_id IS NOT NULL;
    `);

    await db.exec('BEGIN IMMEDIATE');
    try {
        const migration = await db.get(
            'SELECT migration_id FROM settings_migrations WHERE migration_id = ?',
            ['split_notification_settings_v1']
        );
        if (!migration) {
            await db.run(`
                INSERT OR IGNORE INTO user_settings (user_id, setting_id, value)
                SELECT user_id, 'daily_reminder', value FROM user_settings
                WHERE setting_id = 'reminder' AND value = 1
            `);
            await db.run(`
                INSERT OR IGNORE INTO user_settings (user_id, setting_id, value)
                SELECT user_id, 'reminder', value FROM user_settings
                WHERE setting_id = 'dm_notify' AND value = 1
            `);
            await db.run(`
                INSERT OR IGNORE INTO user_settings (user_id, setting_id, value)
                SELECT user_id, 'lvl_notifi', value FROM user_settings
                WHERE setting_id = 'dm_notify' AND value = 1
            `);
            await db.run(
                'INSERT INTO settings_migrations (migration_id, applied_at) VALUES (?, ?)',
                ['split_notification_settings_v1', Date.now()]
            );
        }

        await db.run(`
            INSERT OR IGNORE INTO user_activity (user_id, last_command_at)
            SELECT user_id, CAST(strftime('%s', 'now') AS INTEGER) * 1000
            FROM user_settings
            WHERE setting_id = 'passive' AND value = 1
        `);
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
}

module.exports = { migrateBalanceSchema };
