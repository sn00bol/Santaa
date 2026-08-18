const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { getPaginationRow } = require('../../commands/Utils/NavigateManager');

function buildMain(profile, categories, achievements, state = { category: 'Fishing', subCategory: null, page: 0 }) {
    const { category, subCategory, page } = state;
    const pageSize = 5;

    // 1. Header & Sub-Category Selection (Top)
    const headerText = new TextDisplayBuilder()
        .setContent('# 🏆 Achievements\n> Track your milestones and prove your dedication! Each achievement can be earned only once.');

    const topRows = [];
    if (category === 'Fishing') {
        topRows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ach_sub_category_select')
                .setPlaceholder('Filter: Total vs Special')
                .addOptions([
                    { label: 'All Fishing', value: 'all', default: !subCategory },
                    { label: 'Total Catch', value: 'Total', default: subCategory === 'Total' },
                    { label: 'Special Milestones', value: 'Special', default: subCategory === 'Special' },
                ])
        ));
    }

    // 2. Filtered Content
    let filteredAchievements = achievements.filter(a => a.category === category);
    
    if (category === 'Fishing' && subCategory) {
        filteredAchievements = filteredAchievements.filter(a => a.subCategory === subCategory);
    }

    const totalAchievements = filteredAchievements.length;
    const maxPages = Math.max(1, Math.ceil(totalAchievements / pageSize));
    const currentPage = Math.min(Math.max(0, page), maxPages - 1);
    
    const start = currentPage * pageSize;
    const end = start + pageSize;
    const pageAchievements = filteredAchievements.slice(start, end);

    let listText = '';
    if (totalAchievements === 0) {
        listText = `_No achievements available in ${category}${subCategory ? ` (${subCategory})` : ''} yet._`;
    } else {
        listText = pageAchievements.map(a => {
            const isEarned = profile.achievements?.includes(a.id);
            const status = isEarned ? '✅' : '❌';
            const requirement = a.requirement ? `\n**Requirement:** ${a.requirement}` : '';
            const description = a.description ? `\n${a.description}` : '';
            return `${status} **${a.name}**${requirement}${description}`;
        }).join('\n\n');
        
        if (totalAchievements > pageSize) {
            listText += `\n\n_Page ${currentPage + 1} of ${maxPages}_`;
        }
    }

    const contentText = new TextDisplayBuilder().setContent(listText);

    // 3. Bottom Selection (Main Category)
    const categoryOptions = categories.map(cat => ({
        label: cat,
        value: cat,
        default: cat === category
    })).slice(0, 25);

    const categorySelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ach_category_select')
            .setPlaceholder('Switch Category')
            .addOptions(categoryOptions)
    );

    // Final Assembly
    const container = new ContainerBuilder()
        .addTextDisplayComponents(headerText);

    topRows.forEach(row => {
        container.addActionRowComponents(row);
    });

    container.addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(contentText);

    container.addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(categorySelect);

    if (totalAchievements > pageSize) {
        container.addActionRowComponents(getPaginationRow(currentPage, maxPages));
    }

    return container;
}

module.exports = {
    buildMain
};
