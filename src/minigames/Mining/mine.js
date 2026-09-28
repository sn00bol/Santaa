const { ComponentType, MessageFlags } = require('discord.js');
const rpgmanager = require('../../../database/rpgmanager');
const dbmanager = require('../../../database/dbmanager');
const { checkCooldown } = require('../../commands/Utils/Cooldown');
const mineCore = require('./mineCore');
const mineBoard = require('./mineBoard');
const mineUI = require('./mineUI');
const mineShop = require('./mineShop');
const { parseMiningProfile } = require('../../commands/Utils/miningSchema');
const { checkWantedRestrictions } = require('../../commands/Utils/WantedLevel');
const formatNumber = require('../../commands/Utils/formatNumber');
const notifi = require('../../commands/Utils/notifi');
const { getShopItemCost } = require('../../commands/Utils/shopUtils');
const mineBackpack = require('./mineBackpack');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');

const mineCounts = new Map();

module.exports = {
	name: 'mine',
	description: 'Finding gems on the underground with a lot of bombs',
	category: 'mie',
	usage: 'Zmine',
	async execute(message, args) {
		const userId = message.author.id;

		if (mineBoard.activeSessions.has(userId)) {
			return message.reply('You already have an active mining session.');
		}

		const count = mineCounts.get(userId) || 0;
		if (count >= 5) {
			const cooldownTime = checkCooldown(userId, 'mine_exhaustion');
			if (cooldownTime) return message.reply(`You're exhausted! Wait **${cooldownTime}** before mining again.`);
			mineCounts.set(userId, 0);
		}

		const wantedCheck = await checkWantedRestrictions(userId, this.name, message.client, message);
		if (!wantedCheck.allowed) {
			if (!wantedCheck.handled && wantedCheck.message) message.reply(wantedCheck.message);
			return;
		}

		const stats = await rpgmanager.getStats(userId);
		if (!stats || stats.health <= 0) return message.reply('You need HP to mine. Heal before trying again.');

		let profile = parseMiningProfile(stats.mining_profile);
		const itemGroups = {
			pickaxes: Array.from(mineShop.loadCategoryItems('pickaxe', true).values()),
			helmets: Array.from(mineShop.loadCategoryItems('helmet', true).values()),
			backpacks: Array.from(mineShop.loadCategoryItems('backpack', true).values())
		};
		const allEquipmentItems = [...itemGroups.pickaxes, ...itemGroups.helmets, ...itemGroups.backpacks];
		let inventory = await rpgmanager.getInventory(userId);

		if (!profile.initialItemsGranted) {
			const starterItems = ['defaultpickaxe', 'defaulthelmet', 'defaultbackpack'];
			for (const itemId of starterItems) {
				const item = allEquipmentItems.find(equipmentItem => equipmentItem.id === itemId);
				if (item && !inventory.some(inventoryItem => inventoryItem.item_id === itemId)) {
					await rpgmanager.addItem(userId, item.id, item.name);
				}
			}
			profile.initialItemsGranted = true;
			await rpgmanager.updateProgress(userId, { mining_profile: profile });
			inventory = await rpgmanager.getInventory(userId);
		}

		const mainMsg = await message.reply({
			components: [mineUI.buildMain(message.author, stats, inventory, allEquipmentItems, null, profile)],
			flags: [MessageFlags.IsComponentsV2]
		});

		let view = 'main';
		let session = null;
		const shopState = { category: null, items: new Map(), returnToEquipment: false };
		let backpackState = { view: 'overview', backpackKey: null, page: 0, showMineralSelect: false };
		const collector = mainMsg.createMessageComponentCollector({ time: 300000 });

		const updateMain = async interaction => {
			view = 'main';
			const [currentStats, currentInventory] = await Promise.all([
				rpgmanager.getStats(userId),
				rpgmanager.getInventory(userId)
			]);
			profile = parseMiningProfile(currentStats.mining_profile || profile);
			await interaction.update({
				components: [mineUI.buildMain(message.author, currentStats, currentInventory, allEquipmentItems, null, profile)]
			});
		};

		const updateBackpack = async interaction => {
			view = 'backpack';
			backpackState = { view: 'overview', backpackKey: null, page: 0, showMineralSelect: false };
			const currentInventory = await rpgmanager.getInventory(userId);
			mineBackpack.getOwnedBackpacks(profile, currentInventory);
			await rpgmanager.updateProgress(userId, { mining_profile: profile });
			await interaction.update({
				components: [mineUI.buildBackpack(profile, currentInventory, backpackState)]
			});
		};

		const updateEquipment = async (interaction, infoMessage = null) => {
			view = 'equipment';
			const currentInventory = await rpgmanager.getInventory(userId);
			await interaction.update({
				components: [mineUI.buildEquipment(profile, currentInventory, itemGroups, infoMessage)]
			});
		};

		const openShopCategory = async (interaction, categoryKey) => {
			if (!mineShop.CATEGORIES[categoryKey]) return interaction.deferUpdate();
			view = 'shopCategory';
			shopState.category = categoryKey;
			shopState.items = mineShop.loadCategoryItems(categoryKey);
			await interaction.update({
				components: [mineShop.buildCategoryContainer(categoryKey, shopState.items, { returnToEquipment: shopState.returnToEquipment })]
			});
		};

		const startMining = async interaction => {
			const currentStats = await rpgmanager.getStats(userId);
			if (!currentStats || currentStats.health <= 0) {
				return interaction.reply({ content: 'You need HP to mine. Heal before trying again.', ephemeral: true });
			}

			profile = parseMiningProfile(currentStats.mining_profile || profile);
			const equipment = profile.equipment;
			const notices = [];
			let equipmentBroke = false;
			const currentInventory = await rpgmanager.getInventory(userId);
			const currentPickaxe = itemGroups.pickaxes.find(item => item.id === equipment.currentPickaxe);

			if (currentPickaxe && currentPickaxe.id !== profile.fallbackPickaxe) {
				const maxDurability = Number(currentPickaxe.durability) || 80;
				const remainingDurability = Math.max(0, Number(equipment.pickaxeDurability) - 1);
				equipment.pickaxeDurability = remainingDurability;
				if (remainingDurability === 0) {
					equipment.currentPickaxe = profile.fallbackPickaxe;
					notices.push(`**${currentPickaxe.name}** broke. You switched to Your Hand.`);
					equipmentBroke = true;
				} else if (!Number.isFinite(Number(equipment.pickaxeDurability))) {
					equipment.pickaxeDurability = maxDurability - 1;
				}
			}

			const currentHelmet = itemGroups.helmets.find(item => item.id === equipment.currentHelmet);
			if (currentHelmet) {
				const remainingDurability = Math.max(0, Number(equipment.helmetDurability) - 1);
				equipment.helmetDurability = remainingDurability;
				if (remainingDurability === 0) {
					equipment.currentHelmet = null;
					notices.push(`**${currentHelmet.name}** broke and was removed from your equipment.`);
					equipmentBroke = true;
				}
			}

			if (!currentInventory.some(item => item.item_id === equipment.currentBackpack)) {
				equipment.currentBackpack = 'defaultbackpack';
				notices.push('Your backpack was unavailable, so you switched to your Default Backpack.');
			}

			await rpgmanager.updateProgress(userId, { mining_profile: profile });
			if (equipmentBroke) {
				return updateEquipment(interaction, notices.join('\n'));
			}

			const { board, bombCount, safeCells } = mineBoard.generateBoard();
			session = {
				userId,
				board,
				sessionLoot: [],
				status: 'playing',
				revealedCount: 0,
				safeCells,
				bombCount,
				mainMsg
			};
			view = 'board';
			mineBoard.activeSessions.set(userId, session);
			await interaction.update({
				components: [mineUI.buildBoardContainer(message.author, currentStats, session)]
			});
		};

		const commitLoot = async (loot, expMultiplier = 1) => {
			let totalExp = 0;
			const currentInventory = await rpgmanager.getInventory(userId);
			let backpackNotice = '';

			for (const mineral of loot) {
				await rpgmanager.addItem(userId, mineral.id, mineral.name);
				const placement = mineBackpack.placeMinedMineral(profile, currentInventory, mineral);
				if (placement && !placement.placed && placement.reason === 'full') {
					backpackNotice = `\n> ⚠️ **${placement.backpackName}** is full! The overflow went to your general inventory.`;
				}
				totalExp += mineCore.calculateExp(mineral);
			}
			totalExp = Math.floor(totalExp * expMultiplier);

			const currentStats = await rpgmanager.getStats(userId);
			let { exp, level } = currentStats;
			exp = (exp || 0) + totalExp;
			while (exp >= level * 100) { exp -= level * 100; level++; }
			await rpgmanager.updateProgress(userId, { exp, level, mining_profile: profile });
			return backpackNotice;
		};

		const updateBoard = async (interaction, notice = null, revealAll = false) => {
			const currentStats = await rpgmanager.getStats(userId);
			await interaction.update({
				components: [mineUI.buildBoardContainer(message.author, currentStats, session, { notice, revealAll })]
			});
		};

		const handleBoardInteraction = async interaction => {
			const id = interaction.customId;
			if (session.status !== 'playing') return interaction.deferUpdate();

			if (id === 'mine_cashout') {
				const keptCount = session.sessionLoot.length;
				const notice = await commitLoot(session.sessionLoot);
				session.status = 'cashed';
				mineBoard.activeSessions.delete(userId);
				mineCounts.set(userId, (mineCounts.get(userId) || 0) + 1);
				return updateBoard(interaction, `Cashed out and kept ${formatNumber(keptCount)} minerals.${notice}`, true);
			}

			if (id.startsWith('mine_keep_')) {
				const index = parseInt(id.slice('mine_keep_'.length), 10);
				const lootIndex = session.sessionLoot.findIndex(item => item.sourceIndex === index);
				if (lootIndex === -1) return updateBoard(interaction, 'That mineral was already claimed or is no longer available.');

				const item = session.sessionLoot.splice(lootIndex, 1)[0];
				await rpgmanager.addItem(userId, item.id, item.name);
				
				const currentInventory = await rpgmanager.getInventory(userId);
				const placement = mineBackpack.placeMinedMineral(profile, currentInventory, item);
				let overflowNotice = '';
				if (placement && !placement.placed && placement.reason === 'full') {
					overflowNotice = `\n> ⚠️ **${placement.backpackName}** is full! The overflow went to your general inventory.`;
				}
				
				const expGain = mineCore.calculateExp(item);
				const statsNow = await rpgmanager.getStats(userId);
				let newExp = (statsNow.exp || 0) + expGain;
				let newLevel = statsNow.level || 1;
				while (newExp >= newLevel * 100) { newExp -= newLevel * 100; newLevel++; }
				await rpgmanager.updateProgress(userId, { exp: newExp, level: newLevel, mining_profile: profile });
				if (session.board[index]) session.board[index].committed = true;
				await updateBoard(interaction, `Kept **${item.name}** and added it to your inventory.${overflowNotice}`);
				if (newLevel > (Number(statsNow.level) || 1)) {
					notifi.notifyLevelUp(message.client, userId, formatNumber(newLevel));
				}
				return;
			}

			if (!id.startsWith('mine_cell_')) return interaction.deferUpdate();
			const index = parseInt(id.slice('mine_cell_'.length), 10);
			const result = mineBoard.revealCell(session, index);
			if (result.changed === false && result.hitBomb === undefined) return interaction.deferUpdate();

			if (result.hitBomb) {
				const currentStats = await rpgmanager.getStats(userId);
				const newHealth = Math.max(0, currentStats.health - 15);
				await rpgmanager.updateStats(userId, newHealth, currentStats.stamina);
				session.status = 'lost';
				mineBoard.activeSessions.delete(userId);
				return updateBoard(interaction, '💥 You hit a bomb and lost your session loot. -15 HP.', true);
			}

			if (session.revealedCount >= session.safeCells) {
				const keptCount = session.sessionLoot.length;
				await commitLoot(session.sessionLoot, 1.25);
				session.status = 'won';
				mineBoard.activeSessions.delete(userId);
				mineCounts.set(userId, (mineCounts.get(userId) || 0) + 1);
				return updateBoard(interaction, `Perfect mine! Kept ${formatNumber(keptCount)} minerals and earned +25% EXP.`, true);
			}

			const notice = result.revealedType === 'mineral' && result.mineral
				? `Found **${result.mineral.name}**. Keep it now or cash out later.`
				: null;
			return updateBoard(interaction, notice);
		};

		collector.on('collect', async interaction => {
			if (interaction.user.id !== userId) {
				return interaction.reply({ content: 'This mining menu belongs to someone else.', ephemeral: true });
			}
			collector.resetTimer();

			try {
				const id = interaction.customId;
				if (view === 'board' && session) return await handleBoardInteraction(interaction);

				if (id === 'mine_now') return await startMining(interaction);
				if (id === 'mine_backpack') return await updateBackpack(interaction);
				if (id === 'mine_backpack_shop') return await openShopCategory(interaction, 'backpack');

				if (id === 'mine_backpack_back') {
					backpackState = { view: 'overview', backpackKey: null, page: 0, showMineralSelect: false };
					const currentInventory = await rpgmanager.getInventory(userId);
					return await interaction.update({ components: [mineUI.buildBackpack(profile, currentInventory, backpackState)] });
				}

				if (['first', 'prev', 'next', 'last'].includes(id) && (view === 'backpack')) {
					const currentInventory = await rpgmanager.getInventory(userId);
					const ownedNow = mineBackpack.getOwnedBackpacks(profile, currentInventory);

					if (backpackState.view === 'overview') {
						const maxPages = Math.max(1, Math.ceil(ownedNow.length / mineBackpack.FREE_SLOT_COUNT));
						const page = Math.min(Math.max(0, backpackState.page || 0), maxPages - 1);
						let nextPage = page;
						if (id === 'first') nextPage = 0;
						else if (id === 'prev') nextPage = Math.max(0, page - 1);
						else if (id === 'next') nextPage = Math.min(maxPages - 1, page + 1);
						else if (id === 'last') nextPage = maxPages - 1;
						backpackState.page = nextPage;
					} else {
						const nav = mineBackpack.getBackpackNavigation(profile, currentInventory, backpackState.backpackKey);
						let index = nav.index;
						if (id === 'first') index = 0;
						else if (id === 'prev') index = Math.max(0, index - 1);
						else if (id === 'next') index = Math.min(nav.total - 1, index + 1);
						else if (id === 'last') index = nav.total - 1;
						const target = ownedNow[index];
						if (target) backpackState.backpackKey = target.rowId;
					}

					return await interaction.update({ components: [mineUI.buildBackpack(profile, currentInventory, backpackState)] });
				}

				if (id === 'mine_backpack_lock') {
					const currentInventory = await rpgmanager.getInventory(userId);
					mineBackpack.toggleBackpackLock(profile, backpackState.backpackKey);
					await rpgmanager.updateProgress(userId, { mining_profile: profile });
					return await interaction.update({ components: [mineUI.buildBackpack(profile, currentInventory, backpackState)] });
				}

				if (id === 'mine_backpack_select_mineral_toggle') {
					const currentInventory = await rpgmanager.getInventory(userId);
					backpackState.showMineralSelect = !backpackState.showMineralSelect;
					return await interaction.update({ components: [mineUI.buildBackpack(profile, currentInventory, backpackState)] });
				}

				if (id === 'mine_backpack_sell_all') {
					const currentInventory = await rpgmanager.getInventory(userId);
					const scope = backpackState.view === 'detail' ? backpackState.backpackKey : 'all';
					const result = await mineBackpack.sellAllMinerals(userId, profile, currentInventory, scope);

					const freshInventory = await rpgmanager.getInventory(userId);
					mineBackpack.getOwnedBackpacks(profile, freshInventory);
					await rpgmanager.updateProgress(userId, { mining_profile: profile });

					if (!result.ok) {
						await interaction.update({ components: [mineUI.buildBackpack(profile, freshInventory, backpackState)] });
						return await interaction.followUp({ content: result.message, ephemeral: true });
					}

					const soldLines = result.sold.slice(0, 10).map(s => `**${s.name}** \`x${formatNumber(s.count)}\` — ${formatNumber(s.earned)} ${CURRENCY_EMOJI}`).join('\n');
					const moreLine = result.sold.length > 10 ? `\n…and ${formatNumber(result.sold.length - 10)} more type(s)` : '';
					const summary = result.soldCount > 0
						? `> **Sold ${formatNumber(result.soldCount)} minerals** for **${formatNumber(result.totalEarned)} ${CURRENCY_EMOJI}**!\n${soldLines}${moreLine}`
						: '> Nothing was sold — the backpack(s) are empty or only hold unsellable minerals.';

					await interaction.update({ components: [mineUI.buildBackpack(profile, freshInventory, backpackState)] });
					return await interaction.followUp({ content: summary, ephemeral: true });
				}

				if (id === 'mine_backpack_select') {
					const val = interaction.values[0];
					if (val === 'all') {
						backpackState.view = 'overview';
						backpackState.backpackKey = null;
					} else {
						backpackState.view = 'detail';
						backpackState.backpackKey = val;
						backpackState.showMineralSelect = false;
					}
					const currentInventory = await rpgmanager.getInventory(userId);
					return await interaction.update({ components: [mineUI.buildBackpack(profile, currentInventory, backpackState)] });
				}

				if (id === 'mine_backpack_mineral_select') {
					const [bucketKey, index] = interaction.values[0].split(':');
					const currentInventory = await rpgmanager.getInventory(userId);
					const result = await mineBackpack.sellMineralFromBackpack(userId, profile, currentInventory, bucketKey, index);

					const freshInventory = await rpgmanager.getInventory(userId);
					mineBackpack.getOwnedBackpacks(profile, freshInventory);
					await rpgmanager.updateProgress(userId, { mining_profile: profile });

					await interaction.update({ components: [mineUI.buildBackpack(profile, freshInventory, backpackState)] });

					if (result.ok) {
						return await interaction.followUp({ content: `Sold **${result.name}** for **${formatNumber(result.earned)} ${CURRENCY_EMOJI}**.`, ephemeral: true });
					} else {
						return await interaction.followUp({ content: result.message, ephemeral: true });
					}
				}
				if (id === 'mine_skills') {
					view = 'skills';
					return await interaction.update({ components: [mineUI.buildSkill(profile)] });
				}
				if (id === 'mine_equipment') return await updateEquipment(interaction);
				if (id === 'mine_equipment_back') return await updateMain(interaction);
				if (id === 'mine_equipment_shop') return await openShopCategory(interaction, 'pickaxe'); // Open pickaxe shop as default for equipment
				
				if (id === 'mine_equipment_select_pickaxe') {
					const selected = interaction.values[0];
					const currentInventory = await rpgmanager.getInventory(userId);
					const owns = selected === profile.fallbackPickaxe || currentInventory.some(item => item.item_id === selected);
					if (!owns) return await updateEquipment(interaction, 'You dont own this item!');
					profile.equipment = profile.equipment || {};
					profile.equipment.currentPickaxe = selected;
					await rpgmanager.updateProgress(userId, { mining_profile: profile });
					return await updateEquipment(interaction);
				}
				if (id === 'mine_equipment_select_helmet') {
					const selected = interaction.values[0];
					const currentInventory = await rpgmanager.getInventory(userId);
					const owns = selected === 'none' || currentInventory.some(item => item.item_id === selected);
					if (!owns) return await updateEquipment(interaction, 'You do not own this helmet.');
					profile.equipment = profile.equipment || {};
					profile.equipment.currentHelmet = selected === 'none' ? null : selected;
					await rpgmanager.updateProgress(userId, { mining_profile: profile });
					return await updateEquipment(interaction);
				}
				if (id === 'mine_equipment_select_backpack') {
					const selected = interaction.values[0];
					const currentInventory = await rpgmanager.getInventory(userId);
					const owns = selected === 'defaultbackpack' || currentInventory.some(item => item.item_id === selected);
					if (!owns) return await updateEquipment(interaction, 'You do not own this backpack.');
					profile.equipment = profile.equipment || {};
					profile.equipment.currentBackpack = selected;
					await rpgmanager.updateProgress(userId, { mining_profile: profile });
					return await updateEquipment(interaction);
				}

				if (id === 'mine_location') {
					view = 'location';
					return await interaction.update({ components: [mineUI.buildLocation(profile)] });
				}
				if (id === 'mine_menu_back' || id === 'mine_shop_back') return await updateMain(interaction);
				if (id === 'mine_shop') {
					view = 'shopCategories';
					return await interaction.update({ components: [mineShop.buildCategoriesContainer()] });
				}
				if (id === 'mine_shop_categories') {
					view = 'shopCategories';
					return await interaction.update({ components: [mineShop.buildCategoriesContainer()] });
				}
				if (id.startsWith('mine_shop_category_back_')) {
					const categoryKey = id.slice('mine_shop_category_back_'.length);
					return await openShopCategory(interaction, categoryKey);
				}
				if (id.startsWith('mine_shop_category_')) {
					const categoryKey = id.slice('mine_shop_category_'.length);
					return await openShopCategory(interaction, categoryKey);
				}
				if (id === 'mine_shop_item_select' && interaction.isStringSelectMenu()) {
					if (interaction.values[0] === 'back') {
						view = 'shopCategories';
						return await interaction.update({ components: [mineShop.buildCategoriesContainer({ returnToEquipment: shopState.returnToEquipment })] });
					}
					const item = shopState.items.get(interaction.values[0]);
					if (!item) return interaction.reply({ content: 'That item is no longer available.', ephemeral: true });
					view = 'shopItem';
					return await interaction.update({ components: [mineShop.buildItemContainer(shopState.category, item, { returnToEquipment: shopState.returnToEquipment })] });
				}
				if (id.startsWith('mine_shop_buy_')) {
					const itemId = id.slice('mine_shop_buy_'.length);
					const item = shopState.items.get(itemId);
					if (!item) return interaction.reply({ content: 'That item is no longer available.', ephemeral: true });
					const cost = getShopItemCost(item);
					if (!Number.isFinite(cost) || cost <= 0) {
						return interaction.reply({ content: 'This item cannot be purchased right now.', ephemeral: true });
					}
					const account = await dbmanager.getUser(userId);
					if (account.balance < cost) {
						return interaction.reply({ content: 'You do not have enough money to buy this item.', ephemeral: true });
					}
					await dbmanager.removeMoney(userId, cost);
					await rpgmanager.addItem(userId, item.id, item.name);
					return interaction.reply({ content: `Bought **${item.name}** for $${formatNumber(cost)}.`, ephemeral: true });
				}

				await interaction.deferUpdate();
			} catch (error) {
				console.error('Mining interaction failed:', error);
				if (!interaction.replied && !interaction.deferred) {
					await interaction.reply({ content: 'Something went wrong. Please try again.', ephemeral: true }).catch(() => { });
				}
			}
		});

		collector.on('end', async () => {
			if (!session || session.status !== 'playing') return;
			mineBoard.activeSessions.delete(userId);
			session.status = 'expired';
			const currentStats = await rpgmanager.getStats(userId).catch(() => stats);
			await mainMsg.edit({
				components: [mineUI.buildBoardContainer(message.author, currentStats, session, {
					revealAll: true,
					notice: 'Your mining session expired. Session loot was lost.'
				})]
			}).catch(() => { });
		});
	}
};
