const { getCommandUser, replyToCommand, sendCommandMessage } = require('../Utils/commandInteraction');
const { EmbedBuilder } = require('discord.js');
const inflationManager = require('../Utils/InflationManager');
const { allItemsCache } = require('../Utils/StatsCalculator');
const { isOwner } = require('../Utils/permission');
const formatNumber = require('../Utils/formatNumber');

module.exports = {
    name: 'inflation',
    aliases: ['inf'],
    description: 'Manage inflation rates globally, per shop, or per item (Owner only)',
    category: 'owner',
    usage: 'Zinflation <global|shop|item|reset|view> [name] [rate]',
    DMS: false,
    slashOptions: [
        { name: 'action', description: 'Inflation action', type: 'string', required: true },
        { name: 'name', description: 'Shop or item name', type: 'string', required: false },
        { name: 'rate', description: 'Inflation multiplier', type: 'number', required: false },
    ],
    async execute(message, args = []) {
        if (!isOwner(getCommandUser(message).id)) {
            return replyToCommand(message, { content: 'Only bot owners can use this command.', ephemeral: true });
        }

        const isSlash = message.isChatInputCommand?.();
        const actionArg = isSlash ? message.options.getString('action') : args[0];
        const nameArg = isSlash ? message.options.getString('name') : args[1];
        const rateArg = isSlash ? message.options.getNumber('rate') : args[2];
        const subCommand = actionArg ? actionArg.toLowerCase() : 'view';

        if (subCommand === 'view') {
            let desc = `**Global Rate:** x${formatNumber(inflationManager.config.global)}\n\n`;

            if (Object.keys(inflationManager.config.shops).length > 0) {
                desc += `**Shop Rates:**\n`;
                for (const [shop, rate] of Object.entries(inflationManager.config.shops)) {
                    desc += `- ${shop}: x${formatNumber(rate)}\n`;
                }
                desc += '\n';
            }

            if (Object.keys(inflationManager.config.items).length > 0) {
                desc += `**Item Rates:**\n`;
                for (const [item, rate] of Object.entries(inflationManager.config.items)) {
                    desc += `- ${item}: x${formatNumber(rate)}\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('Current Inflation Rates')
                .setDescription(desc)
                .setColor('#FFD700');
            return replyToCommand(message, { embeds: [embed] });
        }

        if (subCommand === 'reset') {
            inflationManager.config = inflationManager.getDefaultConfig();
            inflationManager.save();
            inflationManager.applyAll(allItemsCache);
            return replyToCommand(message, 'Inflation configuration has been completely reset to default (1.0).');
        }

        if (subCommand === 'global') {
            const rate = parseFloat(isSlash ? rateArg : nameArg);
            if (isNaN(rate) || rate < 0) return replyToCommand(message, 'Please provide a valid multiplier (e.g., 1.5).');
            inflationManager.config.global = rate;
            inflationManager.save();
            inflationManager.applyAll(allItemsCache);
            return replyToCommand(message, `Global inflation rate set to **x${formatNumber(rate)}**.`);
        }

        if (subCommand === 'shop') {
            const shopName = nameArg;
            const rateStr = rateArg;

            if (!shopName) return replyToCommand(message, 'Please specify a shop name (e.g., gepora, kimori, fishing, mining).');
            if (rateStr === 'reset' || rateStr === 'clear') {
                delete inflationManager.config.shops[shopName];
                inflationManager.save();
                inflationManager.applyAll(allItemsCache);
                return replyToCommand(message, `Removed specific inflation rate for shop **${shopName}**.`);
            }

            const rate = parseFloat(rateStr);
            if (isNaN(rate) || rate < 0) return replyToCommand(message, 'Please provide a valid multiplier (e.g., 1.5) or type "reset" to clear.');

            inflationManager.config.shops[shopName] = rate;
            inflationManager.save();
            inflationManager.applyAll(allItemsCache);
            return replyToCommand(message, `Inflation rate for shop **${shopName}** set to **x${formatNumber(rate)}**.`);
        }

        if (subCommand === 'item') {
            const itemId = nameArg;
            const rateStr = rateArg;

            if (!itemId) return replyToCommand(message, 'Please specify an item ID (e.g., diamond).');
            if (rateStr === 'reset' || rateStr === 'clear') {
                delete inflationManager.config.items[itemId];
                inflationManager.save();
                inflationManager.applyAll(allItemsCache);
                return replyToCommand(message, `Removed specific inflation rate for item **${itemId}**.`);
            }

            const rate = parseFloat(rateStr);
            if (isNaN(rate) || rate < 0) return replyToCommand(message, 'Please provide a valid multiplier (e.g., 1.5) or type "reset" to clear.');

            inflationManager.config.items[itemId] = rate;
            inflationManager.save();
            inflationManager.applyAll(allItemsCache);
            return replyToCommand(message, `Inflation rate for item **${itemId}** set to **x${formatNumber(rate)}**.`);
        }

        return replyToCommand(message, `Invalid sub-command. Usage: \`${this.usage}\``);
    }
};
