require('dotenv').config();
const { getTotalStats } = require('../Utils/StatsCalculator');

module.exports = {
    name: 'maxhealth',
    description: 'Revive him! (Owner only)',
    category: 'owner',
    usage: 'Zmaxhealth `@user`',
    async execute(message, args) {
        if (message.author.id !== process.env.OWNER_ID) return;

        const targetUser = message.mentions.users.first() || message.author;
        const rpgmanager = message.client.rpg || require('../../../database/rpgmanager');

        try {
            const currentStats = await rpgmanager.getStats(targetUser.id);
            const totalStats = await getTotalStats(targetUser.id);
            
            await rpgmanager.updateStats(targetUser.id, totalStats.maxHealth, currentStats.stamina);
            
            message.reply(`Fully restored **${targetUser.username}**'s health to ${totalStats.maxHealth} HP!`);
        } catch (error) {
            console.error(error);
            message.reply('An error occurred while restoring health.');
        }
    }
};
