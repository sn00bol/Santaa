const { EmbedBuilder } = require('discord.js');
const { checkCooldown } = require('../Utils/Cooldown');
const { StealSuccess, StealFail, StealBusted } = require('../Utils/misc');
const { CURRENCY_EMOJI } = require('../Utils/config');
const { checkWantedRestrictions } = require('../Utils/WantedLevel');

const MIN_TARGET_BALANCE = 50; // target must have at least this much to be steal-able

module.exports = {
    name: 'steal',
    description: 'You so broke that begging aint work so you try attempt to steal money from another user\'s wallet (Zsteal @user)',
    category: 'eco',
    usage: 'Zsteal (optional: `@user`)',
    async execute(message) {
        const { author } = message;
        const dbManager = message.client.db;
        const rpgManager = message.client.rpg;

        // ── Target validation ──────────────────────────────────────────────
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('You must mention a user to steal from. Example: Zsteal `@user`');
        }
        if (targetUser.id === author.id) {
            return message.reply('You can\'t steal from yourself, that\'s just called losing money.');
        }
        if (targetUser.bot) {
            return message.reply('Bots don\'t carry wallets. Nice try though.');
        }

        // ── Cooldown ───────────────────────────────────────────────────────
        const timeLeft = checkCooldown(author.id, this.name);
        if (timeLeft) {
            return message.reply(`Please wait **${timeLeft}** before attempting to steal again.`);
        }

        const wantedCheck = await checkWantedRestrictions(author.id, this.name, message.client, message);
        if (!wantedCheck.allowed) {
            if (!wantedCheck.handled && wantedCheck.message) {
                message.reply(wantedCheck.message);
            }
            return;
        }

        try {
            // ── Check target balance ──────────────────────────────────────
            const targetData = await dbManager.getUser(targetUser.id);
            if (targetData.balance < MIN_TARGET_BALANCE) {
                return message.reply(
                    `${targetUser.username} is too broke to steal from. (Needs at least **${MIN_TARGET_BALANCE}${CURRENCY_EMOJI}** in wallet)`
                );
            }

            // ── Outcome roll ──────────────────────────────────────────────
            const authorStats = await rpgManager.getStats(author.id);
            const wl = Math.floor((authorStats.wanted_level || 0) / 5);

            const roll = Math.floor(Math.random() * 100) + 1;
            let successChance = 30;
            if (wl === 2) successChance = 25;
            else if (wl === 3) successChance = 20;
            else if (wl >= 4 && wl < 6) successChance = 10;
            else if (wl >= 6) successChance = 1;

            let failChance = 40;
            // 30% success, 40% fail, 30% busted normally
            let outcome;
            if (roll <= successChance) outcome = 'success';
            else if (roll <= successChance + failChance) outcome = 'fail';
            else outcome = 'busted';

            const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
            const embed = new EmbedBuilder()
                .setAuthor({ name: author.username, iconURL: author.displayAvatarURL() });

            if (outcome === 'success') {
                // Steal 10–25% of target balance, capped at $500
                const pct = (Math.floor(Math.random() * 16) + 10) / 100; // 0.10 – 0.25
                const stolen = Math.min(500, Math.max(1, Math.floor(targetData.balance * pct)));

                await dbManager.removeMoney(targetUser.id, stolen);
                await dbManager.addMoney(author.id, stolen, { trackEarning: false });
                const currentSteals = Number((await rpgManager.getStats(author.id)).steals || 0);
                await rpgManager.updateProgress(author.id, { steals: currentSteals + 1 });

                embed
                    .setTitle('Steal Successful!')
                    .setDescription(
                        `${getRandom(StealSuccess)}\n\n` +
                        `You swiped **${stolen.toLocaleString()}${CURRENCY_EMOJI}** from ${targetUser}!`
                    )
                    .setColor('#16A34A');

            } else if (outcome === 'fail') {
                embed
                    .setTitle('Steal Failed')
                    .setDescription(
                        `${getRandom(StealFail)}\n\n` +
                        `You didn't get anything from ${targetUser} this time.`
                    );

            } else {
                // Busted — lose 10–20% of own wallet + 15 stamina (or 80% stats if WL >= 3)
                const selfData = await dbManager.getUser(author.id);
                const pct = (Math.floor(Math.random() * 11) + 10) / 100; // 0.10 – 0.20
                const fine = Math.min(selfData.balance, Math.max(1, Math.floor(selfData.balance * pct)));

                if (fine > 0) await dbManager.removeMoney(author.id, fine);

                // Penalty
                const stats = await rpgManager.getStats(author.id);
                let newHealth = stats.health;
                let newStamina = Math.max(0, stats.stamina - 15);
                let penaltyText = `lost **15 Stamina**`;

                if (wl >= 3) {
                    newHealth = Math.floor(stats.health * 0.2); // 80% loss means remaining is 20%
                    newStamina = Math.floor(stats.stamina * 0.2);
                    penaltyText = `lost **80% of your HP and Stamina**`;
                }

                await rpgManager.updateStats(author.id, newHealth, newStamina);

                embed
                    .setTitle('Caught Red-Handed!')
                    .setDescription(
                        `${getRandom(StealBusted)}\n\n` +
                        `You were punished **${fine.toLocaleString()}** and ${penaltyText}.`
                    )
                    .setColor('#DC2626');
            }

            // Increase Wanted Level
            await rpgManager.updateWantedLevel(author.id, 1);

            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error in steal command:', error);
            message.reply('An error occurred while executing the steal command.');
        }
    }
};
