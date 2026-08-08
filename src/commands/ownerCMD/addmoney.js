const { EmbedBuilder } = require('discord.js');
const { category } = require('./stat');
const { CURRENCY_SYMBOL } = require('../Utils/config');
require('dotenv').config();

module.exports = {
    name: 'addmoney',
    description: 'Become a philanthropist (Owner only)',
    category: 'owner',
    usage: 'Zaddmoney `@user` `amount`',
    async execute(message, args) {
        // Check if the user is the bot owner        
        if (message.author.id !== process.env.OWNER_ID) {
            return message.reply("ONLY OWNER'S BOT CAN USE THIS COMMAND.");
        }
        const { client } = message;
        const dbManager = message.client.db;

        // tag userID (only for owner of bot to add money to himself or other users)
        const TargetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);

        // checking target user and amount
        if (!TargetUser || isNaN(amount) || amount <= 0) {
            return message.reply('Incorrect usage, use: Zaddmoney `@user` `amount`');
        }

        try {
            await dbManager.addMoney(TargetUser.id, amount);
            const addMoneyEmbed = new EmbedBuilder()
                .setTitle('Money Added!')
                .setDescription(`Successfully added **${CURRENCY_SYMBOL}${amount.toLocaleString()}** to ${TargetUser.username}'s balance.`)
                .setThumbnail(TargetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            message.channel.send({ embeds: [addMoneyEmbed] });
        } catch (error) {
            console.error('Error occurred while adding money:', error);
        }

    }
};