const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { RARITY_CONFIG, mineralData } = require('./mineCore');
const { getPaginationRow } = require('../../commands/Utils/NavigateManager');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');

module.exports = {
    name: 'minelist',
    description: 'Display all mineable minerals categorized by rarity',
    category: 'mie',
    usage: 'Zminelist',
    async execute(message, args) {
        let currentPage = 0;
        const itemsPerPage = 5;
        let currentCategory = 'COMMON';

        const categories = Object.keys(RARITY_CONFIG).map(key => ({
            label: RARITY_CONFIG[key].label,
            value: key,
            emoji: RARITY_CONFIG[key].emoji
        }));

        const buildMenuRow = (selectedCategory) => {
            const optionsWithDefault = categories.map(option => ({
                ...option,
                default: option.value === selectedCategory
            }));

            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('minelist_menu')
                    .setPlaceholder('Select a rarity to view minerals...')
                    .addOptions(optionsWithDefault)
            );
        };
        const resolveColor = (category) => {
            const emoji = RARITY_CONFIG[category]?.color;
            if (emoji === '⚪') return 0x99AAB5;
            if (emoji === '🟢') return 0x57F287;
            if (emoji === '🟣') return 0x9B59B6;
            if (emoji === '🔵') return 0x5865F2;
            if (emoji === '🟡') return 0xFEE75C;
            if (emoji === '🔴') return 0xED4245;
            return 0x99AAB5;
        };

        const generateEmbed = (category, page) => {
            const list = [...(mineralData[category] || [])].sort((a, b) => {
                return (a.sell - b.sell) || a.name.localeCompare(b.name);
            });
            const totalPages = Math.ceil(list.length / itemsPerPage) || 1;
            const start = page * itemsPerPage;
            const paged = list.slice(start, start + itemsPerPage);

            const displayContent = paged.map((item, index) => {
                const descText = item.desc ? `\n-# ${item.desc}` : '';
                return `**${start + index + 1}. ${item.name.toUpperCase()}** — ${item.sell} ${CURRENCY_EMOJI} ${descText}`;
            }).join('\n\n') || 'No minerals found in this rarity.';

            const rarityLabel = RARITY_CONFIG[category]?.label || category;
            const rarityEmoji = RARITY_CONFIG[category]?.emoji || '';

            return {
                embed: new EmbedBuilder()
                    .setTitle(`${rarityEmoji} Mineral List (${rarityLabel})`)
                    .setDescription(displayContent)
                    .setColor(resolveColor(category))
                    .setFooter({ text: `Page ${page + 1} of ${totalPages}` }),
                totalPages
            };
        };

        const initial = generateEmbed(currentCategory, currentPage);
        let currentMenuRow = buildMenuRow(currentCategory);

        const response = await message.reply({
            embeds: [initial.embed],
            components: [currentMenuRow, ...(initial.totalPages > 1 ? [getPaginationRow(currentPage, initial.totalPages)] : [])]
        });

        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu!', ephemeral: true });

            if (i.isStringSelectMenu() && i.customId === 'minelist_menu') {
                currentCategory = i.values[0];
                currentPage = 0;
            } else if (i.isButton()) {
                switch (i.customId) {
                    case 'prev': currentPage--; break;
                    case 'next': currentPage++; break;
                    case 'first': currentPage = 0; break;
                    case 'last': {
                        const totalPages = Math.ceil((mineralData[currentCategory] || []).length / itemsPerPage);
                        currentPage = Math.max(0, totalPages - 1);
                        break;
                    }
                }
            }

            const result = generateEmbed(currentCategory, currentPage);
            currentMenuRow = buildMenuRow(currentCategory);

            const components = [currentMenuRow];
            if (result.totalPages > 1) components.push(getPaginationRow(currentPage, result.totalPages));

            await i.update({ embeds: [result.embed], components });
        });

        collector.on('end', () => {
            if (currentMenuRow && currentMenuRow.components && currentMenuRow.components[0]) {
                currentMenuRow.components[0].setDisabled(true);
                response.edit({ components: [currentMenuRow] }).catch(() => { });
            }
        });
    }
};
