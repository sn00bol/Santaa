const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { resolveShopItemsPath, sortShopItems, getShopItemCost } = require('../../commands/Utils/shopUtils');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');
const { isVisibleItem } = require('../../commands/Utils/itemVisibility');
const dbmanager = require('../../../database/dbmanager');
const rpgmanager = require('../../../database/rpgmanager');

const SHOP_ACTIONS = {
    BACK_TO_FISH: 'fish_shop_back_to_fish',
    BACK_TO_CATEGORIES: 'fish_shop_back_to_categories',
    BACK_TO_CATEGORY_LIST: 'fish_shop_back_to_category_list',
    BUY_PREFIX: 'fish_buy_',
    CATEGORY_PREFIX: 'fish_shop_category_',
    ITEM_SELECT: 'fish_shop_select',
};

const CATEGORY_MAP = {
    bait: { label: 'Bait', folder: 'bait' },
    buckets: { label: 'Buckets', folder: 'bucket' },
    rods: { label: 'Fishing rods', folder: 'fishingRod' },
};

const buildFishShopContainer = (state) => {
    const header = new TextDisplayBuilder()
        .setContent('# 🛒 Fishing Shop\n> Choose a category to browse fishing items.');

    const buttons = Object.entries(CATEGORY_MAP).map(([key, category]) =>
        new ButtonBuilder()
            .setCustomId(`${SHOP_ACTIONS.CATEGORY_PREFIX}${key}`)
            .setLabel(category.label)
            .setStyle(ButtonStyle.Primary)
    );

    const categoryRow = new ActionRowBuilder().addComponents(buttons);
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment')
            .setLabel('Equipment')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(SHOP_ACTIONS.BACK_TO_FISH)
            .setLabel(state.returnToFishing ? 'Back to fishing menu' : 'Refresh categories')
            .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(header)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(categoryRow)
        .addActionRowComponents(navRow);
};

const createFishShopState = async (userId, shopType = 'fish', returnToFishing = false) => {
    return {
        userId,
        shopType,
        category: null,
        items: new Map(),
        selectedItem: null,
        returnToFishing,
    };
};

const loadFishShopCategoryItems = (shopType, categoryKey) => {
    const category = CATEGORY_MAP[categoryKey];
    if (!category) return new Map();

    const shopRoot = resolveShopItemsPath(shopType);
    const categoryPath = path.join(shopRoot, category.folder);
    const items = new Map();

    if (!fs.existsSync(categoryPath)) {
        return items;
    }

    const traverse = (dir) => {
        for (const entry of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, entry);
            const stat = fs.lstatSync(fullPath);
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (entry.endsWith('.js')) {
                try {
                    const item = require(fullPath);
                    if (!item || !item.id) continue;
                    if (!isVisibleItem(item)) continue;
                    items.set(item.id, item);
                } catch {
                    // ignore invalid item definitions
                }
            }
        }
    };

    traverse(categoryPath);
    return items;
};

const buildFishShopCategoryListContainer = (state) => {
    const category = CATEGORY_MAP[state.category] || { label: 'Unknown' };
    const header = new TextDisplayBuilder()
        .setContent(`# 🛒 ${category.label} Shop\n> Select an item to view details before buying.`);

    const options = [
        {
            label: 'Back to categories',
            value: 'back',
            description: 'Return to category selection',
        },
        ...sortShopItems(state.items).map((item) => ({
            label: item.name,
            value: item.id,
            description: `Cost: ${getShopItemCost(item)} ${CURRENCY_EMOJI}`,
        })),
    ];

    const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(SHOP_ACTIONS.ITEM_SELECT)
            .setPlaceholder('Select an item to view and buy')
            .addOptions(options)
    );

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(SHOP_ACTIONS.BACK_TO_FISH)
            .setLabel(state.returnToFishing ? 'Back to fishing menu' : 'Back to categories')
            .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(header)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(menuRow)
        .addActionRowComponents(navRow);
};

const buildFishShopItemContainer = async (state, itemId) => {
    const item = state.items.get(itemId);
    if (!item) {
        return buildFishShopCategoryListContainer(state);
    }

    const cost = getShopItemCost(item);
    const titleLine = `**${item.name}**`;
    const description = item.desc || 'No description available.';
    const itemText = new TextDisplayBuilder()
        .setContent(`${titleLine}\n${description}\n\nCost: ${cost} ${CURRENCY_EMOJI}\nID: \`${item.id}\`\n`);

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${SHOP_ACTIONS.BUY_PREFIX}${item.id}`)
            .setLabel(`Buy for ${cost} ${CURRENCY_EMOJI}`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('fish_equipment')
            .setLabel('Equipment')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(SHOP_ACTIONS.BACK_TO_CATEGORY_LIST)
            .setLabel('Back to category')
            .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(itemText)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(actionRow);
};

const handleFishShopInteraction = async (interaction, state) => {
    if (interaction.isButton()) {
        if (interaction.customId === SHOP_ACTIONS.BACK_TO_FISH) {
            if (state.returnToFishing) {
                return { handled: true, action: 'back' };
            }
            await interaction.update({
                content: null,
                embeds: [],
                components: [buildFishShopContainer(state)],
                flags: [MessageFlags.IsComponentsV2],
            });
            return { handled: true };
        }

        if (interaction.customId === SHOP_ACTIONS.BACK_TO_CATEGORY_LIST) {
            state.selectedItem = null;
            await interaction.update({
                content: null,
                embeds: [],
                components: [buildFishShopCategoryListContainer(state)],
                flags: [MessageFlags.IsComponentsV2],
            });
            return { handled: true };
        }

        if (interaction.customId === 'fish_equipment') {
            return { handled: true, action: 'equipment' };
        }

        if (interaction.customId.startsWith(SHOP_ACTIONS.CATEGORY_PREFIX)) {
            const categoryKey = interaction.customId.slice(SHOP_ACTIONS.CATEGORY_PREFIX.length);
            state.category = categoryKey;
            state.items = loadFishShopCategoryItems(state.shopType, categoryKey);
            state.selectedItem = null;
            await interaction.update({
                content: null,
                embeds: [],
                components: [buildFishShopCategoryListContainer(state)],
                flags: [MessageFlags.IsComponentsV2],
            });
            return { handled: true };
        }

        if (interaction.customId.startsWith(SHOP_ACTIONS.BUY_PREFIX)) {
            const itemId = interaction.customId.slice(SHOP_ACTIONS.BUY_PREFIX.length);
            const item = state.items.get(itemId);
            if (!item) {
                await interaction.reply({ content: 'Item not found.', ephemeral: true });
                return { handled: true };
            }

            const userDb = await dbmanager.getUser(interaction.user.id);
            const cost = getShopItemCost(item);
            if (userDb.balance < cost) {
                await interaction.reply({ content: `You do not have enough ${CURRENCY_EMOJI} to buy this item.`, ephemeral: true });
                return { handled: true };
            }

            await dbmanager.removeMoney(interaction.user.id, cost);
            await rpgmanager.addItem(interaction.user.id, item.id, item.name);
            await interaction.reply({ content: `You bought **${item.name}** for ${cost} ${CURRENCY_EMOJI}.`, ephemeral: true });
            return { handled: true };
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === SHOP_ACTIONS.ITEM_SELECT) {
        const selectedItem = interaction.values[0];
        if (selectedItem === 'back') {
            state.category = null;
            state.items = new Map();
            state.selectedItem = null;
            await interaction.update({
                content: null,
                embeds: [],
                components: [buildFishShopContainer(state)],
                flags: [MessageFlags.IsComponentsV2],
            });
            return { handled: true };
        }

        state.selectedItem = selectedItem;
        await interaction.update({
            content: null,
            embeds: [],
            components: [await buildFishShopItemContainer(state, selectedItem)],
            flags: [MessageFlags.IsComponentsV2],
        });
        return { handled: true };
    }

    return { handled: false };
};

module.exports = {
    name: 'fishshop',
    aliases: ['fshop', 'fishsh'],
    description: 'Open the fishing shop interface',
    category: 'mie',
    usage: 'Zfishshop',
    show: false,
    async execute(message, args) {
        const userId = message.author.id;
        const state = await createFishShopState(userId, 'fish', false);
        const response = await message.reply({
            content: null,
            embeds: [],
            components: [buildFishShopContainer(state)],
            flags: [MessageFlags.IsComponentsV2]
        });

        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 120000
        });

        collector.on('collect', async (interaction) => {
            collector.resetTimer();
            const result = await handleFishShopInteraction(interaction, state);
            if (result.handled) {
                if (result.action === 'back') {
                    await interaction.update({
                        content: null,
                        embeds: [],
                        components: [buildFishShopContainer(state)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                }
                if (result.action === 'equipment') {
                    // Standalone shop: just go back to categories since there's no fishing session
                    state.selectedItem = null;
                    state.category = null;
                    state.items = new Map();
                    await interaction.update({
                        content: null,
                        embeds: [],
                        components: [buildFishShopContainer(state)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                }
                return;
            }
            await interaction.deferUpdate();
        });

        collector.on('end', () => {
            if (!response.editable || !response.components) return;
            const disabledRows = response.components.map(row => {
                return new ActionRowBuilder().addComponents(
                    row.components.map(component => {
                        if (component.setDisabled) return component.setDisabled(true);
                        return component;
                    })
                );
            });
            response.edit({ components: disabledRows }).catch(() => {});
        });
    },
    buildFishShopContainer,
    buildFishShopItemContainer,
    createFishShopState,
    handleFishShopInteraction,
};
