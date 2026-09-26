# How to add a new Command

1. **Create file:** Example `src/commands/MainCMD/hello.js` (Note: Creating a .js file directly inside the root commands folder is not recommended)
2. **Export structure:**
```js

// Add import or some function here, Make sure you move module.export at bottom

module.exports = {
  name: 'hello',
  aliases: ['hi', 'hallo'], // Not required to add
  description: 'Bot greeting command', // Needed for help command, or its will fallback "No description"
  category: 'gnr', // Not required because help command will list it at "All" category but cannot appear in other category
  //All category supported: eco: Economic, gnr: General, owner: Owner (Important, if you make a command literally cheat lol), utl: Utils, mie: Minigames
  // If you want to add more or than 1 category, use array format: category: ['category1', 'category2'],

  usage: 'Zhello `target` `text`',
  notes: 'You can tag a user to greet them, or leave it blank to greet yourself.', // not necessary to add
  show: true, // Visibility, normally default will set true and not register slash commands
  DMs: true, // Allow to use in DMs, default is true

  // Only add args when the command needs slash command options
  // If args is omitted, the slash command has no options
  args: [
    { name: 'target', description: 'Say hello to that dude', type: 'user', required: false },
    { name: 'text', description: 'Give him some text', type: 'string', required: false },
  ],
  // Args will not register if it use `show: false,`

  // For args
  execute(message, args = []) {
    const target = message.mentions.users.first() || message.author;
    const text = args[1] || 'Hello!';
    message.reply(`${text} ${target}`);
  },

  // Normal commands
  execute(message, args) {
    message.reply('Hello!');
  },
};

(To add a custom category, edit getOptions function in commands/utils/NavigateManager.js)

```

3. **Restart the bot.** (if you run `npm run dev` so you only have to save file)