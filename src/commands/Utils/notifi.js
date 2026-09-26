const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { getSetting } = require('../MainCMD/stgfiles');
const cooldownConfig = require('./config');

const startedClients = new WeakSet();
const passiveSetting = getSetting('passive');

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

async function sendToSettingUsers(client, settingId, notification) {
    const userIds = await client.db.getUsersWithSettingEnabled(settingId);
    return sendToUsers(client, userIds, notification);
}

async function sendDailyReminders(client) {
    const prefix = process.env.PFX || 'Z';
    return sendToSettingUsers(client, 'daily_reminder', {
        title: 'Your daily reward is ready!',
        description: `Claim your daily reward now with \`${prefix}daily\``,
        image: 'calendar.png',
        color: 0xF1C40F,
    });
}

async function sendJobReminders(client) {
    const userIds = await client.db.getUsersWithSettingEnabled('daily_reminder');
    const employedUserIds = [];

    for (const userId of userIds) {
        const jobState = await client.db.getJobState(userId);
        if (jobState.job_id) employedUserIds.push(userId);
    }

    const prefix = process.env.PFX || 'Z';
    return sendToUsers(client, employedUserIds, {
        title: 'GET BACK TO WORK!!!',
        description: `Your boss is angrily with you because you haven't done anything few days, use \`${prefix}job work\` right now!`,
        image: 'suitcase.png',
        color: 0x2ECC71,
    });
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

    const scheduleReminder = (intervalMs, label, send) => {
        const timer = setInterval(() => {
            send(client).catch(error => {
                console.error(`[NOTIFI] ${label} failed:`, error);
            });
        }, intervalMs);
        timer.unref?.();
    };

    scheduleReminder(cooldownConfig.dailyReminderCooldownMs, 'Daily reminder', sendDailyReminders);
    scheduleReminder(cooldownConfig.jobReminderCooldownMs, 'Job reminder', sendJobReminders);
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