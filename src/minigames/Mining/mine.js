const { EmbedBuilder } = require('discord.js');
const rpgmanager = require('../../../database/rpgmanager');
const { checkCooldown } = require('../../commands/Utils/Cooldown');
const mineCore = require('./mineCore');
const mineBoard = require('./mineBoard');
const mineUI = require('./mineUI');
const { checkWantedRestrictions } = require('../../commands/Utils/WantedLevel');
const formatNumber = require('../../commands/Utils/formatNumber');

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

		// exhaustion check (mirror fishing)
		const count = mineCounts.get(userId) || 0;
		if (count >= 5) {
			const cooldownTime = checkCooldown(userId, 'mine_exhaustion');
			if (cooldownTime) return message.reply(`You're exhausted! Wait **${cooldownTime}** before mining again.`);
			else mineCounts.set(userId, 0);
		}

		const wantedCheck = await checkWantedRestrictions(userId, this.name, message.client, message);
		if (!wantedCheck.allowed) {
			if (!wantedCheck.handled && wantedCheck.message) message.reply(wantedCheck.message);
			return;
		}

		const stats = await rpgmanager.getStats(userId);
		if (!stats || stats.health <= 0) return message.reply('You need HP to mine. Heal before trying again.');

		const { board, bombCount, safeCells } = mineBoard.generateBoard();
		const session = {
			userId,
			board,
			sessionLoot: [],
			status: 'playing',
			revealedCount: 0,
			safeCells,
			bombCount,
			mainMsg: null
		};

		mineBoard.activeSessions.set(userId, session);

		const embed = mineUI.buildEmbed(message.author, stats, session);
		const rows = mineUI.buildButtonRows(session);

		const mainMsg = await message.reply({ embeds: [embed], components: rows });
		session.mainMsg = mainMsg;

		const collector = mainMsg.createMessageComponentCollector({ filter: i => i.user.id === userId, time: 300000 });

		const commitLoot = async (userId, loot, expMultiplier = 1) => {
			let totalExp = 0;
			for (const mineral of loot) {
				await rpgmanager.addItem(userId, mineral.id, mineral.name);
				totalExp += mineCore.calculateExp(mineral);
			}
			totalExp = Math.floor(totalExp * expMultiplier);

			const stats = await rpgmanager.getStats(userId);
			let { exp, level } = stats;
			exp = (exp || 0) + totalExp;
			while (exp >= level * 100) { exp -= level * 100; level++; }
			await rpgmanager.updateProgress(userId, { exp, level });
		};

		collector.on('collect', async i => {
			const id = i.customId;
			if (id === 'mine_cashout') {
				// commit loot
				await commitLoot(userId, session.sessionLoot, 1);
				session.status = 'cashed';
				mineBoard.activeSessions.delete(userId);
				mineCounts.set(userId, (mineCounts.get(userId) || 0) + 1);

				const doneEmbed = new EmbedBuilder()
					.setTitle('Cash Out')
					.setDescription(`You cashed out and kept ${formatNumber(session.sessionLoot.length)} minerals.`)
					.setColor('#16A34A');

				await i.update({ embeds: [doneEmbed], components: mineUI.buildButtonRows(session, true) }).catch(() => { });
				return;
			}

			if (id && id.startsWith('mine_keep_')) {
				const idx = parseInt(id.replace('mine_keep_', ''), 10);
				// find the loot item linked to this sourceIndex
				const lootIndex = session.sessionLoot.findIndex(it => it.sourceIndex === idx);
				if (lootIndex === -1) {
					await i.update({ content: 'Item already claimed or not available.', components: mineUI.buildButtonRows(session) }).catch(() => { });
					return;
				}

				const item = session.sessionLoot.splice(lootIndex, 1)[0];
				// commit single item
				await rpgmanager.addItem(userId, item.id, item.name);
				const expGain = mineCore.calculateExp(item);
				const statsNow = await rpgmanager.getStats(userId);
				let newExp = (statsNow.exp || 0) + expGain;
				let newLevel = statsNow.level || 1;
				while (newExp >= newLevel * 100) { newExp -= newLevel * 100; newLevel++; }
				await rpgmanager.updateProgress(userId, { exp: newExp, level: newLevel });

				// mark cell as committed
				if (session.board && session.board[idx]) session.board[idx].committed = true;

				const keepEmbed = new EmbedBuilder()
					.setTitle('Kept item')
					.setDescription(`You kept **${item.name}** and added it to your inventory.`)
					.setColor('#16A34A');

				const rowsAfter = mineUI.buildButtonRows(session);
				await i.update({ embeds: [keepEmbed], components: rowsAfter }).catch(() => { });
				return;
			}

			if (id && id.startsWith('mine_cell_')) {
				const idx = parseInt(id.replace('mine_cell_', ''), 10);
				const res = mineBoard.revealCell(session, idx);
				if (res.changed === false && res.hitBomb === undefined) {
					await i.deferUpdate();
					return;
				}

				// if mineral revealed, offer keep option by rendering keepable button
				if (res.revealedType === 'mineral') {
					const statsAfter = await rpgmanager.getStats(userId);
					const updatedEmbed = mineUI.buildEmbed(message.author, statsAfter, session);
					const updatedRows = mineUI.buildButtonRows(session);
					await i.update({ embeds: [updatedEmbed], components: updatedRows }).catch(() => { });
					return;
				}

				if (res.hitBomb) {
					// apply penalty
					let newHealth = Math.max(0, stats.health - 15);
					await rpgmanager.updateStats(userId, newHealth, stats.stamina);
					session.status = 'lost';
					mineBoard.activeSessions.delete(userId);

					const lostEmbed = new EmbedBuilder()
						.setTitle('Boom!')
						.setDescription('You hit a bomb and lost your session loot. -15 HP')
						.setColor('#DC2626');

					await i.update({ embeds: [lostEmbed], components: mineUI.buildButtonRows(session, true) }).catch(() => { });
					return;
				}

				// normal reveal
				if (session.revealedCount >= session.safeCells) {
					// full clear
					await commitLoot(userId, session.sessionLoot, 1.25);
					session.status = 'won';
					mineBoard.activeSessions.delete(userId);
					mineCounts.set(userId, (mineCounts.get(userId) || 0) + 1);

					const winEmbed = new EmbedBuilder()
						.setTitle('Perfect Mine!')
						.setDescription(`You cleared the mine and kept ${formatNumber(session.sessionLoot.length)} minerals. +25% EXP`)
						.setColor('#16A34A');

					await i.update({ embeds: [winEmbed], components: mineUI.buildButtonRows(session, true) }).catch(() => { });
					return;
				}

				const updatedEmbed = mineUI.buildEmbed(message.author, stats, session);
				const updatedRows = mineUI.buildButtonRows(session);
				await i.update({ embeds: [updatedEmbed], components: updatedRows }).catch(() => { });
				return;
			}

			await i.deferUpdate();
		});

		collector.on('end', async (_, reason) => {
			if (session.status === 'playing') {
				mineBoard.activeSessions.delete(userId);
				const expireEmbed = new EmbedBuilder()
					.setTitle('Session expired')
					.setDescription('Your mining session expired. Session loot was lost.');

				try {
					await mainMsg.edit({ embeds: [expireEmbed], components: mineUI.buildButtonRows(session, true) });
				} catch (e) { }
			}
		});
	}
};
