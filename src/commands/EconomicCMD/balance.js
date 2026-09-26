const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ContainerBuilder, MessageFlags, ModalBuilder, SectionBuilder, SeparatorBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { CURRENCY_EMOJI } = require('../Utils/config');
const formatNumber = require('../Utils/formatNumber');
const { getReloadButton } = require('../Utils/NavigateManager');

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

        const buildBalanceData = async () => {
            const userData = await dbManager.getUser(author.id);
            return {
                ...userData,
                bankLimit: await dbManager.getBankLimit(author.id),
                rank: await dbManager.getMoneyRank(author.id)
            };
        };

        const buildBalanceContainer = (data, disabled = false) => {
            const controls = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('with_modal').setLabel('Withdraw').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                new ButtonBuilder().setCustomId('dep_modal').setLabel('Deposit').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                getReloadButton('balance_reload', disabled)
            );

            return new ContainerBuilder()
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `## ${name}'s Balance\n-# Global rank: **#${data.rank ?? '—'}**`
                        ))
                        .setButtonAccessory(
                            new ButtonBuilder()
                                .setCustomId('balance_networth')
                                .setLabel('Networth')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        )
                )
                .addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `${CURRENCY_EMOJI} ${formatNumber(data.balance)}\n🏦 ${formatNumber(data.bank)} / ${formatNumber(data.bankLimit)}`
                ))
                .addSeparatorComponents(new SeparatorBuilder())
                .addActionRowComponents(controls);
        };

        const balanceData = await buildBalanceData();
        let currentData = balanceData;
        const response = await message.channel.send({
            components: [buildBalanceContainer(balanceData)],
            flags: [MessageFlags.IsComponentsV2]
        });

        const collector = response.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, componentType: ComponentType.Button });

        collector.on('collect', async (i) => {
            if (i.customId === 'balance_reload') {
                currentData = await buildBalanceData();
                return i.update({ components: [buildBalanceContainer(currentData)] });
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
                await submit.update({ components: [buildBalanceContainer(currentData)] });
            }
        });

        collector.on('end', async () => {
            response.edit({ components: [buildBalanceContainer(currentData, true)] }).catch(() => { });
        });
    }
}