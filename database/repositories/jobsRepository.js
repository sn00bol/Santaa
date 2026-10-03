function createJobsRepository(getDatabase) {
    async function getJobState(userId) {
        const db = getDatabase();
        let state = await db.get('SELECT * FROM job_states WHERE user_id = ?', [userId]);
        if (!state) {
            await db.run(`
                INSERT OR IGNORE INTO job_states (
                    user_id, job_id, work_count, last_worked_at, fired_at, fired_until,
                    first_bonus_received, reminded_for_last_worked_at
                ) VALUES (?, NULL, 0, 0, 0, 0, 0, -1)
            `, [userId]);
            state = {
                user_id: userId,
                job_id: null,
                work_count: 0,
                last_worked_at: 0,
                fired_at: 0,
                fired_until: 0,
                first_bonus_received: 0,
                reminded_for_last_worked_at: -1,
            };
        }
        return state;
    }

    async function setJobState(
        userId,
        jobId,
        workCount,
        lastWorkedAt,
        firedAt,
        firedUntil,
        firstBonusReceived,
        remindedForLastWorkedAt = -1
    ) {
        return getDatabase().run(`
            INSERT INTO job_states (
                user_id, job_id, work_count, last_worked_at, fired_at, fired_until,
                first_bonus_received, reminded_for_last_worked_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                job_id = excluded.job_id,
                work_count = excluded.work_count,
                last_worked_at = excluded.last_worked_at,
                fired_at = excluded.fired_at,
                fired_until = excluded.fired_until,
                first_bonus_received = excluded.first_bonus_received,
                reminded_for_last_worked_at = excluded.reminded_for_last_worked_at
        `, [
            userId,
            jobId,
            workCount,
            lastWorkedAt,
            firedAt,
            firedUntil,
            firstBonusReceived,
            remindedForLastWorkedAt,
        ]);
    }

    return {
        getJobState,

        async getActiveJobStates() {
            return getDatabase().all('SELECT * FROM job_states WHERE job_id IS NOT NULL');
        },

        async markJobReminderSent(userId, jobId, lastWorkedAt, now) {
            const result = await getDatabase().run(`
                UPDATE job_states
                SET reminded_for_last_worked_at = ?
                WHERE user_id = ? AND job_id = ? AND last_worked_at = ?
                    AND reminded_for_last_worked_at != ? AND fired_until <= ?
            `, [lastWorkedAt, userId, jobId, lastWorkedAt, lastWorkedAt, now]);
            return result.changes > 0;
        },

        async fireJobIfOverdue({ userId, jobId, lastWorkedAt, now, cooldownMs, penaltyMs }) {
            const firedUntil = now + penaltyMs;
            const result = await getDatabase().run(`
                UPDATE job_states
                SET fired_at = ?, fired_until = ?, work_count = MAX(0, work_count - 1),
                    last_worked_at = ?, reminded_for_last_worked_at = -1
                WHERE user_id = ? AND job_id = ? AND last_worked_at = ?
                    AND fired_until <= ? AND last_worked_at + ? < ?
            `, [now, firedUntil, firedUntil, userId, jobId, lastWorkedAt, now, cooldownMs, now]);
            return result.changes > 0 ? { firedAt: now, firedUntil } : null;
        },

        setJobState,

        async updateJobProgress(userId, updates) {
            const state = await getJobState(userId);
            const nextState = {
                job_id: updates.job_id ?? state.job_id,
                work_count: updates.work_count ?? state.work_count,
                last_worked_at: updates.last_worked_at ?? state.last_worked_at,
                fired_at: updates.fired_at ?? state.fired_at,
                fired_until: updates.fired_until ?? state.fired_until,
                first_bonus_received: updates.first_bonus_received ?? state.first_bonus_received,
                reminded_for_last_worked_at: updates.reminded_for_last_worked_at
                    ?? (updates.last_worked_at !== undefined ? -1 : state.reminded_for_last_worked_at),
            };
            return setJobState(
                userId,
                nextState.job_id,
                nextState.work_count,
                nextState.last_worked_at,
                nextState.fired_at,
                nextState.fired_until,
                nextState.first_bonus_received,
                nextState.reminded_for_last_worked_at
            );
        },

        async getDailyCooldownRemaining(userId, now, cooldownMs) {
            const row = await getDatabase().get(
                'SELECT claimed_at FROM daily_claims WHERE user_id = ?',
                [userId]
            );
            if (!row || Number(row.claimed_at) <= 0) return 0;
            return Math.max(0, Number(row.claimed_at) + cooldownMs - now);
        },

        async claimDailyReward(userId, now, cooldownMs) {
            const result = await getDatabase().run(`
                INSERT INTO daily_claims (user_id, claimed_at, reminded_claimed_at)
                VALUES (?, ?, -1)
                ON CONFLICT(user_id) DO UPDATE SET claimed_at = excluded.claimed_at
                WHERE daily_claims.claimed_at = 0 OR daily_claims.claimed_at <= ?
            `, [userId, now, now - cooldownMs]);
            return result.changes > 0;
        },

        async getUsersDueDailyReminder(now, cooldownMs) {
            return getDatabase().all(`
                SELECT settings.user_id,
                    COALESCE(claims.claimed_at, 0) AS claimed_at
                FROM user_settings AS settings
                LEFT JOIN daily_claims AS claims ON claims.user_id = settings.user_id
                WHERE settings.setting_id = 'daily_reminder'
                    AND settings.value = 1
                    AND (claims.user_id IS NULL OR claims.claimed_at = 0 OR claims.claimed_at <= ?)
                    AND (claims.user_id IS NULL OR claims.reminded_claimed_at != claims.claimed_at)
            `, [now - cooldownMs]);
        },

        async markDailyReminderSent(userId, claimedAt) {
            const db = getDatabase();
            await db.run(
                'INSERT OR IGNORE INTO daily_claims (user_id, claimed_at, reminded_claimed_at) VALUES (?, 0, 0)',
                [userId]
            );
            const result = await db.run(`
                UPDATE daily_claims
                SET reminded_claimed_at = claimed_at
                WHERE user_id = ? AND claimed_at = ? AND reminded_claimed_at != claimed_at
            `, [userId, claimedAt]);
            return result.changes > 0;
        },

        async resetJobState(userId) {
            return getDatabase().run(`
                UPDATE job_states
                SET job_id = NULL, work_count = 0, last_worked_at = 0, fired_at = 0,
                    fired_until = 0, first_bonus_received = 0, reminded_for_last_worked_at = -1
                WHERE user_id = ?
            `, [userId]);
        },
    };
}

module.exports = { createJobsRepository };
