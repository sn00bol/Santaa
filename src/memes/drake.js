const { getCommandUser, replyToCommand } = require('../commands/Utils/commandInteraction');
const { sendTemplateMeme } = require('./templateMeme');

module.exports = {
    name: 'drake',
    description: 'Create a Drakeposting meme with two captions',
    category: 'meme',
    usage: 'Zdrake <rejected text> | <approved text>',
    slashOptions: [
        { name: 'rejected', description: 'The option Drake rejects', type: 'string', required: true },
        { name: 'approved', description: 'The option Drake approves', type: 'string', required: true },
    ],

    async execute(message, args = []) {
        let rejected;
        let approved;
        if (message.isChatInputCommand?.()) {
            rejected = message.options.getString('rejected');
            approved = message.options.getString('approved');
        } else {
            const raw = args.join(' ');
            const separator = raw.indexOf('|');
            if (separator >= 0) {
                rejected = raw.slice(0, separator).trim();
                approved = raw.slice(separator + 1).trim();
            }
        }

        if (!rejected || !approved) {
            return replyToCommand(message, 'Provide both captions. Example: `Zdrake Old way | New way`');
        }
        return sendTemplateMeme(message, 'drake', 'Drakeposting', [rejected, approved], { showTitle: false });
    },
};
