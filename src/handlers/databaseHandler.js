const { retryWithBackoff } = require('../commands/Utils/retry');

async function connectData(client, state, dbmanager, rpgmanager) {
    try {
        await Promise.all([
            dbmanager.init(),
            rpgmanager.init(),
        ]);

        if (state.isShuttingDown) {
            await Promise.allSettled([dbmanager.close(), rpgmanager.close()]);
            return;
        }

        client.db = dbmanager;
        client.rpg = rpgmanager;
        state.databasesReady = true;

        await retryWithBackoff(() => client.login(process.env.DISCORD_BOT_API_KEY), {
            initialDelayMs: 5_000,
            maxDelayMs: 60_000,
            shouldRetry: error => !state.isShuttingDown && ![
                'TokenInvalid',
                'TokenMissing',
            ].includes(error.code) && error.status !== 401,
            onRetry: (error, attempt, delayMs) => {
                console.error(`[LOGIN] Discord connection attempt ${attempt} failed: ${error.message}`);
                console.warn(`[LOGIN] Retrying in ${Math.ceil(delayMs / 1000)} seconds.`);
            },
        });
    } catch (error) {
        if (state.isShuttingDown) return;
        console.error('Error initializing bot:', error);
        process.exit(1);
    }
}

module.exports = { connectData };
