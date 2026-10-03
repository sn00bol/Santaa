// RUNNING BOT: npm run start (for regular use) or npm run dev (with nodemon for auto-restart on changes)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Agent } = require('undici');
const { Client, IntentsBitField, Partials, Collection, ActivityType } = require('discord.js');
const dbmanager = require('../database/dbmanager');
const rpgmanager = require('../database/rpgmanager');
const { isOwner } = require('./commands/Utils/permission');
const { createInteractionMessage, getInteractionArgs } = require('./commands/Utils/slashCommand');
const { initUpdater } = require('./scripts/updater');
const notifi = require('./commands/Utils/notifi');
const { retryWithBackoff } = require('./commands/Utils/retry');

const discordHttpAgent = new Agent({
    connectTimeout: 30_000,
    headersTimeout: 30_000,
    bodyTimeout: 30_000,
});

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.DirectMessages,
        IntentsBitField.Flags.MessageContent,
    ],
    partials: [Partials.Channel],
    rest: {
        agent: discordHttpAgent,
        timeout: 30_000,
        retries: 5,
    },
});

let databasesReady = false;
let isShuttingDown = false;
let presenceInterval = null;
let shutdownPromise = null;
const activeCommands = new Set();

const healthServer = process.env.ENABLE_DOCKER_HEALTHCHECK === 'true'
    ? http.createServer((request, response) => {
        if (request.method !== 'GET' || request.url !== '/health') {
            response.writeHead(404).end();
            return;
        }

        const isReady = databasesReady && client.isReady() && !isShuttingDown;
        response.writeHead(isReady ? 200 : 503, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(isReady ? 'ready' : 'not ready');
    }).listen(Number(process.env.HEALTHCHECK_PORT) || 3000, '127.0.0.1')
    : null;

healthServer?.on('error', error => {
    console.error('[HEALTH] Healthcheck server failed:', error);
});

function shutdown(signal) {
    if (shutdownPromise) return shutdownPromise;
    isShuttingDown = true;
    databasesReady = false;
    console.log(`[SHUTDOWN] Received ${signal}; closing bot resources.`);

    if (presenceInterval) clearInterval(presenceInterval);

    shutdownPromise = (async () => {
        const pendingCommands = Promise.allSettled([...activeCommands]);
        const healthServerClosed = healthServer && healthServer.listening
            ? new Promise(resolve => healthServer.close(resolve))
            : Promise.resolve();
        const commandResults = await Promise.allSettled([
            pendingCommands,
            healthServerClosed,
        ]);
        client.destroy();
        const serviceResults = await Promise.allSettled([discordHttpAgent.close()]);
        const databaseResults = await Promise.allSettled([
            dbmanager.close(),
            rpgmanager.close(),
        ]);
        const failures = [...commandResults, ...serviceResults, ...databaseResults]
            .filter(result => result.status === 'rejected');
        if (failures.length > 0) {
            failures.forEach(result => console.error('[SHUTDOWN] Resource close failed:', result.reason));
            process.exitCode = 1;
        }
    })();

    return shutdownPromise;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        shutdown(signal).catch(error => {
            console.error('[SHUTDOWN] Failed to stop cleanly:', error);
            process.exitCode = 1;
        });
    });
}

// Command management
const pfx = process.env.PFX;
client.commands = new Collection();
client.aliases = new Collection();
client.blockedCommands = new Set();

function getFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];

    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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
    for (const filePath of getFilesRecursive(folderPath)) {
        try {
            const command = require(filePath);
            if (!command || typeof command !== 'object' || typeof command.name !== 'string' || typeof command.execute !== 'function') {
                continue;
            }

            client.commands.set(command.name, command);
            if (!Array.isArray(command.aliases)) continue;

            for (const rawAlias of command.aliases) {
                const alias = String(rawAlias).toLowerCase();
                if (alias && !client.commands.has(alias) && !client.aliases.has(alias)) {
                    client.aliases.set(alias, command);
                }
            }
        } catch (error) {
            console.error(`Failed to load command file ${filePath}:`, error);
        }
    }
});

async function runCommand(command, context, args) {
    try {
        await client.db.ensureDefaultUserSettings(context.author.id);
    } catch (error) {
        console.error('[SETTINGS] Failed to apply user settings:', error);
    }

    client.db.recordUserActivity(context.author.id).catch(error => {
        console.error('[ACTIVITY] Failed to record command usage:', error);
    });

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

async function runTrackedCommand(command, context, args) {
    const commandPromise = runCommand(command, context, args);
    activeCommands.add(commandPromise);
    try {
        await commandPromise;
    } finally {
        activeCommands.delete(commandPromise);
    }
}

client.on('messageCreate', async (message) => {
    if (isShuttingDown || !message.content.startsWith(pfx) || message.author.bot) return;

    const args = message.content.slice(pfx.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName) || client.aliases.get(commandName);
    if (command && (message.guild || command.DMs !== false)) {
        await runTrackedCommand(command, message, args);
    }
});

client.on('interactionCreate', async interaction => {
    if (isShuttingDown || !interaction.isChatInputCommand() || interaction.user.bot) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    if (!interaction.guild && command.DMs === false) return;
    if (command.deferReply && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    const args = getInteractionArgs(interaction, command);
    const message = await createInteractionMessage(interaction, args, pfx, command);
    await runTrackedCommand(command, message, args);
});

client.once('clientReady', () => {
    notifi.startNotifications(client);
});

// Connecting database
async function connectData() {
    try {
        await Promise.all([
            dbmanager.init(),
            rpgmanager.init()
        ]);

        if (isShuttingDown) {
            await Promise.allSettled([dbmanager.close(), rpgmanager.close()]);
            return;
        }

        client.db = dbmanager;
        client.rpg = rpgmanager;
        databasesReady = true;

        await retryWithBackoff(() => client.login(process.env.DISCORD_BOT_API_KEY), {
            initialDelayMs: 5_000,
            maxDelayMs: 60_000,
            shouldRetry: error => !isShuttingDown && ![
                'TokenInvalid',
                'TokenMissing',
            ].includes(error.code) && error.status !== 401,
            onRetry: (error, attempt, delayMs) => {
                console.error(`[LOGIN] Discord connection attempt ${attempt} failed: ${error.message}`);
                console.warn(`[LOGIN] Retrying in ${Math.ceil(delayMs / 1000)} seconds.`);
            },
        });

        if (isShuttingDown) return;

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
        presenceInterval = setInterval(updateStatus, 5 * 60 * 1000);

    } catch (error) {
        if (isShuttingDown) return;
        console.error('Error initializing bot:', error);
        process.exit(1);
    }
}

connectData();

// Initiating Auto-Updater
initUpdater(client);