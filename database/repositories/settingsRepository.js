function createSettingsRepository(getDatabase) {
    async function recordUserActivity(userId, timestamp = Date.now(), force = false) {
        const db = getDatabase();
        return db.run(`
            INSERT INTO user_activity (user_id, last_command_at)
            SELECT ?, ?
            WHERE ? = 1 OR EXISTS (
                SELECT 1 FROM user_settings
                WHERE user_id = ? AND setting_id = 'passive' AND value = 1
            )
            ON CONFLICT(user_id) DO UPDATE SET last_command_at = excluded.last_command_at
        `, [userId, timestamp, force ? 1 : 0, userId]);
    }

    return {
        async getHelpPreference(userId) {
            const row = await getDatabase().get(
                'SELECT last_categories FROM help_preferences WHERE user_id = ?',
                [userId]
            );
            if (!row || !row.last_categories) return ['all'];
            try {
                const parsed = JSON.parse(row.last_categories);
                return Array.isArray(parsed) && parsed.length > 0 ? parsed : ['all'];
            } catch {
                return [row.last_categories];
            }
        },

        async setHelpPreference(userId, categories) {
            const value = JSON.stringify(Array.isArray(categories) ? categories : [categories]);
            return getDatabase().run(`
                INSERT INTO help_preferences (user_id, last_categories)
                VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET last_categories = excluded.last_categories
            `, [userId, value]);
        },

        async getUserSettings(userId) {
            const rows = await getDatabase().all(
                'SELECT setting_id, value FROM user_settings WHERE user_id = ?',
                [userId]
            );
            return rows.reduce((settings, row) => {
                settings[row.setting_id] = Boolean(row.value);
                return settings;
            }, {});
        },

        async ensureDefaultUserSettings(userId) {
            const result = await getDatabase().run(`
                INSERT OR IGNORE INTO user_settings (user_id, setting_id, value)
                SELECT ?, defaults.setting_id, 1
                FROM (
                    SELECT 'reminder' AS setting_id
                    UNION ALL SELECT 'daily_reminder'
                    UNION ALL SELECT 'lvl_notifi'
                ) AS defaults
                WHERE NOT EXISTS (
                    SELECT 1 FROM user_settings WHERE user_id = ?
                )
            `, [userId, userId]);
            return result.changes > 0;
        },

        async setUserSetting(userId, settingId, value) {
            const result = await getDatabase().run(`
                INSERT INTO user_settings (user_id, setting_id, value)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, setting_id) DO UPDATE SET value = excluded.value
            `, [userId, settingId, value ? 1 : 0]);

            if (settingId === 'passive' && value) {
                await recordUserActivity(userId, Date.now(), true);
            }
            return result;
        },

        async getUsersWithSettingEnabled(settingId) {
            const rows = await getDatabase().all(
                'SELECT user_id FROM user_settings WHERE setting_id = ? AND value = 1',
                [settingId]
            );
            return rows.map(row => row.user_id);
        },

        recordUserActivity,

        async expireInactivePassiveSettings(inactiveBefore) {
            const db = getDatabase();
            await db.exec('BEGIN IMMEDIATE');
            try {
                const candidates = await db.all(`
                    SELECT settings.user_id
                    FROM user_settings AS settings
                    JOIN user_activity AS activity ON activity.user_id = settings.user_id
                    WHERE settings.setting_id = 'passive'
                        AND settings.value = 1
                        AND activity.last_command_at <= ?
                `, [inactiveBefore]);

                await db.run(`
                    UPDATE user_settings
                    SET value = 0
                    WHERE setting_id = 'passive'
                        AND value = 1
                        AND user_id IN (
                            SELECT user_id FROM user_activity WHERE last_command_at <= ?
                        )
                `, [inactiveBefore]);
                await db.exec('COMMIT');
                return candidates.map(({ user_id: userId }) => userId);
            } catch (error) {
                await db.exec('ROLLBACK');
                throw error;
            }
        },
    };
}

module.exports = { createSettingsRepository };
