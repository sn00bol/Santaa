const { EmbedBuilder } = require('discord.js');
const inflationManager = require('../Utils/InflationManager');
const { allItemsCache } = require('../Utils/StatsCalculator');
const { isOwner } = require('../Utils/permission');

module.exports = {
    name: 'inflation',
    aliases: ['inf'],
    description: 'Manage inflation rates globally, per shop, or per item (Owner only)',
    category: 'owner',
    usage: 'Zinflation <global|shop|item|reset|view> [name] [rate]',
    async execute(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply({ content: 'Only bot owners can use this command.', ephemeral: true });
        }

        const subCommand = args[0] ? args[0].toLowerCase() : 'view';

        if (subCommand === 'view') {
            let desc = `**Global Rate:** x${inflationManager.config.global}\n\n`;

            if (Object.keys(inflationManager.config.shops).length > 0) {
                desc += `**Shop Rates:**\n`;
                for (const [shop, rate] of Object.entries(inflationManager.config.shops)) {
                    desc += `- ${shop}: x${rate}\n`;
                }
                desc += '\n';
            }

            if (Object.keys(inflationManager.config.items).length > 0) {
                desc += `**Item Rates:**\n`;
                for (const [item, rate] of Object.entries(inflationManager.config.items)) {
                    desc += `- ${item}: x${rate}\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('Current Inflation Rates')
                .setDescription(desc)
                .setColor('#FFD700');
            return message.reply({ embeds: [embed] });
        }

        if (subCommand === 'reset') {
            inflationManager.config = {
                global: 1.0,
                shops: {},
                items: {}
            };
            inflationManager.save();
            inflationManager.applyAll(allItemsCache);
            return message.reply('Inflation configuration has been completely reset to default (1.0).');
        }

        if (subCommand === 'global') {
            const rate = parseFloat(args[1]);
            if (isNaN(rate) || rate < 0) return message.reply('Please provide a valid multiplier (e.g., 1.5).');
            inflationManager.config.global = rate;
            inflationManager.save();
            inflationManager.applyAll(allItemsCache);
            return message.reply(`Global inflation rate set to **x${rate}**.`);
        }

        if (subCommand === 'shop') {
            const shopName = args[1];
            const rateStr = args[2];

            if (!shopName) return message.reply('Please specify a shop name (e.g., gepora, kimori, fishing, mining).');
            if (rateStr === 'reset' || rateStr === 'clear') {
                delete inflationManager.config.shops[shopName];
                inflationManager.save();
                inflationManager.applyAll(allItemsCache);
                return message.reply(`Removed specific inflation rate for shop **${shopName}**.`);
            }

            const rate = parseFloat(rateStr);
            if (isNaN(rate) || rate < 0) return message.reply('Please provide a valid multiplier (e.g., 1.5) or type "reset" to clear.');

            inflationManager.config.shops[shopName] = rate;
            inflationManager.save();
            inflationManager.applyAll(allItemsCache);
            return message.reply(`Inflation rate for shop **${shopName}** set to **x${rate}**.`);
        }

        if (subCommand === 'item') {
            const itemId = args[1];
            const rateStr = args[2];

            if (!itemId) return message.reply('Please specify an item ID (e.g., diamond).');
            if (rateStr === 'reset' || rateStr === 'clear') {
                delete inflationManager.config.items[itemId];
                inflationManager.save();
                inflationManager.applyAll(allItemsCache);
                return message.reply(`Removed specific inflation rate for item **${itemId}**.`);
            }

            const rate = parseFloat(rateStr);
            if (isNaN(rate) || rate < 0) return message.reply('Please provide a valid multiplier (e.g., 1.5) or type "reset" to clear.');

            inflationManager.config.items[itemId] = rate;
            inflationManager.save();
            inflationManager.applyAll(allItemsCache);
            return message.reply(`Inflation rate for item **${itemId}** set to **x${rate}**.`);
        }

        return message.reply(`Invalid sub-command. Usage: \`${this.usage}\``);
    }
};
