const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle  } = require('discord.js');
const { checkCooldown } = require('../Utils/Cooldown');
const { NPC, BegSuccess, SelfBegSuccess, BegFail, BegStolen } = require('../Utils/misc');
const { CURRENCY_EMOJI } = require('../Utils/config');
const { checkWantedRestrictions } = require('../Utils/WantedLevel');

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

function pickBegSuccessMessage() {
    return getRandom(BegSuccess);
}

function pickSelfBegMessage() {
    return getRandom(SelfBegSuccess || []);
}

function calculateSelfBegPenalty(totalAssets) {
    const safeAssets = Number(totalAssets) || 0;
    if (safeAssets <= 0) return 0;
    return Math.max(1, Math.floor(safeAssets * 0.2));
}

module.exports = {
    name: 'beg',
    description: 'Begging random NPC or people in server, could beg yourself maybe',
    category: 'eco',
    usage: 'Zbeg (Optional: `@user`)',
    pickBegSuccessMessage,
    pickSelfBegMessage,
    calculateSelfBegPenalty,
    async execute(message, args = []) {
        const { author } = message;
        const dbManager = message.client.db;

        const timeLeft = checkCooldown(author.id, this.name);
        if (timeLeft) {
            return message.reply({ content: `Please wait ${timeLeft} before using the \`${this.name}\` command again.`, ephemeral: true });
        }

        const wantedCheck = await checkWantedRestrictions(author.id, this.name, message.client, message);
        if (!wantedCheck.allowed) {
            if (!wantedCheck.handled && wantedCheck.message) message.reply(wantedCheck.message);
            return;
        }

        const rpgmanager = require('../../../database/rpgmanager');
        const achievementChecker = require('../../minigames/achievement/achievementChecker');
        const stats = await rpgmanager.getStats(author.id);
        const newBegs = (stats.begs || 0) + 1;
        await rpgmanager.updateProgress(author.id, { begs: newBegs });
        stats.begs = newBegs;
        achievementChecker.checkEconomy(author.id, stats, 'beg').catch(console.error);

        const targetUser = message.mentions.users.first() || (args[0] && /^\d{17,19}$/.test(args[0]) ? await message.client.users.fetch(args[0]).catch(() => null) : null);
        const isSelfBeg = Boolean(targetUser && targetUser.id === author.id);

        if (isSelfBeg) {
            const userData = await dbManager.getUser(author.id);
            const totalAssets = Number(userData.balance || 0) + Number(userData.bank || 0);
            const penalty = calculateSelfBegPenalty(totalAssets);
            let remainingPenalty = penalty;

            if (remainingPenalty > 0) {
                const balance = Number(userData.balance || 0);
                if (balance > 0) {
                    const fromBalance = Math.min(balance, remainingPenalty);
                    await dbManager.removeMoney(author.id, fromBalance);
                    remainingPenalty -= fromBalance;
                }

                if (remainingPenalty > 0) {
                    await dbManager.removeBank(author.id, remainingPenalty);
                }
            }

            const selfText = pickSelfBegMessage() || "You tried to beg from yourself...";
            const selfEmbed = new EmbedBuilder()
                .setTitle('Self-beg penalty')
                .setDescription(`${selfText}\n\nThat cost you **${penalty.toLocaleString()}${CURRENCY_EMOJI}** from your assets, go find a job or at least beg from someone else next time`)
                .setColor('#e67e22');

            await message.reply({ embeds: [selfEmbed] });
            return;
        }

        if (targetUser && !targetUser.bot) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('beg_give').setLabel('Give Money').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('beg_deny').setLabel('Deny').setStyle(ButtonStyle.Danger)
            );

            const promptEmbed = new EmbedBuilder()
                .setTitle('Begging Request')
                .setDescription(`${author} is begging ${targetUser} for some cash! Click **Give Money** to decide how much to grant.`)
                .setColor('#ffd166');

            const promptMessage = await message.channel.send({ content: `${targetUser}`, embeds: [promptEmbed], components: [row] });

            const collector = promptMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 30000
            });

            collector.on('collect', async (interaction) => {
                if (interaction.user.id !== targetUser.id) {
                    await interaction.reply({ content: `Only ${targetUser.username} can respond to this request!`, ephemeral: true }).catch(() => {});
                    return;
                }

                if (interaction.customId === 'beg_deny') {
                    await interaction.update({
                        embeds: [new EmbedBuilder().setTitle('Beg Denied').setDescription(`${targetUser} refused to give ${author} any money.`).setColor('#e74c3c')],
                        components: []
                    });
                    collector.stop('handled');
                    return;
                }

                if (interaction.customId === 'beg_give') {
                    const targetData = await dbManager.getUser(targetUser.id);
                    const targetBalance = Number(targetData.balance || 0);

                    if (targetBalance <= 0) {
                        await interaction.update({
                            embeds: [new EmbedBuilder().setTitle('Beg Failed').setDescription(`${targetUser} wanted to give you money, but they are completely broke!`).setColor('#e74c3c')],
                            components: []
                        });
                        collector.stop('handled');
                        return;
                    }

                    const modalCustomId = `beg_modal_${interaction.id}`;
                    const modal = new ModalBuilder()
                        .setCustomId(modalCustomId)
                        .setTitle(`Give Money to ${author.username}`);

                    const amountInput = new TextInputBuilder()
                        .setCustomId('beg_amount')
                        .setLabel(`Amount (Max: ${targetBalance.toLocaleString()})`)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder(`Enter amount (Your balance: ${targetBalance})`)
                        .setRequired(true);

                    const firstActionRow = new ActionRowBuilder().addComponents(amountInput);
                    modal.addComponents(firstActionRow);

                    await interaction.showModal(modal);

                    try {
                        const modalSubmission = await interaction.awaitModalSubmit({
                            filter: (i) => i.customId === modalCustomId && i.user.id === targetUser.id,
                            time: 60000
                        });

                        const inputVal = modalSubmission.fields.getTextInputValue('beg_amount').trim();
                        const giveAmount = parseInt(inputVal, 10);

                        if (isNaN(giveAmount) || giveAmount <= 0) {
                            await modalSubmission.reply({ content: 'Invalid amount. Please enter a valid positive number.', ephemeral: true });
                            return;
                        }

                        const currentTargetData = await dbManager.getUser(targetUser.id);
                        const currentBalance = Number(currentTargetData.balance || 0);

                        if (giveAmount > currentBalance) {
                            await modalSubmission.reply({ content: `You don't have enough money! Your current balance is **${currentBalance.toLocaleString()}${CURRENCY_EMOJI}**.`, ephemeral: true });
                            return;
                        }

                        await dbManager.removeMoney(targetUser.id, giveAmount);
                        await dbManager.addMoney(author.id, giveAmount, { trackEarning: true });

                        await modalSubmission.deferUpdate();
                        await promptMessage.edit({
                            embeds: [new EmbedBuilder().setTitle('Beg Successful!')
                                .setDescription(`${targetUser} was feeling generous and gave ${author} **${giveAmount.toLocaleString()}${CURRENCY_EMOJI}**!`)
                                .setColor('#2ecc71')],
                            components: []
                        });

                        collector.stop('handled');
                    } catch (err) {
                    }
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    await promptMessage.edit({
                        embeds: [new EmbedBuilder().setTitle('Beg Ignored').setDescription(`${targetUser} ignored ${author}'s begging.`).setColor('#95a5a6')],
                        components: []
                    }).catch(() => {});
                }
            });

            return;
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('beg_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('beg_no').setLabel('No').setStyle(ButtonStyle.Danger)
        );

        const promptEmbed = new EmbedBuilder()
            .setTitle('Beg for money?')
            .setDescription('Do you want to try begging for cash from strangers? Choose **Yes** to proceed or **No** to back out.')
            .setColor('#ffd166');

        const promptMessage = await message.channel.send({ embeds: [promptEmbed], components: [row] });

        const collector = promptMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000
        });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== author.id) {
                await interaction.reply({ content: 'This beg prompt is only for the person who started it.', ephemeral: true }).catch(() => {});
                return;
            }

            if (interaction.customId === 'beg_no') {
                await interaction.update({
                    embeds: [new EmbedBuilder().setTitle('Beg cancelled').setDescription('No worries, maybe later.').setColor('#f39c12')],
                    components: []
                });
                collector.stop('handled');
                return;
            }

            const amount = Math.floor(Math.random() * 90) + 1;
            const roll = Math.floor(Math.random() * 100) + 1;
            let chance = roll <= 20 ? 1 : roll <= 40 ? 3 : 2;

            try {
                const resultEmbed = new EmbedBuilder();

                if (chance === 1) {
                    await dbManager.addMoney(author.id, amount, { trackEarning: true });
                    const randomNPC = getRandom(NPC);
                    const randomSuccess = pickBegSuccessMessage();

                    resultEmbed.setTitle('Begged for money!')
                        .setDescription(`${randomSuccess} ${randomNPC} came in and threw money at your face! You got **${amount.toLocaleString()}${CURRENCY_EMOJI}**!`)
                        .setColor('#2ecc71');
                } else if (chance === 2) {
                    const randomFail = getRandom(BegFail);
                    resultEmbed.setTitle('Begging failed!')
                        .setDescription(`${randomFail}\n\nNobody gave you a single penny.`)
                        .setColor('#e74c3c');
                } else if (chance === 3) {
                    await dbManager.removeMoney(author.id, amount);
                    const randomStolen = getRandom(BegStolen);

                    resultEmbed.setTitle('Oh no! You got robbed!')
                        .setDescription(`${randomStolen}\n\nYou lost **${amount.toLocaleString()}${CURRENCY_EMOJI}**!`)
                        .setColor('#f39c12');
                }

                await interaction.update({ embeds: [resultEmbed], components: [] });
                collector.stop('handled');
            } catch (error) {
                console.error('Error occurred while begging:', error);
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'time') {
                await promptMessage.edit({ components: [] }).catch(() => {});
            }
        });
    }
};