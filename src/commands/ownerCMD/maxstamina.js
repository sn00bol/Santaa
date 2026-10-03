const { getCommandUser, replyToCommand, sendCommandMessage } = require('../Utils/commandInteraction');
require('dotenv').config();
const { getTotalStats } = require('../Utils/StatsCalculator');
const formatNumber = require('../Utils/formatNumber');

module.exports = {
    name: 'maxstamina',
    description: 'GET BACK TO WORK!!! (Owner only)',
    category: 'owner',
    usage: 'Zmaxstamina `@user`',
    slashOptions: [
        { name: 'target', description: 'The user whose stamina to restore', type: 'user', required: false },
    ],
    async execute(message) {
        const targetUser = message.isChatInputCommand?.()
            ? message.options.getUser('target') || getCommandUser(message)
            : message.mentions.users.first() || getCommandUser(message);
        const rpgmanager = message.client.rpg || require('../../../database/rpgmanager');

        try {
            const currentStats = await rpgmanager.getStats(targetUser.id);
            const totalStats = await getTotalStats(targetUser.id);
            
            await rpgmanager.updateStats(targetUser.id, currentStats.health, totalStats.maxStamina);
            
            replyToCommand(message, `Fully restored **${targetUser.username}**'s stamina to ${formatNumber(totalStats.maxStamina)}!`);
        } catch (error) {
            console.error(error);
            replyToCommand(message, 'An error occurred while restoring stamina.');
        }
    }
};
