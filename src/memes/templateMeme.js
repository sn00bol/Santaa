const { AttachmentBuilder } = require('discord.js');
const { replyToCommand } = require('../commands/Utils/commandInteraction');
const { createMemeImage, downloadMemeImage } = require('./memeApi');

const MAX_CAPTION_LENGTH = 180;

async function sendTemplateMeme(message, templateId, templateName, captions, { showTitle = true } = {}) {
    if (
        !Array.isArray(captions) ||
        captions.some(caption =>
            typeof caption !== 'string' ||
            caption.trim().length === 0 ||
            caption.length > MAX_CAPTION_LENGTH
        )
    ) {
        return replyToCommand(
            message,
            `Every caption is required and must be ${MAX_CAPTION_LENGTH} characters or fewer.`
        );
    }

    try {
        const imageUrl = await createMemeImage(templateId, captions.map(caption => caption.trim()));
        const image = await downloadMemeImage(imageUrl);
        const payload = {
            files: [new AttachmentBuilder(image, { name: `${templateId}-meme.png` })],
        };
        if (showTitle) payload.content = `🖼️ **${templateName}**`;
        return replyToCommand(message, payload);
    } catch (error) {
        console.error(`[MEMES] Failed to create ${templateName} meme:`, error);
        return replyToCommand(message, `Could not create the ${templateName} meme right now. Please try again later.`);
    }
}

module.exports = { sendTemplateMeme };
