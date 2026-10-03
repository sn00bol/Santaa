const JOB_REMINDER_LEAD_MS = 5 * 60 * 1000;

function isDailyReminderDue(claimedAt, remindedClaimedAt, now, cooldownMs) {
    const claimTimestamp = Number(claimedAt) || 0;
    const reminderTimestamp = Number(remindedClaimedAt);
    const readyAt = claimTimestamp > 0 ? claimTimestamp + cooldownMs : 0;

    return now >= readyAt && reminderTimestamp !== claimTimestamp;
}

function getJobNotificationAction(state, jobCooldownMs, now, reminderLeadMs = JOB_REMINDER_LEAD_MS) {
    if (!state?.job_id || jobCooldownMs <= 0 || Number(state.fired_until) > now) return 'none';

    const lastWorkedAt = Number(state.last_worked_at) || 0;
    if (lastWorkedAt <= 0) return 'initialize';

    const timeUntilFire = lastWorkedAt + jobCooldownMs - now;
    if (timeUntilFire < 0) return 'fire';
    if (
        timeUntilFire <= reminderLeadMs
        && Number(state.reminded_for_last_worked_at) !== lastWorkedAt
    ) return 'remind';

    return 'none';
}

module.exports = {
    JOB_REMINDER_LEAD_MS,
    isDailyReminderDue,
    getJobNotificationAction,
};