const { EmbedBuilder } = require('discord.js');
const rpgmanager = require('../../../database/rpgmanager');

module.exports = {
    name: 'pvphistory',
    description: 'View recent PVP match history',
    category: 'utl',
    usage: 'Zpvphistory `@user`',
    async execute(message) {
        const target = message.mentions.users.first() || message.author;
        const isself = target.id === message.author.id;

        try {
            const [history, stats] = await Promise.all([
                rpgmanager.getPvpHistory(target.id, 10),
                rpgmanager.getPvpStats(target.id),
            ]);

            if (history.length === 0) {
                return message.reply(
                    isself
                        ? 'You have no PVP match history yet. Challenge someone with `Zpvp @user`!'
                        : `${target.username} has no PVP match history yet.`
                );
            }

            // Build each match row
            const rows = history.map((match, i) => {
                const isWinner = match.winner_id === target.id;
                const opponentId = isWinner ? match.loser_id : match.winner_id;
                const outcome = isWinner ? '🏆 **W**' : '💀 **L**';
                const date = new Date(Number(match.fought_at) * 1000).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                });
                const detail = isWinner
                    ? `+${match.winner_exp_gained} EXP`
                    : `-$${match.loser_money_lost}`;
                return `\`${String(i + 1).padStart(2, '0')}.\` ${outcome} vs <@${opponentId}> — ${date} *(${detail})*`;
            });

            const winRateBar = buildWinRateBar(stats.winRate);

            const embed = new EmbedBuilder()
                .setTitle(`⚔️ PVP History — ${target.username}`)
                .setThumbnail(target.displayAvatarURL())
                .setDescription(rows.join('\n'))
                .addFields(
                    { name: '🏆 Wins', value: `${stats.wins}`, inline: true },
                    { name: '💀 Losses', value: `${stats.losses}`, inline: true },
                    { name: '📊 Win Rate', value: `${stats.winRate}%`, inline: true },
                    { name: '📈 Rate', value: winRateBar, inline: false },
                )
                .setColor(stats.wins >= stats.losses ? '#16A34A' : '#DC2626')
                .setFooter({ text: `Showing last ${history.length} of ${stats.total} match(es)` })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error in pvphistory command:', error);
            message.reply('An error occurred while fetching PVP history.');
        }
    }
};

function buildWinRateBar(rate) {
    const filled = Math.round(rate / 10);
    const empty = 10 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${rate}%`;
}
