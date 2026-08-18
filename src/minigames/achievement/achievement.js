const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const achievementManager = require('./achievementManager');
const achievementUI = require('./achievementUI');
const rpgmanager = require('../../../database/rpgmanager');

module.exports = {
    name: 'achievement',
    description: 'View your achievements!',
    category: 'mie',
    usage: 'Zachievement',
    async execute(message, args) {
        const userId = message.author.id;
        const stats = await rpgmanager.getStats(userId);
        const profile = stats.fishing_profile || {}; 
        
        const categories = achievementManager.getCategories();
        const achievements = achievementManager.getAchievements();
        
        let state = { 
            category: categories[0] || 'Fishing', 
            subCategory: null,
            page: 0 
        };
        
        const container = achievementUI.buildMain(profile, categories, achievements, state);
        const mainMsg = await message.reply({ components: [container], flags: [MessageFlags.IsComponentsV2] });

        const collector = mainMsg.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 600000
        });

        collector.on('collect', async i => {
            if (i.customId === 'ach_category_select') {
                state.category = i.values[0];
                state.subCategory = null;
                state.page = 0;
                const updatedContainer = achievementUI.buildMain(profile, categories, achievements, state);
                await i.update({
                    components: [updatedContainer]
                });
            } else if (i.customId === 'ach_sub_category_select') {
                const selectedSub = i.values[0];
                state.subCategory = selectedSub === 'all' ? null : selectedSub;
                state.page = 0;
                const updatedContainer = achievementUI.buildMain(profile, categories, achievements, state);
                await i.update({
                    components: [updatedContainer]
                });
            } else if (['first', 'prev', 'next', 'last'].includes(i.customId)) {
                let filtered = achievements.filter(a => a.category === state.category);
                if (state.category === 'Fishing' && state.subCategory) {
                    filtered = filtered.filter(a => a.subCategory === state.subCategory);
                }
                
                const pageSize = 10;
                const maxPages = Math.max(1, Math.ceil(filtered.length / pageSize));
                
                if (i.customId === 'first') state.page = 0;
                else if (i.customId === 'prev') state.page = Math.max(0, state.page - 1);
                else if (i.customId === 'next') state.page = Math.min(maxPages - 1, state.page + 1);
                else if (i.customId === 'last') state.page = maxPages - 1;

                const updatedContainer = achievementUI.buildMain(profile, categories, achievements, state);
                await i.update({
                    components: [updatedContainer]
                });
            } else if (i.customId === 'ach_back') {
                await i.update({
                    content: 'Returned to main menu.',
                    components: []
                });
            }
        });
    }
};

