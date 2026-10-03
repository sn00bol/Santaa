const { Agent } = require('undici');
const { Client, IntentsBitField, Partials } = require('discord.js');

function createDiscordClient() {
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

    client.httpAgent = discordHttpAgent;
    return client;
}

module.exports = { createDiscordClient };
