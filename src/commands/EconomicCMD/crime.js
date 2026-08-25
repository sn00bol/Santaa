const { EmbedBuilder } = require('discord.js');
const { checkCooldown } = require('../Utils/Cooldown');
const { CrimeSuccess, CrimeFail, CrimeWorse } = require('../Utils/misc');
const { CURRENCY_EMOJI } = require('../Utils/config');
const { checkWantedRestrictions } = require('../Utils/WantedLevel');

module.exports = {
    name: 'crime',
    description: 'Commit a crime somewhere in nevada and get rich quick! (or not)',
    category: 'eco',
    usage: 'Zcrime',
    async execute(message) {
        const { client, author } = message;
        const dbManager = client.db;
        const rpgManager = client.rpg;

        // Cooldown
        const timeLeft = checkCooldown(author.id, this.name);

        if (timeLeft) {
            return message.reply({ content: `Please wait ${timeLeft} before using the \`${this.name}\` command again.`, ephemeral: true });
        }

        const wantedCheck = await checkWantedRestrictions(author.id, this.name, client, message);
        if (!wantedCheck.allowed) {
            if (!wantedCheck.handled && wantedCheck.message) {
                message.reply(wantedCheck.message);
            }
            return;
        }

        try {
            const stats = await rpgManager.getStats(author.id);
            
            const newCrimes = (stats.crimes || 0) + 1;
            await rpgManager.updateProgress(author.id, { crimes: newCrimes });
            stats.crimes = newCrimes;
            const achievementChecker = require('../../minigames/achievement/achievementChecker');
            achievementChecker.checkEconomy(author.id, stats, 'crime').catch(console.error);

            const currentHealth = stats.health;
            const currentStamina = stats.stamina;
            const wl = Math.floor((stats.wanted_level || 0) / 5);

            let successChance = 33;
            let failChance = 33;
            let worseChance = 34;

            if (wl === 2) {
                successChance = 15;
            } else if (wl === 3) {
                successChance = 10;
            } else if (wl >= 4 && wl < 6) {
                successChance = 5;
            } else if (wl >= 6) {
                successChance = 1;
            }

            if (currentStamina < 50) {
                successChance -= 10;
                failChance += 5;
                worseChance += 5;
            }

            const roll = Math.floor(Math.random() * 100) + 1;
            let chance;

            if (roll <= successChance) {
                chance = 1; // Success
            } else if (roll <= successChance + failChance) {
                chance = 2; // Fail
            } else {
                chance = 3; // Worse
            }

            const amount = Math.floor(Math.random() * 200) + 100; // Reward/Penalty range
            const embed = new EmbedBuilder();
            const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

            if (chance === 1) {
                await dbManager.addMoney(author.id, amount, { trackEarning: true });
                embed.setTitle('Crime Successful!')
                    .setDescription(`${getRandom(CrimeSuccess)}\n\nYou stole **${amount.toLocaleString()}${CURRENCY_EMOJI}**!`)
                    .setColor('#16A34A');
            } else if (chance === 2) {
                // Fail: lose money, health, 20 stamina
                const penaltyMoney = Math.floor(amount / 2);
                let healthLoss = 10;
                let staminaLoss = 20;

                if (wl >= 3) {
                    healthLoss = Math.floor(currentHealth * 0.8);
                    staminaLoss = Math.floor(currentStamina * 0.8);
                }

                await dbManager.removeMoney(author.id, penaltyMoney);
                const newHealth = Math.max(0, currentHealth - healthLoss);
                const newStamina = Math.max(0, currentStamina - staminaLoss);
                await rpgManager.updateStats(author.id, newHealth, newStamina);

                embed.setTitle('Crime Failed!')
                    .setDescription(`${getRandom(CrimeFail)}\n\nYou lost **${penaltyMoney.toLocaleString()}${CURRENCY_EMOJI}**, **${healthLoss} HP**, and **${staminaLoss} Stamina**!`)
                    .setColor('#DC2626');
            } else {
                // Worse: lose money, 50 health, 50 stamina
                const penaltyMoney = amount;
                let healthLoss = 50;
                let staminaLoss = 50;

                if (wl >= 3) {
                    healthLoss = Math.floor(currentHealth * 0.8);
                    staminaLoss = Math.floor(currentStamina * 0.8);
                }

                await dbManager.removeMoney(author.id, penaltyMoney);
                const newHealth = Math.max(0, currentHealth - healthLoss);
                const newStamina = Math.max(0, currentStamina - staminaLoss);
                await rpgManager.updateStats(author.id, newHealth, newStamina);

                embed.setTitle('Crime Went Horribly!')
                    .setDescription(`${getRandom(CrimeWorse)}\n\nYou lost **${penaltyMoney.toLocaleString()}${CURRENCY_EMOJI}**, **${healthLoss} HP**, and **${staminaLoss} Stamina**!`)
                    .setColor('#DC2626');
            }

            // Increase Wanted Level
            await rpgManager.updateWantedLevel(author.id, 1);

            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error occurred while committing crime:', error);
            message.reply('An error occurred while executing the command.');
        }
    }
}
