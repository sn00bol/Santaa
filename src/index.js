// RUNNING BOT: npm run start (for regular use) or npm run dev (with nodemon for auto-restart on changes)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, IntentsBitField, Collection, ActivityType } = require('discord.js');
const dbmanager = require('../database/dbmanager'); // Import the database manager module
const rpgmanager = require('../database/rpgmanager');
const { isOwner } = require('./commands/Utils/permission');

// some flag u shouldnt care fr
const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ],
});

// Command management
const pfx = process.env.PFX;
client.commands = new Collection();
client.aliases = new Collection();

// Function to recursively get all .js files in the commands directory and its subdirectories
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

// Listen for messages
client.on('messageCreate', (message) => {
    if (!message.content.startsWith(pfx) || message.author.bot) return;

    const args = message.content.slice(pfx.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName) || client.aliases.get(commandName);
    if (!command) return;

    // Function checking owner only
    const isOwnerOnly = Array.isArray(command.category)
        ? (command.category.includes('owner') && command.category.every(cat => cat === 'owner'))
        : command.category === 'owner';

    if (isOwnerOnly && !isOwner(message.author.id)) {
        return message.reply("ONLY OWNER'S BOT CAN USE THIS COMMAND.");
    }

    try {
        command.execute(message, args);
    } catch (error) {
        console.error(error);
        message.reply('There was an error trying to execute that command!');
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