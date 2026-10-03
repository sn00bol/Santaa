const { EmbedBuilder } = require('discord.js');
const { replyToCommand } = require('./commandInteraction');

const MONEY_MAKING_COMMANDS = ['job', 'parttime', 'fish', 'mine', 'beg', 'daily', 'crime', 'steal'];

module.exports = {
    /**
     * Checks if a user can use a command based on their Wanted Level.
     * Applies HP/Stamina penalties if applicable.
     * @returns {Promise<{ allowed: boolean, message?: string, handled?: boolean }>}
     */
    async checkWantedRestrictions(userId, commandName, client, interactionOrMessage) {
        const rpgmanager = client.rpg || (client.db ? require('../../../database/rpgmanager') : null);
        if (!rpgmanager) return { allowed: true }; // Fallback

        const stats = await rpgmanager.getStats(userId);
        const wl = Math.floor((stats.wanted_level || 0) / 5);

        if (wl === 0) return { allowed: true };

        let blocked = false;
        let penaltyChance = 0;
        let blockMessage = '';

        // Check blocks based on levels
        if (wl >= 1 && commandName === 'job') {
            blocked = true;
            blockMessage = 'You are a wanted criminal (Wanted Level 1+). You cannot take legitimate jobs!';
        }
        if (wl >= 2 && commandName === 'parttime') {
            blocked = true;
            blockMessage = 'You are a wanted criminal (Wanted Level 2+). You cannot even do part-time work!';
        }
        if (wl >= 2 && commandName === 'fish') {
            blocked = true;
            blockMessage = 'The coast guard is patrolling! (Wanted Level 2+). You cannot fish.';
        }
        if (wl >= 6 && MONEY_MAKING_COMMANDS.includes(commandName) && !['crime', 'steal'].includes(commandName)) {
            blocked = true;
            blockMessage = 'Your Wanted Level is MAX (Level 6)! All your money-making activities are blocked. You must wait 1 day for the heat to die down.';
        }

        // Determine penalty chances
        if (wl >= 4 && (commandName === 'job' || commandName === 'parttime')) {
            penaltyChance = 100; // "stubbornly using jobs/parttime"
        } else if (wl >= 5 && MONEY_MAKING_COMMANDS.includes(commandName)) {
            penaltyChance = 50; // 50% chance for penalty on any money making command
        }

        // Apply penalty if triggered
        if (penaltyChance > 0) {
            const roll = Math.floor(Math.random() * 100) + 1;
            if (roll <= penaltyChance) {
                const currentHealth = stats.health;
                const currentStamina = stats.stamina;
                const newHealth = Math.max(0, currentHealth - 30);
                const newStamina = Math.max(0, currentStamina - 30);
                await rpgmanager.updateStats(userId, newHealth, newStamina);
                
                const penaltyEmbed = new EmbedBuilder()
                    .setTitle('Wanted Criminal Penalty!')
                    .setDescription(`You attracted too much attention from the authorities! You lost **30 HP** and **30 Stamina**!`)
                    .setColor('#DC2626');
                
                let replied = false;
                if (interactionOrMessage && typeof interactionOrMessage.reply === 'function') {
                    const content = blockMessage ? `**${blockMessage}**` : '';
                    await replyToCommand(interactionOrMessage, { content: content || null, embeds: [penaltyEmbed] });
                    replied = true;
                }

                if (blocked) {
                    return { allowed: false, handled: replied, message: blockMessage };
                }
            }
        }

        if (blocked) {
            return { allowed: false, message: blockMessage };
        }

        return { allowed: true };
    }
};
