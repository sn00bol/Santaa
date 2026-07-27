const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const packageInfo = require('../../../package.json');
require('dotenv').config();
const { getMenuRow, getPaginationRow, getOptions, applySelectMenuDefaults } = require('../Utils/NavigateManager');

module.exports = {
    name: 'help',
    description: 'Display help commands and bot information',
    category: 'gnr',
    usage: 'Zhelp `command`',
    async execute(message, args) {
        const { commands } = message.client;

        if (args && args.length > 0) {
            const cmdName = args[0].toLowerCase();
            const command = commands.get(cmdName);
            if (!command) {
                const similar = commands.find(c => c.name.includes(cmdName) || cmdName.includes(c.name));
                if (similar) {
                    return message.reply({ content: `Not found command, do you mean \`${similar.name}\`?` });
                }
                return message.reply({ content: `Not found command, do you mean \`${similar.name}\`?` });
            }
            const cmdEmbed = new EmbedBuilder()
                .setTitle(`**${command.name}**`)
                .setColor('Blue')
                .addFields(
                    { name: 'Description', value: command.description || 'No description', inline: false },
                    { name: 'Usage', value: command.usage ? `\`${command.usage}\`` : `\`Z${command.name}\``, inline: false }
                );
            let notes = command.notes || '';
            if (['sell', 'trade'].includes(command.name)) {
                if (notes) notes += '\n\n';
                notes += '⚠️ **Important Notes:** Can only sell items that are sellable, and trade items that are tradeable.';
            }
            if (notes) {
                cmdEmbed.addFields({ name: 'Important Notes', value: notes, inline: false });
            }
            return message.channel.send({ embeds: [cmdEmbed] });
        }

        let currentPage = 0;
        const itemsPerPage = 5;
        let currentCategories = [];
        const isOwner = message.author.id === process.env.OWNER_ID;

        // Filter commands based on category and ownership
        const getFilteredCmds = (categories) => {
            return commands.filter(cmd => {
                if (!isOwner && cmd.category === 'owner') return false;
                if (categories.includes('all')) return true;
                return categories.includes(cmd.category);
            });
        };

        // Help embed
        const helpEmbed = new EmbedBuilder()
            .setAuthor({ name: 'HELP MENU', iconURL: message.client.user.displayAvatarURL() })
            .addFields({ name: '', value: 'To get more information about a command, use `Zhelp <command>`', inline: false })
            .setFooter({ text: `v${packageInfo.version} | ${packageInfo.author}` });

        // Menu row — show Owner option only for bot owner
        const menuOptions = isOwner
            ? [...getOptions(), { label: 'Owner', value: 'owner', emoji: '👑' }]
            : getOptions();
        const maxVals = Math.max(1, menuOptions.length - 1);
        const menuRow = getMenuRow('help_slt', menuOptions, maxVals, 0);

        let currentMenuRow = menuRow;

        const response = await message.channel.send({ embeds: [helpEmbed], components: [currentMenuRow] });

        // Component collector for menu and pagination
        const collector = response.createMessageComponentCollector({ time: 60000 });

        // Handle menu selection and pagination
        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu!', ephemeral: true });

            // Handle menu selection and pagination
            if (i.isStringSelectMenu()) {
                const newSelection = i.values;

                if (newSelection.length === 0) {
                    currentCategories = ['all'];
                } else {
                    const exclusives = ['all', 'gau3'];
                    let newlySelectedExclusive = null;
                    for (const exc of exclusives) {
                        if (newSelection.includes(exc) && !currentCategories.includes(exc)) {
                            newlySelectedExclusive = exc;
                            break;
                        }
                    }

                    if (newlySelectedExclusive) {
                        currentCategories = [newlySelectedExclusive];
                    } else {
                        const hasOthers = newSelection.some(v => !exclusives.includes(v));
                        if (hasOthers) {
                            currentCategories = newSelection.filter(v => !exclusives.includes(v));
                        } else {
                            currentCategories = newSelection;
                        }
                    }
                }

                if (currentCategories.length === 0) {
                    currentCategories = ['all'];
                }
                currentPage = 0;
            } else if (i.isButton()) {
                switch (i.customId) {
                    // Pagination buttons
                    case 'prev': currentPage--; break;
                    case 'next': currentPage++; break;
                    case 'first': currentPage = 0; break;
                    case 'last': {
                        // Calculate total pages based on current category
                        const totalItems = getFilteredCmds(currentCategories).size;
                        currentPage = Math.max(0, Math.ceil(totalItems / itemsPerPage) - 1); // Set to last page index
                        break;
                    }
                }
            }

            // Rebuild the menu row to retain the selected visual state
            const updatedOptions = applySelectMenuDefaults(menuOptions, currentCategories);
            currentMenuRow = getMenuRow('help_slt', updatedOptions, maxVals, 0);

            // dont care ts
            if (currentCategories.includes('gau3')) {
                return i.update({
                    embeds: [new EmbedBuilder().setTitle('❓ Hidden Area').setDescription('You bastard! You just into owner\'s bot bedroom 🤨')],
                    components: [currentMenuRow]
                });
            }

            // Get category commands and paginate
            const filteredArray = Array.from(getFilteredCmds(currentCategories).values());
            const totalPages = Math.ceil(filteredArray.length / itemsPerPage);

            // Pagination logic
            const start = currentPage * itemsPerPage;
            const pagedCmds = filteredArray.slice(start, start + itemsPerPage);

            // Format command list
            const displayContent = pagedCmds.map(cmd => {
                const prefix = cmd.folder === 'adminCMD' ? '🛡️ ' : '';
                return `**${prefix}${cmd.name.toUpperCase()}**\n${cmd.description}`; // Format each command with name and description
            }).join('\n\n') || 'No commands in this category.';

            // Page embed
            const pageEmbed = new EmbedBuilder()
                .setTitle(`Commands\n` +
                    `> If you found bug then dm to meh32_.!`
                )
                .setDescription(displayContent) // Set description to command list
                .setFooter({ text: `Page ${currentPage + 1} of ${totalPages || 1}` });

            // Button state
            const btnRow = getPaginationRow(currentPage, totalPages);

            // Menu page
            const components = filteredArray.length > itemsPerPage ? [currentMenuRow, btnRow] : [currentMenuRow];

            await i.update({ embeds: [pageEmbed], components: components });
        });

        collector.on('end', () => {
            currentMenuRow.components[0].setDisabled(true);
            response.edit({ components: [currentMenuRow] }).catch(() => { });
        });
    },
};