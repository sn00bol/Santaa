const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getCommandUser,
    replyToCommand,
    sendCommandMessage,
} = require('./commandInteraction');
const { buildSlashCommand } = require('./slashCommand');
const pvp = require('../PVP/pvp');
const { registerCommandHandlers } = require('../../handlers/commandHandler');
const { EventEmitter } = require('node:events');

function createInteraction({ deferred = false, replied = false } = {}) {
    const calls = [];
    const response = {
        createdTimestamp: Date.now(),
        edit: async content => calls.push(['edit', content]),
    };
    const interaction = {
        user: { id: '123' },
        deferred,
        replied,
        calls,
        channel: { send: async payload => {
            calls.push(['channel.send', payload]);
            return response;
        } },
        reply: async payload => {
            calls.push(['reply', payload]);
            interaction.replied = true;
            return response;
        },
        editReply: async payload => {
            calls.push(['editReply', payload]);
            return response;
        },
        followUp: async payload => {
            calls.push(['followUp', payload]);
            return response;
        },
        fetchReply: async () => response,
        isChatInputCommand: () => true,
    };
    return interaction;
}

test('slash responses use the native interaction lifecycle', async () => {
    const interaction = createInteraction();
    assert.equal(getCommandUser(interaction), interaction.user);

    await replyToCommand(interaction, 'first response');
    await replyToCommand(interaction, 'next response');

    assert.equal(interaction.calls[0][0], 'reply');
    assert.equal(interaction.calls[0][1].content, 'first response');
    assert.equal(interaction.calls[0][1].fetchReply, true);
    assert.deepEqual(interaction.calls[1], ['followUp', { content: 'next response', fetchReply: true }]);
});

test('deferred slash responses edit the initial response then follow up', async () => {
    const interaction = createInteraction({ deferred: true });

    await replyToCommand(interaction, { content: 'initial', ephemeral: true });
    await replyToCommand(interaction, 'later');

    assert.equal(interaction.calls[0][0], 'editReply');
    assert.deepEqual(interaction.calls[0][1], { content: 'initial', ephemeral: true });
    assert.deepEqual(interaction.calls[1], ['followUp', { content: 'later', fetchReply: true }]);
});

test('component commands receive a fetched initial interaction response', async () => {
    const interaction = createInteraction();
    const first = await sendCommandMessage(interaction, { content: 'open menu' });
    const later = await sendCommandMessage(interaction, { content: 'another public message' });

    assert.equal(first.createdTimestamp > 0, true);
    assert.equal(later.createdTimestamp > 0, true);
    assert.equal(interaction.calls[0][0], 'reply');
    assert.equal(interaction.calls[1][0], 'channel.send');
});

test('prefix message responses remain unchanged', async () => {
    const calls = [];
    const message = {
        author: { id: '456' },
        reply: async payload => calls.push(['reply', payload]),
        channel: { send: async payload => calls.push(['send', payload]) },
    };

    assert.equal(getCommandUser(message), message.author);
    await replyToCommand(message, 'prefix reply');
    await sendCommandMessage(message, 'prefix send');
    assert.deepEqual(calls, [['reply', 'prefix reply'], ['send', 'prefix send']]);
});

test('slash registration publishes PvP user and boss options as native options', () => {
    const definition = buildSlashCommand(pvp);

    assert.deepEqual(definition.options.map(option => [option.name, option.type]), [
        ['target', 6],
        ['mode', 3],
        ['boss', 3],
    ]);
});

test('commands read native slash option getters directly', async () => {
    const interaction = createInteraction();
    interaction.options = {
        getUser: name => name === 'target' ? null : null,
        getString: name => name === 'mode' || name === 'boss' ? null : null,
    };
    interaction.client = {};

    await pvp.execute(interaction);

    assert.equal(interaction.calls[0][0], 'reply');
    assert.match(interaction.calls[0][1].content, /mention a user to challenge/i);
});

test('slash dispatch invokes the command with the original interaction', async () => {
    const client = new EventEmitter();
    client.db = {
        ensureDefaultUserSettings: async () => {},
        recordUserActivity: async () => {},
    };
    client.ws = { ping: 12 };
    const activeCommands = new Set();
    registerCommandHandlers(client, { isShuttingDown: false }, activeCommands);

    const response = {
        createdTimestamp: Date.now(),
        edit: async content => response.editedContent = content,
    };
    const interaction = {
        commandName: 'ping',
        user: { id: '123', bot: false },
        createdTimestamp: Date.now(),
        guild: {},
        client,
        isChatInputCommand: () => true,
        reply: async payload => {
            interaction.replyPayload = payload;
            interaction.replied = true;
            return response;
        },
        followUp: async payload => payload,
        options: {},
    };

    await client.listeners('interactionCreate')[0](interaction);

    assert.equal(interaction.replyPayload.fetchReply, true);
    assert.match(response.editedContent, /\*\*Pong!\*\*/);
    assert.equal(Object.hasOwn(interaction, 'author'), false);
    assert.equal(activeCommands.size, 0);
});
