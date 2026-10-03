const { AttachmentBuilder } = require('discord.js');
const { replyToCommand } = require('../commands/Utils/commandInteraction');
const { createRandomMeme, downloadMemeImage } = require('./memeApi');

const MAX_CAPTION_LENGTH = 180;

function parseCaptions(args = []) {
    const raw = args.join(' ');
    const separator = raw.indexOf('|');
    if (separator < 0) return null;
    const top = raw.slice(0, separator).trim();
    const bottom = raw.slice(separator + 1).trim();
    if (!top || !bottom || top.length > MAX_CAPTION_LENGTH || bottom.length > MAX_CAPTION_LENGTH) return null;
    return { top, bottom };
}

module.exports = {
    name: 'caption',
    aliases: ['caption'],
    description: 'Create a web meme with your own top and bottom captions',
    category: 'mie',
    usage: 'Zmeme <top text> | <bottom text>',
    slashOptions: [
        { name: 'top', description: 'Text displayed at the top of the meme', type: 'string', required: true },
        { name: 'bottom', description: 'Text displayed at the bottom of the meme', type: 'string', required: true },
    ],
    parseCaptions,

    async execute(message, args = []) {
        const captions = message.isChatInputCommand?.()
            ? {
                top: message.options.getString('top')?.trim(),
                bottom: message.options.getString('bottom')?.trim(),
            }
            : parseCaptions(args);
        if (
            !captions?.top ||
            !captions?.bottom ||
            captions.top.length > MAX_CAPTION_LENGTH ||
            captions.bottom.length > MAX_CAPTION_LENGTH
        ) {
            return replyToCommand(
                message,
                `Provide top and bottom captions (up to ${MAX_CAPTION_LENGTH} characters each).\n` +
                'Example: `Zmeme When it works | It was a feature`'
            );
        }

        try {
            const { template, url } = await createRandomMeme([captions.top, captions.bottom]);
            const image = await downloadMemeImage(url);
            return replyToCommand(message, {
                content: `🖼️ **${template.name}**`,
                files: [new AttachmentBuilder(image, { name: 'meme.png' })],
            });
        } catch (error) {
            console.error('[MEMES] Failed to create caption meme:', error);
            return replyToCommand(message, 'Could not create that meme right now. Please try again later.');
        }
    },
};
