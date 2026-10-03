const { replyToCommand } = require('../commands/Utils/commandInteraction');
const { sendTemplateMeme } = require('./templateMeme');

module.exports = {
    name: 'distracted',
    description: 'Create a Distracted Boyfriend meme with three captions',
    category: 'meme',
    usage: 'Zdistracted <current choice> | <distraction> | <partner>',
    slashOptions: [
        { name: 'current', description: 'Current choice being ignored', type: 'string', required: true },
        { name: 'distraction', description: 'The new distraction', type: 'string', required: true },
        { name: 'partner', description: 'The person reacting to the distraction', type: 'string', required: true },
    ],

    async execute(message, args = []) {
        let captions;
        if (message.isChatInputCommand?.()) {
            captions = [
                message.options.getString('current'),
                message.options.getString('distraction'),
                message.options.getString('partner'),
            ];
        } else {
            const raw = args.join(' ');
            captions = raw.split('|').map(caption => caption.trim());
        }

        if (captions.length !== 3 || captions.some(caption => !caption)) {
            return replyToCommand(
                message,
                'Provide three captions separated by `|`. Example: `Zdistracted Homework | Games | Me`'
            );
        }
        return sendTemplateMeme(message, 'db', 'Distracted Boyfriend', captions);
    },
};
