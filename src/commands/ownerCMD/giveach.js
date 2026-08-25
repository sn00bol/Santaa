const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { isOwner } = require('../Utils/permission');
const achievementManager = require('../../minigames/achievement/achievementManager');
const rpgmanager = require('../../../database/rpgmanager');

module.exports = {
    name: 'giveach',
    description: 'Grant achievements to a user (Owner only)',
    category: 'owner',
    usage: 'Zgiveach `@user` [achievement file name]',
    async execute(message, args) {
        const { author } = message;

        if (!isOwner(author.id)) {
            return message.reply('This command is for bot owners only.');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply(`Please mention a user. Usage: ${usage}`);
        }

        const allAchievements = achievementManager.getAchievements();
        if (allAchievements.length === 0) {
            return message.reply('No achievements loaded.');
        }

        // If specific achievement ID provided → grant directly
        const achIdArg = args.filter(a => !a.startsWith('<@')).join('');
        if (achIdArg) {
            const ach = allAchievements.find(a => a.id === achIdArg);
            if (!ach) {
                return message.reply(`Achievement \`${achIdArg}\` not found.\nUse \`Zgiveach @user\` (no ID) to see a list of all achievements.`);
            }

            const granted = await achievementManager.checkAndGrant(targetUser.id, ach.id);
            const embed = new EmbedBuilder()
                .setTitle(granted ? 'Achievement Granted!' : 'Already Unlocked')
                .setDescription(granted
                    ? `Successfully granted **${ach.name}** to ${targetUser}.`
                    : `${targetUser} already has **${ach.name}**.`)
                .addFields({ name: 'Achievement ID', value: `\`${ach.id}\``, inline: true })
                .setColor(granted ? 0x57F287 : 0xFEE75C)
                .setTimestamp();
            return message.channel.send({ embeds: [embed] });
        }

        // No ID → show paginated select menu browser
        const ITEMS_PER_PAGE = 25;
        const categories = [...new Set(allAchievements.map(a => a.category))].sort();
        let selectedCategory = categories[0];
        let page = 0;

        const getFiltered = () => allAchievements.filter(a => a.category === selectedCategory);

        const buildEmbed = (filtered, pg) => {
            const start = pg * ITEMS_PER_PAGE;
            const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);
            const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
            return new EmbedBuilder()
                .setTitle(`🏆 Grant Achievement — ${targetUser.username}`)
                .setDescription(`Category: **${selectedCategory}** | Page ${pg + 1}/${totalPages}\nSelect an achievement from the dropdown to grant it.`)
                .addFields(pageItems.map(a => ({
                    name: `${a.name}`,
                    value: `\`${a.id}\` — ${a.requirement || '*No description*'}`,
                    inline: false
                })))
                .setColor(0x5865F2)
                .setFooter({ text: `Total: ${filtered.length} achievements in this category` })
                .setTimestamp();
        };

        const buildCategoryRow = () => new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('giveach_category')
                .setPlaceholder('Select category...')
                .addOptions(categories.slice(0, 25).map(cat => ({
                    label: cat,
                    value: cat,
                    default: cat === selectedCategory
                })))
        );

        const buildAchRow = (filtered, pg) => {
            const start = pg * ITEMS_PER_PAGE;
            const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);
            if (pageItems.length === 0) return null;
            return new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('giveach_select')
                    .setPlaceholder('Select achievement to grant...')
                    .addOptions(pageItems.map(a => ({
                        label: a.name.slice(0, 100),
                        value: a.id,
                        description: `ID: ${a.id}`.slice(0, 100)
                    })))
            );
        };

        const buildNavRow = (filtered, pg) => {
            const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveach_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(pg === 0),
                new ButtonBuilder().setCustomId('giveach_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(pg >= totalPages - 1),
                new ButtonBuilder().setCustomId('giveach_all').setLabel('🎁 Grant ALL').setStyle(ButtonStyle.Danger)
            );
        };

        const buildComponents = () => {
            const filtered = getFiltered();
            const comps = [buildCategoryRow()];
            const achRow = buildAchRow(filtered, page);
            if (achRow) comps.push(achRow);
            comps.push(buildNavRow(filtered, page));
            return comps;
        };

        const filtered = getFiltered();
        const response = await message.channel.send({
            embeds: [buildEmbed(filtered, page)],
            components: buildComponents()
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect || ComponentType.Button,
            time: 120_000,
            filter: i => i.user.id === author.id
        });

        collector.on('collect', async i => {
            if (i.customId === 'giveach_category') {
                selectedCategory = i.values[0];
                page = 0;
            } else if (i.customId === 'giveach_select') {
                const achId = i.values[0];
                const granted = await achievementManager.checkAndGrant(targetUser.id, achId);
                const ach = allAchievements.find(a => a.id === achId);
                const resultEmbed = new EmbedBuilder()
                    .setTitle(granted ? '🏆 Granted!' : '⚠️ Already Unlocked')
                    .setDescription(granted
                        ? `Granted **${ach?.name ?? achId}** to ${targetUser}!`
                        : `${targetUser} already has **${ach?.name ?? achId}**.`)
                    .setColor(granted ? 0x57F287 : 0xFEE75C)
                    .setTimestamp();
                await i.reply({ embeds: [resultEmbed], ephemeral: true });
                return; // don't update main panel
            } else if (i.customId === 'giveach_prev') {
                page = Math.max(0, page - 1);
            } else if (i.customId === 'giveach_next') {
                const f = getFiltered();
                page = Math.min(Math.max(0, Math.ceil(f.length / ITEMS_PER_PAGE) - 1), page + 1);
            } else if (i.customId === 'giveach_all') {
                await i.deferUpdate();
                const f = getFiltered();
                let grantedCount = 0;
                for (const ach of f) {
                    const ok = await achievementManager.checkAndGrant(targetUser.id, ach.id);
                    if (ok) grantedCount++;
                }
                const allEmbed = new EmbedBuilder()
                    .setTitle('🎁 Bulk Grant Complete')
                    .setDescription(`Granted **${grantedCount}** new achievement(s) in **${selectedCategory}** to ${targetUser}.\n*(${f.length - grantedCount} were already unlocked)*`)
                    .setColor(0x57F287)
                    .setTimestamp();
                await response.edit({ embeds: [allEmbed], components: [] });
                collector.stop();
                return;
            }

            const newFiltered = getFiltered();
            await i.update({
                embeds: [buildEmbed(newFiltered, page)],
                components: buildComponents()
            });
        });

        collector.on('end', (_, reason) => {
            if (reason === 'time') {
                response.edit({ components: [] }).catch(() => { });
            }
        });
    }
};
