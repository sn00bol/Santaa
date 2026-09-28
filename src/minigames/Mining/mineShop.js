const fs = require('fs');
const path = require('path');
const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	SeparatorBuilder,
	StringSelectMenuBuilder,
	TextDisplayBuilder,
} = require('discord.js');
const { getShopItemCost, sortShopItems } = require('../../commands/Utils/shopUtils');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');
const formatNumber = require('../../commands/Utils/formatNumber');

const SHOP_ROOT = path.join(__dirname, '..', '..', 'items', 'mine', 'mshop');

const CATEGORIES = {
	backpack: { label: 'Backpacks', folder: 'backpack' },
	helmet: { label: 'Helmets', folder: 'helmet' },
	pickaxe: { label: 'Pickaxes', folder: 'pickaxe' },
};

function loadCategoryItems(categoryKey, includeHidden = false) {
	const category = CATEGORIES[categoryKey];
	if (!category) return new Map();

	const categoryPath = path.join(SHOP_ROOT, category.folder);
	const items = new Map();
	if (!fs.existsSync(categoryPath)) return items;

	const traverse = directory => {
		for (const entry of fs.readdirSync(directory)) {
			const fullPath = path.join(directory, entry);
			if (fs.lstatSync(fullPath).isDirectory()) {
				traverse(fullPath);
				continue;
			}
			if (!entry.endsWith('.js')) continue;

			try {
				const item = require(fullPath);
				if (!item?.id || !item.name || (!includeHidden && item.show === false)) continue;
				items.set(item.id, item);
			} catch (error) {
				console.error(`Failed to load Mining shop item ${fullPath}:`, error);
			}
		}
	};

	traverse(categoryPath);
	return items;
}

function buildCategoriesContainer({ returnToEquipment = false } = {}) {
	const categoryRow = new ActionRowBuilder().addComponents(
		...Object.entries(CATEGORIES).map(([key, category]) => new ButtonBuilder()
			.setCustomId(`mine_shop_category_${key}`)
			.setLabel(category.label)
			.setStyle(ButtonStyle.Primary))
	);
	const navigationRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(returnToEquipment ? 'mine_shop_equipment_back' : 'mine_shop_back')
			.setLabel(returnToEquipment ? 'Back to Equipment' : 'Back to Mining')
			.setStyle(ButtonStyle.Secondary)
	);

	return new ContainerBuilder()
		.addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🛒 Mining Shop\n> Browse gear for your next run.'))
		.addSeparatorComponents(new SeparatorBuilder())
		.addActionRowComponents(categoryRow)
		.addActionRowComponents(navigationRow);
}

function buildCategoryContainer(categoryKey, items, { returnToEquipment = false } = {}) {
	const category = CATEGORIES[categoryKey];
	if (!category) return buildCategoriesContainer();

	const sortedItems = sortShopItems(items);
	const container = new ContainerBuilder()
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🛒 ${category.label} Shop\n> Select an item to inspect it.`))
		.addSeparatorComponents(new SeparatorBuilder());

	if (sortedItems.length) {
		const options = [
			{
				label: 'Back to categories',
				value: 'back',
				description: 'Return to category selection',
			},
			...sortedItems.slice(0, 24).map(item => ({
				label: String(item.name).slice(0, 100),
				value: item.id,
				description: `Cost: ${formatNumber(getShopItemCost(item))} ${CURRENCY_EMOJI}`.slice(0, 100),
			})),
		];
		container.addActionRowComponents(new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('mine_shop_item_select')
				.setPlaceholder('Choose gear')
				.addOptions(options)
		));
	} else {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('*No items are available in this category yet.*'));
	}

	return container.addActionRowComponents(new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('mine_shop_categories')
			.setLabel('Categories')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(returnToEquipment ? 'mine_shop_equipment_back' : 'mine_shop_back')
			.setLabel(returnToEquipment ? 'Back to Equipment' : 'Back to mining menu')
			.setStyle(ButtonStyle.Secondary)
	));
}

function buildItemContainer(categoryKey, item, { returnToEquipment = false } = {}) {
	if (!item) return buildCategoryContainer(categoryKey, loadCategoryItems(categoryKey), { returnToEquipment });

	const cost = getShopItemCost(item);
	const capacityLine = item.capacity ? `\n**Capacity:** ${formatNumber(item.capacity)} slots` : '';
	const statsLine = typeof item.stats === 'string' ? `\n\n${item.stats}` : '';
	const container = new ContainerBuilder()
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(
			`# ${item.name}\n${item.desc || 'No description available.'}${capacityLine}${statsLine}\n\n**Cost**\n${formatNumber(cost)} ${CURRENCY_EMOJI}\n-# ID: \`${item.id}\``
		))
		.addSeparatorComponents(new SeparatorBuilder())
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`mine_shop_buy_${item.id}`)
				.setLabel(`Buy · ${formatNumber(cost)} ${CURRENCY_EMOJI}`)
				.setStyle(ButtonStyle.Success)
				.setDisabled(cost <= 0),
			new ButtonBuilder()
				.setCustomId(`mine_shop_category_back_${categoryKey}`)
				.setLabel('Back to items')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(returnToEquipment ? 'mine_shop_equipment_back' : 'mine_shop_back')
				.setLabel(returnToEquipment ? 'Equipment' : 'Mining menu')
				.setStyle(ButtonStyle.Secondary)
		));

	return container;
}

module.exports = {
	CATEGORIES,
	loadCategoryItems,
	buildCategoriesContainer,
	buildCategoryContainer,
	buildItemContainer,
};
