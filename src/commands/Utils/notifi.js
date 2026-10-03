const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { getSetting } = require('../MainCMD/stgfiles');
const cooldownConfig = require('./config');
const { getJobById, getJobCooldownMs } = require('../EconomicCMD/jobs/jobData');
const { getJobNotificationAction } = require('./notificationSchedule');

const startedClients = new WeakSet();
const passiveSetting = getSetting('passive');
const DAILY_REMINDER_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const JOB_REMINDER_SWEEP_INTERVAL_MS = 60 * 1000;

function createNotificationPayload({ title, description, image, color = 0x5865F2 }) {
    const attachment = new AttachmentBuilder(
        path.join(__dirname, '../../../assets', image),
        { name: image }
    );
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setThumbnail(`attachment://${image}`);

    return { embeds: [embed], files: [attachment] };
}

async function sendToUsers(client, userIds, notification) {
    let sentCount = 0;

    for (const userId of userIds) {
        try {
            const user = await client.users.fetch(userId);
            if (user.bot) continue;
            await user.send(createNotificationPayload(notification));
            sentCount += 1;
        } catch (error) {
            console.warn(`[NOTIFI] Could not DM user ${userId}:`, error.message);
        }
    }

    return sentCount;
}

async function sendDailyReminders(client) {
    const prefix = process.env.PFX || 'Z';
    const now = Date.now();
    const dueUsers = await client.db.getUsersDueDailyReminder(now, cooldownConfig.daily);
    let sentCount = 0;

    for (const { user_id: userId, claimed_at: claimedAt } of dueUsers) {
        try {
            const user = await client.users.fetch(userId);
            if (user.bot) continue;
            await user.send(createNotificationPayload({
                title: 'Your daily reward is ready!',
                description: `Claim your daily reward now with \`${prefix}daily\``,
                image: 'calendar.png',
                color: 0xF1C40F,
            }));
            await client.db.markDailyReminderSent(userId, Number(claimedAt) || 0);
            sentCount += 1;
        } catch (error) {
            console.warn(`[NOTIFI] Could not send daily reminder to ${userId}:`, error.message);
        }
    }

    return sentCount;
}

function formatDuration(ms) {
    const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

async function sendJobReminders(client) {
    const now = Date.now();
    const jobStates = await client.db.getActiveJobStates();
    const reminderUsers = new Set(await client.db.getUsersWithSettingEnabled('daily_reminder'));
    const prefix = process.env.PFX || 'Z';
    let remindedCount = 0;
    let firedCount = 0;

    for (const state of jobStates) {
        const job = getJobById(state.job_id);
        if (!job) continue;

        const cooldownMs = getJobCooldownMs(job);
        const action = getJobNotificationAction(state, cooldownMs, now);
        if (action === 'initialize') {
            await client.db.updateJobProgress(state.user_id, { last_worked_at: now });
            continue;
        }

        if (action === 'fire') {
            const firing = await client.db.fireJobIfOverdue({
                userId: state.user_id,
                jobId: state.job_id,
                lastWorkedAt: Number(state.last_worked_at),
                now,
                cooldownMs,
                penaltyMs: cooldownConfig.jobFirePenalty,
            });
            if (!firing) continue;
            firedCount += 1;

            if (!reminderUsers.has(state.user_id)) continue;
            try {
                const user = await client.users.fetch(state.user_id);
                if (user.bot) continue;
                await user.send(createNotificationPayload({
                    title: 'You were fired for missing a shift',
                    description: `Your **${job.name}** work progress dropped by one shift. You can return to work in ${formatDuration(firing.firedUntil - now)} with \`${prefix}job work\`.`,
                    image: 'suitcase.png',
                    color: 0xE74C3C,
                }));
            } catch (error) {
                console.warn(`[NOTIFI] Could not send job firing notice to ${state.user_id}:`, error.message);
            }
            continue;
        }

        if (action !== 'remind' || !reminderUsers.has(state.user_id)) continue;

        const timeUntilFire = Number(state.last_worked_at) + cooldownMs - now;
        try {
            const user = await client.users.fetch(state.user_id);
            if (user.bot) continue;
            await user.send(createNotificationPayload({
                title: 'Your next job shift is due soon',
                description: `Your **${job.name}** shift is due in ${formatDuration(timeUntilFire)}. Use \`${prefix}job work\` before the deadline to avoid a firing penalty.`,
                image: 'suitcase.png',
                color: 0x2ECC71,
            }));
            await client.db.markJobReminderSent(
                state.user_id,
                state.job_id,
                Number(state.last_worked_at),
                now
            );
            remindedCount += 1;
        } catch (error) {
            console.warn(`[NOTIFI] Could not send job reminder to ${state.user_id}:`, error.message);
        }
    }

    return { remindedCount, firedCount };
}

async function sendPassiveExpiryNotifications(client) {
    try {
        const expiredUserIds = await client.db.expireInactivePassiveSettings(
            Date.now() - passiveSetting.autoDisableAfterMs
        );

        return sendToUsers(client, expiredUserIds, {
            title: 'Passive Mode expired',
            description: `Passive Mode was automatically turned off after ${passiveSetting.inactivityLabel} without command use.`,
            image: 'bell.png',
            color: 0x95A5A6,
        });
    } catch (error) {
        console.error('[NOTIFI] Passive expiry sweep failed:', error);
        return 0;
    }
}

async function notifyLevelUp(client, userId, level) {
    try {
        const userSettings = await client.db.getUserSettings(userId);
        if (!getSetting('lvl_notifi').shouldNotify(userSettings)) return false;

        const user = await client.users.fetch(userId);
        const levelCommand = client.commands?.get('level') || require('../UtilsCMD/level');
        const levelContext = {
            author: user,
            client,
            mentions: { users: { first: () => null } },
            reply: payload => user.send(payload),
        };

        await levelCommand.execute(levelContext, []);
        return true;
    } catch (error) {
        console.warn(`[NOTIFI] Could not send level-up DM to ${userId}:`, error.message);
        return false;
    }
}

function startNotifications(client) {
    if (startedClients.has(client)) return;
    startedClients.add(client);

    const scheduleReminder = (intervalMs, label, send, runImmediately = false) => {
        let isRunning = false;
        const run = async () => {
            if (isRunning) return;
            isRunning = true;
            try {
                await send(client);
            } catch (error) {
                console.error(`[NOTIFI] ${label} failed:`, error);
            } finally {
                isRunning = false;
            }
        };

        if (runImmediately) run();
        const timer = setInterval(run, intervalMs);
        timer.unref?.();
    };

    scheduleReminder(DAILY_REMINDER_SWEEP_INTERVAL_MS, 'Daily reminder', sendDailyReminders, true);
    scheduleReminder(JOB_REMINDER_SWEEP_INTERVAL_MS, 'Job reminder', sendJobReminders, true);
    scheduleReminder(passiveSetting.sweepIntervalMs, 'Passive expiry notification', sendPassiveExpiryNotifications);
}

module.exports = {
    createNotificationPayload,
    notifyLevelUp,
    sendDailyReminders,
    sendJobReminders,
    sendPassiveExpiryNotifications,
    startNotifications,
};