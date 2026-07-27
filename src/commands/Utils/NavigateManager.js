const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const getOptions = () => {
    // Help.js
    const options = [
        { label: 'All', value: 'all', description: 'View all available commands' },
        { label: 'General', value: 'gnr' },
        { label: 'Economic', value: 'eco' },
        { label: 'Utils', value: 'utl' },
        { label: 'Minigames', value: 'mie' },
    ];
    options.push({ label: 'Unknown', value: 'gau3' });
    return options;
};

// Select Options
const getMenuRow = (customId, customOptions = null, maxValues = 1, minValues = 1) => {
    const options = customOptions || getOptions();
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder('Select a category')
            .setMinValues(minValues)
            .setMaxValues(maxValues)
            .addOptions(options)
    );
};

const getPaginationRow = (currentPage, totalPages) => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('first')
            .setEmoji('1502938730648961135') // change this to your custom emoji
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('prev')
            .setEmoji('1502935282272436306')  // change this to your custom emoji
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('next')
            .setEmoji('1502935300677046412')  // change this to your custom emoji
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages - 1 || totalPages === 0),
        new ButtonBuilder()
            .setCustomId('last')
            .setEmoji('1502938713540530226')  // change this to your custom emoji
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages - 1 || totalPages === 0)
    );
};

const applySelectMenuDefaults = (options, selectedValues) => {
    if (!selectedValues) return options;
    const selectedArray = Array.isArray(selectedValues) ? selectedValues : [selectedValues];
    return options.map(opt => ({
        ...opt,
        default: selectedArray.includes(opt.value)
    }));
};

module.exports = { getOptions, getMenuRow, getPaginationRow, applySelectMenuDefaults };
