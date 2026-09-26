// This file contains utility functions for registering and handling slash commands in a Discord bot using discord.js, it literrally a scripts

const { Collection, SlashCommandBuilder } = require('discord.js');

function getSlashCommandValidationError(command) {
    if (!command || typeof command !== 'object') return 'command must be an object';
    if (typeof command.name !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(command.name)) {
        return 'name must contain only lowercase letters, numbers, underscores, or hyphens';
    }
    if (typeof command.execute !== 'function') return 'execute must be a function';
    if (command.show === false) return 'command is hidden';

    if (command.args !== undefined) {
        if (!Array.isArray(command.args) || command.args.length > 25) {
            return 'args must be an array with no more than 25 options';
        }

        const names = new Set();
        const supportedTypes = new Set(['string', 'integer', 'number', 'boolean', 'user']);
        for (const arg of command.args) {
            if (!arg || typeof arg.name !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(arg.name)) {
                return 'every arg needs a valid lowercase name';
            }
            if (names.has(arg.name)) return `duplicate arg name '${arg.name}'`;
            if (!supportedTypes.has(arg.type || 'string')) return `unsupported arg type '${arg.type}'`;
            names.add(arg.name);
        }
    }

    return null;
}

function buildSlashCommand(command) {
    const description = String(command.description || `Run the ${command.name} command.`).slice(0, 100);
    const slashArgs = Array.isArray(command.args) ? command.args : [];

    const builder = new SlashCommandBuilder()
        .setName(command.name.toLowerCase())
        .setDescription(description)
            .setDMPermission(command.DMs !== false);

    for (const arg of [...slashArgs].sort((first, second) => Number(second.required) - Number(first.required))) {
        const optionType = arg.type || 'string';
        const addOption = {
            string: 'addStringOption',
            integer: 'addIntegerOption',
            number: 'addNumberOption',
            boolean: 'addBooleanOption',
            user: 'addUserOption',
        }[optionType];

        if (!addOption) continue;

        builder[addOption](option => option
            .setName(arg.name)
            .setDescription(String(arg.description || `The ${arg.name} argument.`).slice(0, 100))
            .setRequired(Boolean(arg.required)));
    }

    return builder.toJSON();
}

function getSlashCommandSignature(command) {
    const definition = typeof command.toJSON === 'function' ? command.toJSON() : command;
    const ignoredDefaults = new Set(['required', 'autocomplete', 'nsfw', 'dm_permission']);

    const normalize = (value) => {
        if (Array.isArray(value)) return value.map(normalize);
        if (!value || typeof value !== 'object') return value;

        const normalized = {};
        for (const key of Object.keys(value).sort()) {
            const entry = value[key];
            if (entry === undefined || entry === null) continue;
            if (ignoredDefaults.has(key) && entry === (key === 'dm_permission')) continue;
            if (key === 'integration_types' && Array.isArray(entry) && entry.length === 2 && entry[0] === 0 && entry[1] === 1) continue;
            if (key === 'options' && Array.isArray(entry) && entry.length === 0) continue;
            if (key === 'id' || key === 'application_id' || key === 'version') continue;
            normalized[key] = normalize(entry);
        }
        return normalized;
    };

    return JSON.stringify(normalize(definition));
}

function getInteractionArgs(interaction, command) {
    const slashArgs = Array.isArray(command.args) ? command.args : [];
    const args = [];

    for (const arg of slashArgs) {
        if (arg.type === 'user') {
            const user = interaction.options.getUser(arg.name);
            if (user) args.push(`<@${user.id}>`);
        } else {
            const option = interaction.options.get(arg.name);
            if (option) args.push(String(option.value));
        }
    }

    return args;
}

async function createInteractionMessage(interaction, args, prefix, command = {}) {
    const mentions = new Collection();
    const mentionIds = new Set();
    const slashOptions = {};

    for (const arg of Array.isArray(command.args) ? command.args : []) {
        const option = interaction.options.get(arg.name);
        if (option) slashOptions[arg.name] = option.value;
    }

    for (const arg of args) {
        const match = arg.match(/^<@!?(\d{17,20})>$/) || arg.match(/^(\d{17,20})$/);
        if (!match || mentionIds.has(match[1])) continue;

        const user = await interaction.client.users.fetch(match[1]).catch(() => null);
        if (user) {
            mentionIds.add(user.id);
            mentions.set(user.id, user);
        }
    }

    const send = async payload => {
        const normalized = typeof payload === 'string' ? { content: payload } : { ...payload };
        if (!interaction.replied) {
            if (interaction.deferred) {
                await interaction.editReply(normalized);
            } else {
                await interaction.reply(normalized);
            }
            return interaction.fetchReply();
        }
        return interaction.followUp(normalized);
    };

    const channel = {
        send,
        awaitMessages: (...channelArgs) => interaction.channel.awaitMessages(...channelArgs),
    };

    return {
        author: interaction.user,
        client: interaction.client,
        channel,
        content: `${prefix}${interaction.commandName}${args.length ? ` ${args.join(' ')}` : ''}`,
        guild: interaction.guild,
        member: interaction.member,
        slashOptions,
        mentions: { users: mentions },
        reply: send,
    };
}

module.exports = {
    buildSlashCommand,
    createInteractionMessage,
    getSlashCommandSignature,
    getSlashCommandValidationError,
    getInteractionArgs,
};