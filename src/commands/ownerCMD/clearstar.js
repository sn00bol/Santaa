require('dotenv').config();

module.exports = {
    name: 'clearstar',
    description: 'Clear star yourself or someone else (Owner only)',
    category: 'owner',
    usage: 'Zclearstar `@user`',
    async execute(message, args) {
        const targetUser = message.mentions.users.first() || message.author;
        const rpgmanager = message.client.rpg || require('../../../database/rpgmanager');

        try {
            await rpgmanager.updateWantedLevel(targetUser.id, -99); // Will clamp to 0
            
            message.reply(`Cleared **${targetUser.username}**'s Wanted Level! (Reset to 0 ⭐)`);
        } catch (error) {
            console.error(error);
            message.reply('An error occurred while clearing Wanted Level.');
        }
    }
};
