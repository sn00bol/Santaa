const { ActionRowBuilder, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { RARITY_CONFIG, getFishData } = require('./fishCore');
const { getPaginationRow } = require('../../commands/Utils/NavigateManager');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');

module.exports = {
    name: 'fishlist',
    aliases: ['fishl', 'fishmenu'],
    description: 'Display all catchable fish categorized by rarity',
    category: 'mie',
    usage: 'Zfishlist',
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
                    .setCustomId('fishlist_menu')
                    .setPlaceholder('Select rarity...')
                    .addOptions(optionsWithDefault)
                    .setDisabled(disabled)
            );
        };

        const generateContainer = (category, page, disabled = false) => {
            const fishData = getFishData();
            const fishList = [...(fishData[category] || [])].sort((a, b) => {
                return (a.sell - b.sell) || a.name.localeCompare(b.name);
            });
            const totalPages = Math.ceil(fishList.length / itemsPerPage) || 1;
            const start = page * itemsPerPage;
            const pagedFish = fishList.slice(start, start + itemsPerPage);

            const displayContent = pagedFish.map((fish, index) => {
                const descText = fish.desc ? `\n-# ${fish.desc}` : '';
                return `**${start + index + 1}. ${fish.name.toUpperCase()}** — ${fish.sell} ${CURRENCY_EMOJI} ${descText}`;
            }).join('\n\n') || 'No fish found in this category.';

            const rarityLabel = RARITY_CONFIG[category]?.label || category;

            const text1 = new TextDisplayBuilder()
                .setContent(`# Fish List (${rarityLabel})`);

            const currentMenuRow = buildMenuRow(category, disabled);

            const text2 = new TextDisplayBuilder()
                .setContent(`${displayContent}\n\n*Page ${page + 1} of ${totalPages}*`);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(text1)
                .addSeparatorComponents(new SeparatorBuilder())
                .addActionRowComponents(currentMenuRow)
                .addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(text2);

            if (totalPages > 1) {
                container.addSeparatorComponents(new SeparatorBuilder());
                const paginationRow = getPaginationRow(page, totalPages);
                if (disabled) {
                    paginationRow.components.forEach(btn => btn.setDisabled(true));
                }
                container.addActionRowComponents(paginationRow);
            }

            return {
                container,
                totalPages
            };
        };

        let initial = generateContainer(currentCategory, currentPage);

        const response = await message.reply({
            components: [initial.container],
            flags: [MessageFlags.IsComponentsV2]
        });

        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu!', ephemeral: true });

            if (i.isStringSelectMenu() && i.customId === 'fishlist_menu') {
                currentCategory = i.values[0];
                currentPage = 0;
            } else if (i.isButton()) {
                switch (i.customId) {
                    case 'prev': currentPage--; break;
                    case 'next': currentPage++; break;
                    case 'first': currentPage = 0; break;
                    case 'last': {
                        const fishData = getFishData();
                        const totalPages = Math.ceil((fishData[currentCategory] || []).length / itemsPerPage);
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
            response.edit({
                components: [finalResult.container]
            }).catch(() => { });
        });
    }
};