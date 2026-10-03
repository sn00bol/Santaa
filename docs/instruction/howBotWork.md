# How the Bot Works

`src/index.js` is the application entry point and orchestrator. It creates the Discord client and shared runtime state, then wires together the handlers in `src/handlers/`. Keep command, database, lifecycle, and service logic in their respective modules rather than adding it directly to `index.js`.

## Startup and runtime handlers

Startup is coordinated in this order:

1. `clientHandler.js` creates the Discord client, configures its intents and REST options, and attaches the HTTP agent used during shutdown.
2. `healthcheckHandler.js` optionally starts the Docker health endpoint when `ENABLE_DOCKER_HEALTHCHECK=true`. The endpoint reports ready only after both databases initialize and the Discord client is ready.
3. `commandHandler.js` loads commands and registers prefix and slash-interaction event listeners.
4. `presenceHandler.js` starts notifications on `clientReady`; the orchestrator starts the bot presence after database initialization and login.
5. `databaseHandler.js` initializes both database managers, assigns them to `client.db` and `client.rpg`, and logs in with retry handling.
6. `lifecycleHandler.js` handles `SIGINT` and `SIGTERM`, waits for active commands, and closes the health server, Discord client, HTTP agent, and databases.
7. `src/scripts/updater.js` is initialized by `index.js`.

The configured prefix is `PFX`. Do not put secrets in source code; runtime credentials belong in environment variables.

## Command execution

For prefix commands, `messageCreate` checks the prefix, resolves the command name or alias, and passes the remaining words as `args`. For slash commands, `interactionCreate` passes the native `ChatInputCommandInteraction` directly to the command. Slash commands read values through `interaction.options.getString()`, `getInteger()`, `getUser()`, and the other Discord.js option getters; no synthetic message or positional-argument conversion is used. Small response helpers preserve prefix replies while handling native interaction acknowledgement, follow-ups, and public component messages.

Both routes use the same tracked execution path. It applies default user settings, records activity, checks owner-only access and temporarily blocked commands, then executes the command. A command exception is logged and blocks that command for the current process to avoid repeated failures. Active command promises are tracked so shutdown can wait for them.

## Registering slash commands

Slash-command registration is a separate operation; it is not performed during normal bot startup. Each command's `slashOptions` descriptors are registration metadata used by `slash-register` to build Discord-native option definitions; command execution reads submitted values from the native interaction:

```powershell
npm run slash-register
```

The script loads command modules, validates slash definitions, and creates missing or updates changed registrations without deleting unrelated registrations. Set `SLASH_GUILD_ID` in `.env` for a single server (changes appear faster); leave it empty for global registration.

To remove existing registrations in the selected scope before synchronization, run:

```powershell
npm run slash-register -- --reset
```

`SLASH_RESET=true` also enables reset for one run. Reset with `SLASH_GUILD_ID` affects only that server; without it, reset affects global commands.
