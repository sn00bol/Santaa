# How Bot Works

In `src/index.js`, the bot uses the `commandFolders` array:
```js
const commandFolders = ['commands', 'minigames', 'memes'];
```
The bot recursively scans all .js files using fs.readdirSync(dir, { withFileTypes: true }). This reads directory entries directly without triggering additional I/O calls (fs.statSync), ensuring fast boot times even with hundreds of files.

**Rules:**
- Add a .js file to any subfolder inside commands, minigames, or memes $\rightarrow$ The bot loads it automatically
- Add a new folder at the same level as `commands` $\rightarrow$ You must add that folder name to `commandFolders`.

### Command Loading and Execution

Every command must export a `name` and an `execute(message, args)` function. The loader stores commands in `client.commands` and stores their aliases in `client.aliases`.

Prefix commands are handled through `messageCreate`:
- The message must start with the configured `PFX` value.
- The first word after the prefix is used as the command name.
- The remaining words are passed to the command as the `args` array.
- Unknown commands are ignored.

Both prefix commands and slash commands use the same `runCommand` flow. This keeps owner checks, blocked-command checks, and command execution consistent across both command types.

### Slash Commands

Slash commands are built from the commands loaded by `src/index.js` and registered when the client is ready. The registration process:
- Fetches commands already registered in the selected scope.
- Creates missing commands.
- Updates commands whose description, options, or DM permission changed.
- Does not overwrite or remove existing commands during normal startup.

Set `SLASH_GUILD_ID` in `.env` to register commands in one server for near-instant updates. Leave it empty to use global commands, which may take longer to appear.

To remove old commands and register the current set again, set `SLASH_RESET=true` for one startup. After the reset completes, set it back to `SLASH_RESET=false`. Resetting with `SLASH_GUILD_ID` only affects that server; resetting without it affects global commands.

### Slash Command Arguments

Commands can define an `args` array to create named slash options:
- Supported types are `string`, `integer`, `number`, `boolean`, and `user`.
- Each argument needs a lowercase `name`; descriptions should explain its purpose.
- Required arguments must come before optional arguments.
- If `args` is omitted, the slash command has no options.
- The adapter converts slash options into the same positional `args` format used by prefix commands.

For user arguments, the adapter creates a mention-compatible value so existing `message.mentions.users.first()` logic can continue to work.

### DM Availability

Commands support the optional `DMs` property. It defaults to `true`:
- `DMs: true` or no `DMs` property allows the command in DMs.
- `DMs: false` silently ignores prefix usage in DMs and disables the slash command in DMs.
- Server usage is unaffected by the `DMs` setting.

The optional `show` property controls slash registration. `show: false` hides a command from slash registration, while the prefix command can still be loaded unless its own execution logic prevents it.

### Startup Services

Before login, the bot initializes both database managers and attaches them as `client.db` and `client.rpg`. After login, it updates the bot presence with the current server count. The updater is initialized after the main startup code so update checks do not change how commands are loaded.

Finally, to prevent bot crashing (which is normally happen when a command or whole modular command have bug/error before v1.2.4), bot catch error logs and blocking commands temporarily to prevent bot crash (except some bugs will crash whole bot normally like database)
```js
    if (client.blockedCommands.has(command.name)) {
        return message.reply('This command currently blocked due to a bugs or crashing, will fix it fast as possible');
    }

    try {
        await command.execute(message, args);
    } catch (error) {
        console.error(`[ERROR] Command '${command.name}' failed and is now blocked:`, error);
        client.blockedCommands.add(command.name);
        message.reply('This command currently blocked due to a bugs or crashing, will fix it fast as possible');
    }
```