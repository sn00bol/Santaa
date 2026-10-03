const { getCommandUser, replyToCommand, sendCommandMessage } = require('../Utils/commandInteraction');
require('dotenv').config();

module.exports = {
    name: 'clearstar',
    description: 'Clear star yourself or someone else (Owner only)',
    category: 'owner',
    usage: 'Zclearstar `@user`',
    slashOptions: [
        { name: 'target', description: 'The user whose wanted level to clear', type: 'user', required: false },
    ],
    async execute(message) {
        const targetUser = message.isChatInputCommand?.()
            ? message.options.getUser('target') || getCommandUser(message)
            : message.mentions.users.first() || getCommandUser(message);
        const rpgmanager = message.client.rpg || require('../../../database/rpgmanager');

        try {
            await rpgmanager.updateWantedLevel(targetUser.id, -99); // Will clamp to 0
            
            replyToCommand(message, `Cleared **${targetUser.username}**'s Wanted Level! (Reset to 0 ⭐)`);
        } catch (error) {
            console.error(error);
            replyToCommand(message, 'An error occurred while clearing Wanted Level.');
        }
    }
};
