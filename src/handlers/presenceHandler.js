const { ActivityType } = require('discord.js');

function registerPresenceNotifications(client, notifi) {
    client.once('clientReady', () => {
        notifi.startNotifications(client);
    });
}

function startPresence(client) {
    const updateStatus = () => {
        const serverCount = client.guilds.cache.size;
        client.user.setPresence({
            status: 'online',
            activities: [{
                name: `Serving ${serverCount} servers!`,
                type: ActivityType.Streaming,
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            }],
        });
    };

    updateStatus();
    return setInterval(updateStatus, 5 * 60 * 1000);
}

module.exports = { registerPresenceNotifications, startPresence };
