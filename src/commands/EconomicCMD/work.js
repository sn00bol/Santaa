const { EmbedBuilder } = require('discord.js');
const { jobs, jobs_txt } = require('../Utils/misc'); // Import job from tips.js
const { checkCooldown } = require('../Utils/Cooldown'); // Import cooldown function from Cooldown.js
const { CURRENCY_EMOJI } = require('../Utils/config');
const { checkWantedRestrictions } = require('../Utils/WantedLevel');

module.exports = {
    name: 'parttime',
    description: 'Do part-time work cuz u unemployed final boss',
    category: 'eco',
    usage: 'Zparttime',
    async execute(message) {
        const { client, author } = message;
        const dbManager = message.client.db;

        // Cooldown
        const timeLeft = checkCooldown(author.id, this.name);

        if (timeLeft) {
            return message.reply(`Please wait ${timeLeft} before using the \`${this.name}\` command again.`);
        }

        const wantedCheck = await checkWantedRestrictions(author.id, this.name, client, message);
        if (!wantedCheck.allowed) {
            if (!wantedCheck.handled && wantedCheck.message) message.reply(wantedCheck.message);
            return;
        }

        // rand fuc
        const randJob = jobs[Math.floor(Math.random() * jobs.length)];
        const jobQuote = jobs_txt[Math.floor(Math.random() * jobs_txt.length)];

        // Random job paid
        const amountEarned = Math.floor(Math.random() * (50 - 5 + 1)) + 5;

        try {
            await dbManager.addMoney(message.author.id, amountEarned, { trackEarning: true });

            // work embed
            const workEmbed = new EmbedBuilder()
                .setAuthor({
                    name: message.author.username,
                    iconURL: message.author.displayAvatarURL()
                })
                .setDescription(
                    `**${randJob.name}**` +
                    ` and you earned **${amountEarned.toLocaleString()}${CURRENCY_EMOJI}**!\n\n` +
                    `*"${jobQuote}"*`
                )
                .setTimestamp();
            message.channel.send({ embeds: [workEmbed] });

            const rpgManager = message.client.rpg;
            const achievementChecker = require('../../minigames/achievement/achievementChecker');
            const stats = await rpgManager.getStats(author.id);
            achievementChecker.checkEconomy(author.id, stats, 'parttime').catch(console.error);
        } catch (error) {
            console.error('Error occurred while updating user balance:', error);
        }
    }
};