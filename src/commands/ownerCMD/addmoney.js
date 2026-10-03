const { getCommandUser, replyToCommand, sendCommandMessage } = require('../Utils/commandInteraction');
const { EmbedBuilder } = require('discord.js');
const { category } = require('./stat');
const { CURRENCY_SYMBOL } = require('../Utils/config');
const formatNumber = require('../Utils/formatNumber');
require('dotenv').config();

module.exports = {
    name: 'addmoney',
    description: 'Become a philanthropist (Owner only)',
    category: 'owner',
    usage: 'Zaddmoney `@user` `amount`',
    slashOptions: [
        { name: 'target', description: 'The user receiving money', type: 'user', required: true },
        { name: 'amount', description: 'The amount of money to add', type: 'integer', required: true },
    ],
    async execute(message, args = []) {
        const dbManager = message.client.db;

        // tag userID (only for owner of bot to add money to himself or other users)
        const isSlash = message.isChatInputCommand?.();
        const TargetUser = isSlash ? message.options.getUser('target') : message.mentions.users.first();
        const amount = isSlash ? message.options.getInteger('amount') : parseInt(args[1]);

        // checking target user and amount
        if (!TargetUser || isNaN(amount) || amount <= 0) {
            return replyToCommand(message, 'Incorrect usage, use: Zaddmoney `@user` `amount`');
        }

        try {
            await dbManager.addMoney(TargetUser.id, amount);
            const addMoneyEmbed = new EmbedBuilder()
                .setTitle('Money Added!')
                .setDescription(`Successfully added **${CURRENCY_SYMBOL}${formatNumber(amount)}** to ${TargetUser.username}'s balance.`)
                .setThumbnail(TargetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            sendCommandMessage(message, { embeds: [addMoneyEmbed] });
        } catch (error) {
            console.error('Error occurred while adding money:', error);
        }

    }
};