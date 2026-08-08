const { EmbedBuilder } = require('discord.js');
require('dotenv').config();
const os = require('os');

module.exports = {
    name: 'stat',
    description: 'Check out what bot doin (Owner only)',
    category: 'owner',
    usage: 'Zstat',
    async execute(message) {
        if (message.author.id !== process.env.OWNER_ID) return;

        const uptime = process.uptime();
        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const secs = Math.floor(uptime % 60);

        const statsEmbed = new EmbedBuilder()
            .setTitle('Bot System Statistics')
            .addFields(
                { name: 'Uptime', value: `${hrs}h ${mins}m ${secs}s`, inline: true },
                { name: 'RAM Usage', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                { name: 'Platform', value: `${os.platform()} (${os.arch()})`, inline: true },
                { name: 'Servers', value: `${message.client.guilds.cache.size}`, inline: true }
            )
            .setTimestamp();

            message.channel.send({ embeds: [statsEmbed] });
    }
}