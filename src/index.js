// RUNNING BOT: npm run start (for regular use) or npm run dev (with nodemon for auto-restart on changes)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, IntentsBitField, Partials, Collection, ActivityType } = require('discord.js');
const dbmanager = require('../database/dbmanager');
const rpgmanager = require('../database/rpgmanager');
const { isOwner } = require('./commands/Utils/permission');
const {
    buildSlashCommand,
    createInteractionMessage,
    getInteractionArgs,
    getSlashCommandSignature,
    getSlashCommandValidationError,
} = require('./commands/Utils/slashCommand');
const { initUpdater } = require('./scripts/updater');

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.DirectMessages,
        IntentsBitField.Flags.MessageContent,
    ],
    partials: [Partials.Channel],
});

// Command management
const pfx = process.env.PFX;
client.commands = new Collection();
client.aliases = new Collection();
client.blockedCommands = new Set();

function getFilesRecursive(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getFilesRecursive(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

const commandFolders = ['commands', 'minigames', 'memes'];

commandFolders.forEach(folder => {
    const folderPath = path.join(__dirname, folder);
    const cmdFiles = getFilesRecursive(folderPath);

    for (const filePath of cmdFiles) {
        try {
            const cmd = require(filePath);

            if (cmd && typeof cmd === 'object' && 'name' in cmd && typeof cmd.execute === 'function') {
                client.commands.set(cmd.name, cmd);

                if (Array.isArray(cmd.aliases)) {
                    for (const rawAlias of cmd.aliases) {
                        const alias = String(rawAlias).toLowerCase();
                        if (alias && !client.commands.has(alias) && !client.aliases.has(alias)) {
                            client.aliases.set(alias, cmd);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to load command file ${filePath}:`, error);
        }
    }
});

async function runCommand(command, context, args) {
    const isOwnerOnly = Array.isArray(command.category)
        ? command.category.includes('owner')
        : command.category === 'owner';

    if (isOwnerOnly && !isOwner(context.author.id)) {
        return context.reply("ONLY OWNER'S BOT CAN USE THIS COMMAND.");
    }

    if (client.blockedCommands.has(command.name)) {
        return context.reply('This command currently blocked due to a bugs or crashing, will fix it fast as possible');
    }

    try {
        await command.execute(context, args);
    } catch (error) {
        console.error(`[ERROR] Command '${command.name}' failed and is now blocked:`, error);
        client.blockedCommands.add(command.name);
        context.reply('This command currently blocked due to a bugs or crashing, will fix it fast as possible');
    }
}

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(pfx) || message.author.bot) return;

    const args = message.content.slice(pfx.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName) || client.aliases.get(commandName);
    if (command && (message.guild || command.DMs !== false)) {
        await runCommand(command, message, args);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.user.bot) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    if (!interaction.guild && command.DMs === false) return;
    if (command.deferReply && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    const args = getInteractionArgs(interaction, command);
    const message = await createInteractionMessage(interaction, args, pfx);
    await runCommand(command, message, args);
});

client.once('ready', async () => {
    try {
        const slashCommands = [];
        for (const command of client.commands.values()) {
            const validationError = getSlashCommandValidationError(command);
            if (validationError) {
                if (command.show !== false) {
                    console.warn(`[SLASH] Skipping '${command.name || 'unknown'}': ${validationError}.`);
                }
                continue;
            }
            slashCommands.push({ command, data: buildSlashCommand(command) });
        }

        const guildId = process.env.SLASH_GUILD_ID;
        const commandManager = client.application.commands;
        const registeredCommands = await commandManager.fetch(guildId ? { guildId } : undefined);
        const shouldReset = /^(true|1|yes)$/i.test(process.env.SLASH_RESET || '');
        let created = 0;
        let updated = 0;

        if (shouldReset) {
            for (const registered of registeredCommands.values()) {
                await commandManager.delete(registered.id, guildId);
            }
            registeredCommands.clear();
            console.log(`[SLASH] Reset ${guildId ? `guild ${guildId}` : 'global'} commands`);
        }

        for (const { command, data } of slashCommands) {
            const registered = registeredCommands.find(item => item.name === data.name);
            if (!registered) {
                await commandManager.create(data, guildId);
                created += 1;
                continue;
            }

            if (getSlashCommandSignature(registered) !== getSlashCommandSignature(data)) {
                await commandManager.edit(registered.id, data);
                updated += 1;
            }
        }

        console.log(`[SLASH] Checked ${slashCommands.length} commands${guildId ? ` in guild ${guildId}` : ' globally'}: ${created} created, ${updated} updated.`);
    } catch (error) {
        console.error('[SLASH] Failed to register commands:', error);
    }
});

// Connecting database
async function connectData() {
    try {
        await Promise.all([
            dbmanager.init(),
            rpgmanager.init()
        ]);

        client.db = dbmanager;
        client.rpg = rpgmanager;

        await client.login(process.env.DISCORD_BOT_API_KEY);

        const updateStatus = () => {
            const serverCount = client.guilds.cache.size;
            client.user.setPresence({
                status: 'online',
                activities: [{
                    name: `Serving ${serverCount} servers!`,
                    type: ActivityType.Streaming,
                    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
                }]
            });
        };

        updateStatus();
        setInterval(updateStatus, 5 * 60 * 1000);

    } catch (error) {
        console.error('Error initializing bot:', error);
        process.exit(1);
    }
}

connectData();

// Initiating Auto-Updater
initUpdater();