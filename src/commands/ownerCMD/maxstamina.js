require('dotenv').config();
const { getTotalStats } = require('../Utils/StatsCalculator');

module.exports = {
    name: 'maxstamina',
    description: 'GET BACK TO WORK!!! (Owner only)',
    category: 'owner',
    usage: 'Zmaxstamina `@user`',
    async execute(message, args) {
        const targetUser = message.mentions.users.first() || message.author;
        const rpgmanager = message.client.rpg || require('../../../database/rpgmanager');

        try {
            const currentStats = await rpgmanager.getStats(targetUser.id);
            const totalStats = await getTotalStats(targetUser.id);
            
            await rpgmanager.updateStats(targetUser.id, currentStats.health, totalStats.maxStamina);
            
            message.reply(`Fully restored **${targetUser.username}**'s stamina to ${totalStats.maxStamina}!`);
        } catch (error) {
            console.error(error);
            message.reply('An error occurred while restoring stamina.');
        }
    }
};
