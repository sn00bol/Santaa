const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { checkCooldown } = require('../Utils/Cooldown');
const { NPC, BegSuccess, SelfBegSuccess, BegFail, BegStolen } = require('../Utils/misc');
const { CURRENCY_EMOJI } = require('../Utils/config');
const { checkWantedRestrictions } = require('../Utils/WantedLevel');

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

function pickBegSuccessMessage() {
    return getRandom(BegSuccess);
}

function pickSelfBegMessage() {
    return getRandom(SelfBeg);
}

function buildTauntPrompt(userMention) {
    return `Your beg failed. ${userMention}, write a short taunt for the beggar and reply in this channel.`;
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
    buildTauntPrompt,
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

            const selfText = pickSelfBegMessage();
            const selfEmbed = new EmbedBuilder()
                .setTitle('Self-beg penalty')
                .setDescription(`${selfText}\n\nThat cost you **${penalty.toLocaleString()}${CURRENCY_EMOJI}** from your assets, go find a job or at least beg from someone else next time`)
                .setColor('#e67e22');

            await message.reply({ embeds: [selfEmbed] });
            return;
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('beg_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('beg_no').setLabel('No').setStyle(ButtonStyle.Danger)
        );

        const promptEmbed = new EmbedBuilder()
            .setTitle('Beg for money?')
            .setDescription('Do you want to try begging for cash? Choose **Yes** to proceed or **No** to back out.')
            .setColor('#ffd166');

        const promptMessage = await message.channel.send({ embeds: [promptEmbed], components: [row] });

        const collector = promptMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000
        });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== author.id) {
                await interaction.reply({ content: 'This beg prompt is only for the person who started it.', ephemeral: true }).catch(() => { });
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
            let chance;

            if (roll <= 20) {
                chance = 1;
            } else if (roll <= 40) {
                chance = 3;
            } else {
                chance = 2;
            }

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
                    const tauntPrompt = buildTauntPrompt(`<@${author.id}>`);

                    resultEmbed.setTitle('Begging failed!')
                        .setDescription(`${randomFail}\n\n${tauntPrompt}`)
                        .setColor('#e74c3c');

                    await interaction.update({ embeds: [resultEmbed], components: [] });

                    const filter = (msg) => msg.author.id === author.id && msg.channel.id === message.channel.id;
                    try {
                        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                        const tauntText = collected.first().content.trim();

                        if (tauntText) {
                            await message.channel.send({ content: `🗣️ Taunt from ${author}: ${tauntText}` });
                        }
                    } catch (error) {
                        await message.channel.send({ content: `⏰ ${author}, you took too long to write your taunt.` });
                    }
                    return;
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
                await interaction.update({
                    embeds: [new EmbedBuilder().setTitle('Begging error').setDescription('An error occurred while executing the command.').setColor('#e74c3c')],
                    components: []
                });
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'time' || reason === 'handled') {
                await promptMessage.edit({ components: [] }).catch(() => { });
            }
        });
    }
};