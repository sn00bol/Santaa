const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ContainerBuilder, MessageFlags, ModalBuilder, SectionBuilder, SeparatorBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { CURRENCY_EMOJI } = require('../Utils/config');
const formatNumber = require('../Utils/formatNumber');
const { getReloadButton } = require('../Utils/NavigateManager');
const { getSetting } = require('../MainCMD/stgfiles');

module.exports = {
    name: 'balance',
    aliases: ['bal', 'wallet'],
    description: 'Manage your currently balance and bank account',
    category: 'eco',
    usage: 'Zbalance `@user`',
        args: [
        { name: 'target', description: 'The user to check the balance of', type: 'user', required: false },
    ],
    async execute(message) {
        const { author, client } = message;
        const dbManager = client.db;
        const name = message.member?.displayName || author.username;
        const targetUser = message.mentions.users.first();

        if (targetUser && targetUser.id !== author.id) {
            const targetSettings = await dbManager.getUserSettings(targetUser.id);
            if (!getSetting('show_balance').canViewBalance(targetSettings)) {
                return message.reply('This user block anyone to check their balance, go away pls');
            }

            const targetData = await dbManager.getUser(targetUser.id);
            const targetName = message.mentions.members?.find(member => member.id === targetUser.id)?.displayName
                || targetUser.globalName
                || targetUser.username;
            const publicBalance = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${targetName}'s Balance`))
                .addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `${CURRENCY_EMOJI} ${formatNumber(targetData.balance)}\n🏦 ${formatNumber(targetData.bank)}`
                ));

            return message.channel.send({
                components: [publicBalance],
                flags: [MessageFlags.IsComponentsV2],
            });
        }

        const buildBalanceData = async () => {
            const [netWorth, rank, userData] = await Promise.all([
                dbManager.getNetWorthSummary(author.id),
                dbManager.getMoneyRank(author.id),
                dbManager.getUser(author.id),
            ]);
            return {
                ...userData,
                bankLimit: await dbManager.getBankLimit(author.id),
                rank,
                totalCoins: netWorth.totalCoins,
                inventoryValue: netWorth.inventoryValue,
                peakNetWorth: netWorth.peakTotal,
            };
        };

        const buildBalanceContainer = (data, view = 'balances', disabled = false) => {
            const showingNetWorth = view === 'networth';
            const controls = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('with_modal').setLabel('Withdraw').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                new ButtonBuilder().setCustomId('dep_modal').setLabel('Deposit').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                getReloadButton('balance_reload', disabled)
            );

            return new ContainerBuilder()
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            showingNetWorth
                                ? `## ${name}'s Net Worth\n-# Highest recorded total`
                                : `## ${name}'s Balance\n-# Global rank: **#${data.rank ?? '—'}**`
                        ))
                        .setButtonAccessory(
                            new ButtonBuilder()
                                .setCustomId('balance_view_toggle')
                                .setLabel(showingNetWorth ? 'Balances' : 'Net Worth')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(disabled)
                        )
                )
                .addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    showingNetWorth
                        ? `**Total coins**\n${CURRENCY_EMOJI} ${formatNumber(data.totalCoins)}\n\n**Inventory values**\n🎒 ${formatNumber(data.inventoryValue)}\n\n**Total**\n📦 ${formatNumber(data.peakNetWorth)}\n-# Highest total reached; this value never decreases.`
                        : `${CURRENCY_EMOJI} ${formatNumber(data.balance)}\n🏦 ${formatNumber(data.bank)} / ${formatNumber(data.bankLimit)}`
                ))
                .addSeparatorComponents(new SeparatorBuilder())
                .addActionRowComponents(controls);
        };

        const balanceData = await buildBalanceData();
        let currentData = balanceData;
        let currentView = 'balances';
        const response = await message.channel.send({
            components: [buildBalanceContainer(balanceData, currentView)],
            flags: [MessageFlags.IsComponentsV2]
        });

        const collector = response.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, componentType: ComponentType.Button });

        collector.on('collect', async (i) => {
            if (i.customId === 'balance_reload' || i.customId === 'balance_view_toggle') {
                await i.deferUpdate();
                if (i.customId === 'balance_view_toggle') {
                    currentView = currentView === 'balances' ? 'networth' : 'balances';
                }
                currentData = await buildBalanceData();
                return response.edit({ components: [buildBalanceContainer(currentData, currentView)] });
            }

            const IsDep = i.customId === 'dep_modal';
            const modal = new ModalBuilder()
                .setCustomId(IsDep ? 'dep_modal' : 'with_modal')
                .setTitle(IsDep ? 'Deposit Amount' : 'Withdraw Amount');

            const amountInput = new TextInputBuilder()
                .setCustomId('amount_input')
                .setLabel('Amount (All or number):')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
            await i.showModal(modal);
            const submit = await i.awaitModalSubmit({ time: 30000 }).catch(() => null);

            if (submit) {
                let input = submit.fields.getTextInputValue('amount_input').toLowerCase();
                const curData = await dbManager.getUser(message.author.id);
                let amount = 0;

                if (input === 'all') {
                    amount = IsDep ? curData.balance : curData.bank;
                } else {
                    amount = parseInt(input.replace(/k/g, '000'));
                }

                if (isNaN(amount) || amount <= 0) {
                    return submit.reply({ content: 'Please enter a valid amount.', ephemeral: true });
                }

                if (IsDep) {
                    if (amount > curData.balance) return submit.reply({ content: 'You do not have enough balance to deposit that amount.', ephemeral: true });
                    const bankLimit = await dbManager.getBankLimit(message.author.id);
                    const remainingCapacity = Math.max(0, bankLimit - Number(curData.bank));
                    if (amount > remainingCapacity) {
                        return submit.reply({ content: `Your bank can only accept ${formatNumber(remainingCapacity)} more. Current limit: ${formatNumber(bankLimit)}.`, ephemeral: true });
                    }
                    await dbManager.removeMoney(message.author.id, amount);
                    const deposited = await dbManager.addBank(message.author.id, amount);
                    if (!deposited) {
                        await dbManager.addMoney(message.author.id, amount);
                        return submit.reply({ content: 'Your bank limit was reached. Your money has been returned to your balance.', ephemeral: true });
                    }
                } else {
                    if (amount > curData.bank) return submit.reply({ content: 'You do not have enough money in the bank.', ephemeral: true });
                    await dbManager.removeBank(message.author.id, amount);
                    await dbManager.addMoney(message.author.id, amount);
                }

                currentData = await buildBalanceData();
                await submit.update({ components: [buildBalanceContainer(currentData, currentView)] });
            }
        });

        collector.on('end', async () => {
            response.edit({ components: [buildBalanceContainer(currentData, currentView, true)] }).catch(() => { });
        });
    }
}