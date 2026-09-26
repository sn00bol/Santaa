const { EmbedBuilder } = require('discord.js');
const { checkCooldown } = require('../Utils/Cooldown');
const { CURRENCY_EMOJI } = require('../Utils/config');
const formatNumber = require('../Utils/formatNumber');
const { checkWantedRestrictions } = require('../Utils/WantedLevel');

module.exports = {
    name: 'daily',
    description: 'Claim your daily reward',
    category: 'eco',
    usage: 'Zdaily',
    async execute(message) {
        // Database manager
        const { client, author } = message;
        const dbManager = message.client.db;

        // Cooldown
        const timeLeft = checkCooldown(author.id, this.name);

        if (timeLeft) {
            return message.reply(`Please wait ${timeLeft} before using the \`${this.name}\` command again.`);
        }

        const wantedCheck = await checkWantedRestrictions(author.id, this.name, message.client, message);
        if (!wantedCheck.allowed) {
            if (!wantedCheck.handled && wantedCheck.message) message.reply(wantedCheck.message);
            return;
        }

        // Random daily reward
        const dailyReward = Math.floor(Math.random() * (50 - 20 + 1)) + 20; // Random reward between 20 and 50

        try {
            await dbManager.addMoney(message.author.id, dailyReward, { trackEarning: true });
            const dailyEmbed = new EmbedBuilder()
                .setTitle('Daily Reward Claimed!')
                .setDescription(`You have claimed your daily reward of **${formatNumber(dailyReward)}${CURRENCY_EMOJI}**, come back tomorrow for more!`)
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            message.channel.send({ embeds: [dailyEmbed] });
        } catch (error) {
            console.error('Error occurred while claiming daily reward:', error);
        }

    }
}