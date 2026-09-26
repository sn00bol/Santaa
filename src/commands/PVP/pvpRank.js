const { EmbedBuilder } = require('discord.js');
const rpgmanager = require('../../../database/rpgmanager');
const { LeaderboardConfig } = require('../Utils/misc');
const formatNumber = require('../Utils/formatNumber');

module.exports = {
    name: 'pvprank',
    description: 'View the PVP leaderboard — top fighters by win count',
    category: 'utl',
    usage: 'Zpvprank',
    async execute(message) {
        try {
            const leaderboard = await rpgmanager.getPvpLeaderboard(10);

            if (!leaderboard || leaderboard.length === 0) {
                return message.reply('No PVP matches have been recorded yet. Be the first — `Zpvp @user`!');
            }

            const { Emoji } = LeaderboardConfig;

            const rows = await Promise.all(leaderboard.map(async (entry, i) => {
                const rank = i + 1;
                const emoji = Emoji[String(rank)] ?? '▫️';
                const total = entry.wins + entry.losses;
                const rate = total > 0 ? Math.round((entry.wins / total) * 100) : 0;

                // Try to fetch username from Discord cache
                let username = `<@${entry.winner_id}>`;
                try {
                    if (message.guild) {
                        const member = await message.guild.members.fetch(entry.winner_id).catch(() => null);
                        if (member) username = member.displayName;
                    } else {
                        const user = await message.client.users.fetch(entry.winner_id).catch(() => null);
                        if (user) username = user.username;
                    }
                } catch (_) { }

                return (
                    `${emoji} **#${rank}** — ${username}\n` +
                    `> ${formatNumber(entry.wins)} W  |  ${formatNumber(entry.losses)} L  |  ${formatNumber(rate)}% WR`
                );
            }));

            const embed = new EmbedBuilder()
                .setTitle('PVP Leaderboard')
                .setDescription(rows.join('\n\n'))
                .setFooter({ text: `Top ${formatNumber(leaderboard.length)} fighters by all-time wins` })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error in pvprank command:', error);
            message.reply('An error occurred while fetching the PVP leaderboard.');
        }
    }
};
