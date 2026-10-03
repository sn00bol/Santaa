const { getCommandUser, replyToCommand, sendCommandMessage } = require('../Utils/commandInteraction');
const { EmbedBuilder } = require('discord.js');
const { CURRENCY_EMOJI } = require('../Utils/config');
const cooldownConfig = require('../Utils/config');
const formatNumber = require('../Utils/formatNumber');
const { checkWantedRestrictions } = require('../Utils/WantedLevel');

function formatCooldown(ms) {
    const totalMinutes = Math.ceil(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

module.exports = {
    name: 'daily',
    description: 'Claim your daily reward',
    category: 'eco',
    usage: 'Zdaily',
    async execute(message) {
        const author = getCommandUser(message);
        const { client } = message;
        const dbManager = client.db;
        const cooldownMs = cooldownConfig.daily;
        const now = Date.now();

        const timeLeftMs = await dbManager.getDailyCooldownRemaining(author.id, now, cooldownMs);
        if (timeLeftMs > 0) {
            return replyToCommand(message, `Please wait ${formatCooldown(timeLeftMs)} before using the \`${this.name}\` command again.`);
        }

        const wantedCheck = await checkWantedRestrictions(author.id, this.name, message.client, message);
        if (!wantedCheck.allowed) {
            if (!wantedCheck.handled && wantedCheck.message) replyToCommand(message, wantedCheck.message);
            return;
        }

        const claimed = await dbManager.claimDailyReward(author.id, Date.now(), cooldownMs);
        if (!claimed) {
            const remainingMs = await dbManager.getDailyCooldownRemaining(author.id, Date.now(), cooldownMs);
            return replyToCommand(message, `Please wait ${formatCooldown(remainingMs)} before using the \`${this.name}\` command again.`);
        }

        // Random daily reward
        const dailyReward = Math.floor(Math.random() * (50 - 20 + 1)) + 20; // Random reward between 20 and 50

        try {
            await dbManager.addMoney(getCommandUser(message).id, dailyReward, { trackEarning: true });
            const dailyEmbed = new EmbedBuilder()
                .setTitle('Daily Reward Claimed!')
                .setDescription(`You have claimed your daily reward of **${formatNumber(dailyReward)}${CURRENCY_EMOJI}**, come back tomorrow for more!`)
                .setThumbnail(getCommandUser(message).displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            sendCommandMessage(message, { embeds: [dailyEmbed] });
        } catch (error) {
            console.error('Error occurred while claiming daily reward:', error);
        }

    }
}