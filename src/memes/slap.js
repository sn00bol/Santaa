const { AttachmentBuilder } = require('discord.js');
const { getCommandUser, replyToCommand } = require('../commands/Utils/commandInteraction');
const { SLAP_TEMPLATE_ID, createMemeImage, downloadMemeImage } = require('./memeApi');

function createSlapCaptions(slapperName, targetName) {
    return [
        `${targetName} gets slapped`,
        `${slapperName} did the slapping`,
    ];
}

module.exports = {
    name: 'slap',
    description: 'Use the online slap meme template to roast a friend',
    category: 'meme',
    usage: 'Zslap @user',
    slashOptions: [
        { name: 'target', description: 'The user getting slapped in the meme', type: 'user', required: true },
    ],

    async execute(message) {
        const target = message.isChatInputCommand?.()
            ? message.options.getUser('target')
            : message.mentions.users.first();
        if (!target) {
            return replyToCommand(message, 'Tag a user to make a slap meme. Example: `Zslap @user`');
        }

        try {
            const slapper = getCommandUser(message);
            const imageUrl = await createMemeImage(
                SLAP_TEMPLATE_ID,
                createSlapCaptions(slapper.username, target.username)
            );
            const image = await downloadMemeImage(imageUrl);
            return replyToCommand(message, {
                content: `💥 **${slapper.username}** slaps **${target.username}**!`,
                files: [new AttachmentBuilder(image, { name: 'slap-meme.png' })],
            });
        } catch (error) {
            console.error('[MEMES] Failed to create slap meme:', error);
            return replyToCommand(message, 'Could not create that slap meme right now. Please try again later.');
        }
    },

    createSlapCaptions,
};
