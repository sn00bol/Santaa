const { ActionRowBuilder, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { RARITY_CONFIG, mineralData } = require('./mineCore');
const { getPaginationRow } = require('../../commands/Utils/NavigateManager');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');
const formatNumber = require('../../commands/Utils/formatNumber');

module.exports = {
    name: 'minelist',
    aliases: ['minel', 'minemenu'],
    description: 'Display all mineable minerals categorized by rarity',
    category: 'mie',
    usage: 'Zminelist',
    async execute(message, args) {
        let currentPage = 0;
        const itemsPerPage = 5;
        let currentCategory = 'COMMON';

        const categories = Object.keys(RARITY_CONFIG).map(key => ({
            label: RARITY_CONFIG[key].label,
            value: key
        }));

        const buildMenuRow = (selectedCategory, disabled = false) => {
            const optionsWithDefault = categories.map(option => ({
                ...option,
                default: option.value === selectedCategory
            }));

            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('minelist_menu')
                    .setPlaceholder('Select rarity...')
                    .addOptions(optionsWithDefault)
                    .setDisabled(disabled)
            );
        };

        const generateContainer = (category, page, disabled = false) => {
            const list = [...(mineralData[category] || [])].sort((a, b) => {
                return (a.sell - b.sell) || a.name.localeCompare(b.name);
            });
            const totalPages = Math.ceil(list.length / itemsPerPage) || 1;
            const start = page * itemsPerPage;
            const paged = list.slice(start, start + itemsPerPage);

            const displayContent = paged.map((item, index) => {
                const descText = item.desc ? `\n-# ${item.desc}` : '';
                return `**${formatNumber(start + index + 1)}. ${item.name.toUpperCase()}** — ${formatNumber(item.sell)} ${CURRENCY_EMOJI} ${descText}`;
            }).join('\n\n') || 'No minerals found in this rarity.';

            const rarityLabel = RARITY_CONFIG[category]?.label || category;
            const title = new TextDisplayBuilder()
                .setContent(`# Mineral List (${rarityLabel})`);
            const menuRow = buildMenuRow(category, disabled);
            const content = new TextDisplayBuilder()
                .setContent(`${displayContent}\n\n*Page ${formatNumber(page + 1)} of ${formatNumber(totalPages)}*`);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(title)
                .addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(content)
                .addSeparatorComponents(new SeparatorBuilder())
                .addActionRowComponents(menuRow);

            if (totalPages > 1) {
                container.addSeparatorComponents(new SeparatorBuilder());
                const paginationRow = getPaginationRow(page, totalPages);
                if (disabled) {
                    paginationRow.components.forEach(button => button.setDisabled(true));
                }
                container.addActionRowComponents(paginationRow);
            }

            return {
                container,
                totalPages
            };
        };

        const initial = generateContainer(currentCategory, currentPage);

        const response = await message.reply({
            components: [initial.container],
            flags: [MessageFlags.IsComponentsV2]
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

            const result = generateContainer(currentCategory, currentPage);

            await i.update({
                components: [result.container],
                flags: [MessageFlags.IsComponentsV2]
            });
        });

        collector.on('end', () => {
            const finalResult = generateContainer(currentCategory, currentPage, true);
            response.edit({ components: [finalResult.container] }).catch(() => { });
        });
    }
};
