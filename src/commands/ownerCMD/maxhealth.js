const { getCommandUser, replyToCommand, sendCommandMessage } = require('../Utils/commandInteraction');
require('dotenv').config();
const { getTotalStats } = require('../Utils/StatsCalculator');
const formatNumber = require('../Utils/formatNumber');

module.exports = {
    name: 'maxhealth',
    description: 'Revive him! (Owner only)',
    category: 'owner',
    usage: 'Zmaxhealth `@user`',
    slashOptions: [
        { name: 'target', description: 'The user whose health to restore', type: 'user', required: false },
    ],
    async execute(message) {
        const targetUser = message.isChatInputCommand?.()
            ? message.options.getUser('target') || getCommandUser(message)
            : message.mentions.users.first() || getCommandUser(message);
        const rpgmanager = message.client.rpg || require('../../../database/rpgmanager');

        try {
            const currentStats = await rpgmanager.getStats(targetUser.id);
            const totalStats = await getTotalStats(targetUser.id);
            
            await rpgmanager.updateStats(targetUser.id, totalStats.maxHealth, currentStats.stamina);
            
            replyToCommand(message, `Fully restored **${targetUser.username}**'s health to ${formatNumber(totalStats.maxHealth)} HP!`);
        } catch (error) {
            console.error(error);
            replyToCommand(message, 'An error occurred while restoring health.');
        }
    }
};
