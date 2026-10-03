const { getCommandUser, replyToCommand, sendCommandMessage } = require('../Utils/commandInteraction');
const { EmbedBuilder } = require('discord.js');
const { category } = require('./stat');
const formatNumber = require('../Utils/formatNumber');

module.exports = {
    name: 'usermoney',
    description: 'Editing a user\'s money like a boss (Owner only)',
    category: 'owner',
    DMs: false,
    usage: 'Zusermoney `set`/`remove`/`reset` `@user` `amount`',
    slashOptions: [
        { name: 'action', description: 'Money action: set, remove, or reset', type: 'string', required: true },
        { name: 'target', description: 'The target user', type: 'user', required: true },
        { name: 'amount', description: 'The amount to set or remove', type: 'integer', required: false },
    ],

    async execute(message, args = []) {
        const dbManager = message.client.db;
        const isSlash = message.isChatInputCommand?.();

        const subcmd = (isSlash ? message.options.getString('action') : args[0])?.toLowerCase();
        const targetUser = isSlash ? message.options.getUser('target') : message.mentions.users.first();
        const amount = isSlash ? message.options.getInteger('amount') : parseInt(args[2]);

        if (!targetUser) {
            return replyToCommand(message, 'Usage: Zusermoney `set`/`remove`/`reset` `@user` `amount`');
        }

        try {
            await dbManager.getUser(targetUser.id);

            let description = '';

            switch (subcmd) {
                case 'set':
                    if (isNaN(amount) || amount < 0) return replyToCommand(message, 'Please provide a valid amount.');
                    await dbManager.setMoney(targetUser.id, amount);
                    description = `Successfully set **${targetUser.username}**'s balance to **$${formatNumber(amount)}**.`;
                    break;

                case 'remove':
                    if (isNaN(amount) || amount <= 0) return replyToCommand(message, 'Please provide a valid amount.');
                    await dbManager.removeMoney(targetUser.id, amount);
                    description = `Successfully removed **$${formatNumber(amount)}** from **${targetUser.username}**'s account.`;
                    break;

                case 'reset':
                    await dbManager.resetMoney(targetUser.id);
                    description = `Successfully reset **${targetUser.username}**'s account to **$0**.`;
                    break;

                default:
                    return replyToCommand(message, 'Invalid subcommand! Use: `set`, `remove`, or `reset`.');
            }

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('Admin Economy Action')
                .setDescription(description)
                .setTimestamp()
                .setFooter({ text: `Executed by: ${getCommandUser(message).tag}` });

            sendCommandMessage(message, { embeds: [embed] });

        } catch (error) {
            console.error('Error:', error);
        }
    }
}