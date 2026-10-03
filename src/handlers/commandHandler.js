const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { performance } = require('node:perf_hooks');
const { isOwner } = require('../commands/Utils/permission');

// Avoid requiring helper/data modules; command modules declare both fields at the top level.
const COMMAND_NAME_DECLARATION = /^[\t ]{0,12}name\s*:/m;
const COMMAND_EXECUTE_DECLARATION = /^[\t ]{0,12}(?:async\s+)?execute\s*(?:\(|:)/m;

function getCommandFiles(dir, stats) {
    if (!fs.existsSync(dir)) return [];

    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getCommandFiles(fullPath, stats));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            stats.scanned++;
            try {
                const source = fs.readFileSync(fullPath, 'utf8');
                if (COMMAND_NAME_DECLARATION.test(source) && COMMAND_EXECUTE_DECLARATION.test(source)) {
                    results.push(fullPath);
                } else {
                    stats.filtered++;
                }
            } catch (error) {
                stats.failed++;
                console.error(`[COMMAND] Failed to inspect ${fullPath}:`, error);
            }
        }
    }
    return results;
}

function loadCommands(client) {
    const startedAt = performance.now();
    client.commands = new Collection();
    client.aliases = new Collection();
    client.blockedCommands = new Set();
    const stats = { scanned: 0, filtered: 0, failed: 0, loaded: 0 };

    for (const folder of ['commands', 'minigames', 'memes']) {
        const folderPath = path.join(__dirname, '..', folder);
        for (const filePath of getCommandFiles(folderPath, stats)) {
            try {
                const command = require(filePath);
                if (!command || typeof command !== 'object' ||
                    typeof command.name !== 'string' ||
                    typeof command.execute !== 'function') {
                    continue;
                }

                stats.loaded++;
                client.commands.set(command.name, command);
                if (!Array.isArray(command.aliases)) continue;

                for (const rawAlias of command.aliases) {
                    const alias = String(rawAlias).toLowerCase();
                    if (alias && !client.commands.has(alias) && !client.aliases.has(alias)) {
                        client.aliases.set(alias, command);
                    }
                }
            } catch (error) {
                stats.failed++;
                console.error(`[COMMAND] Failed to load command file ${filePath}:`, error);
            }
        }
    }

    const elapsedMs = (performance.now() - startedAt).toFixed(1);
    // console.log(`[COMMAND] Loaded ${stats.loaded} commands; scanned ${stats.scanned} files, ` +`filtered ${stats.filtered}, failed ${stats.failed}, in ${elapsedMs}ms.`);
}

async function runCommand(client, command, context, args) {
    const user = context.user || context.author;
    try {
        await client.db.ensureDefaultUserSettings(user.id);
    } catch (error) {
        console.error('[SETTINGS] Failed to apply user settings:', error);
    }

    client.db.recordUserActivity(user.id).catch(error => {
        console.error('[ACTIVITY] Failed to record command usage:', error);
    });

    const isOwnerOnly = Array.isArray(command.category)
        ? command.category.includes('owner')
        : command.category === 'owner';

    if (isOwnerOnly && !isOwner(user.id)) {
        if (context.isChatInputCommand?.()) {
            return context.reply({ content: "ONLY OWNER'S BOT CAN USE THIS COMMAND.", ephemeral: true });
        }
        return context.reply("ONLY OWNER'S BOT CAN USE THIS COMMAND.");
    }

    if (client.blockedCommands.has(command.name)) {
        const blockedMessage = 'This command currently blocked due to a bugs or crashing, will fix it fast as possible';
        if (context.isChatInputCommand?.()) {
            return context.reply({ content: blockedMessage, ephemeral: true });
        }
        return context.reply(blockedMessage);
    }

    try {
        if (context.isChatInputCommand?.()) {
            if (command.deferReply && !context.deferred && !context.replied) {
                await context.deferReply();
            }
            await command.execute(context);
        } else {
            await command.execute(context, args);
        }
    } catch (error) {
        console.error(`[ERROR] Command '${command.name}' failed and is now blocked:`, error);
        client.blockedCommands.add(command.name);
        const errorMessage = 'This command currently blocked due to a bugs or crashing, will fix it fast as possible';
        if (context.isChatInputCommand?.()) {
            if (context.deferred) {
                await context.editReply({ content: errorMessage, embeds: [], components: [] });
            } else if (context.replied) {
                await context.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await context.reply({ content: errorMessage, ephemeral: true });
            }
        } else {
            await context.reply(errorMessage);
        }
    }
}

function trackCommand(client, activeCommands, command, context, args) {
    const commandPromise = runCommand(client, command, context, args);
    activeCommands.add(commandPromise);
    return commandPromise.finally(() => activeCommands.delete(commandPromise));
}

function registerCommandHandlers(client, state, activeCommands) {
    loadCommands(client);
    const prefix = process.env.PFX;

    client.on('messageCreate', async message => {
        if (state.isShuttingDown || !message.content.startsWith(prefix) || message.author.bot) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        const command = client.commands.get(commandName) || client.aliases.get(commandName);
        if (command && (message.guild || command.DMs !== false)) {
            await trackCommand(client, activeCommands, command, message, args);
        }
    });

    client.on('interactionCreate', async interaction => {
        if (state.isShuttingDown || !interaction.isChatInputCommand() || interaction.user.bot) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) {
            return interaction.reply({ content: 'This slash command is no longer available.', ephemeral: true });
        }
        if (!interaction.guild && command.DMs === false) {
            return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }
        await trackCommand(client, activeCommands, command, interaction);
    });
}

module.exports = { loadCommands, registerCommandHandlers };
