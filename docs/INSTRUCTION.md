# Structure and Content Guide for Santaa Project

<p align="center">
  <a href="#1-overall-folder-structure">STRUCTURE</a> ·
  <a href="#2-how-bot-loads-commands">HOW BOT LOAD COMMANDS</a> ·
  <a href="#3-how-to-add-a-new-command">HOW TO ADD A NEW COMMAND</a> ·
  <a href="#4-item-system-srct-items">ITEMS SYSTEM</a> ·
  <a href="#5-discordjs-embed-guide">EMBED GUIDE</a> ·
  <a href="#6-minigames-system-srct-minigames">MINIGAMES</a> ·
  <a href="#7-data-management-database">DATABASE</a> ·
  <a href="#8-boss--memory-system">PVP BOSSES</a> ·
  <a href="#9-TO-DO">TODOs</a>
</p>

> ⚠️ **Huge Warning:** Do not delete any folders, files, or working logic in the bot's command loading section. If unsure, only add new items; do not deleted existing ones. (YOU HAVE TO FINISH SETUP ON README.md BEFORE READ THIS)

## 1. Overall Folder Structure

```text
Santaa/
├── docs/                   # Documents
├── database/               # SQLite data management (.db) and JSON config
│   ├── bosses/             # Boss configurations (JSON)
│   ├── bosses_memory/      # Boss state memory
│   ├── balance.db          # DB for money, bank, jobs (dbmanager.js)
│   ├── rpg.db              # DB for inventory, stats, pvp (rpgmanager.js)
│   ├── dbmanager.js        # Manages balance & jobs
│   └── rpgmanager.js       # Manages RPG (stats, items, pvp)
├── src/                    # Main bot source code
│   ├── index.js            # Entry point
│   ├── commands/           # Commands divided by category
│   │   ├── EconomicCMD/
│   │   ├── MainCMD/
│   │   ├── ownerCMD/
│   │   ├── UtilsCMD/        
│   │   ├── PVP/
│   │   ├── shop/
│   │   └── Utils/
│   ├── items/              # Item definitions (data-only)
│   │   ├── fish/           # Fish items
│   │   ├── mine/           # Material mining items
│   │   └── shopItems/      # Shop items (divided by shop: kimori, gepora)
│   ├── memes/              # Meme modules/commands
│   └── minigames/          # Minigames stuff
│       ├── Fishing/
│       ├── Mining/
│       └── Other/          # Other minigames (guessmeme, olympac)
├── README.md               # General project documentation
└── package.json            # Where running `npm run` scripts

(Other minor file or not necessary will not list here)
```

## 2. How Bot Loads Commands

In `src/index.js`, the bot uses the `commandFolders` array:
```js
const commandFolders = ['commands', 'minigames', 'memes'];
```
The bot recursively scans all .js files using fs.readdirSync(dir, { withFileTypes: true }). This reads directory entries directly without triggering additional I/O calls (fs.statSync), ensuring fast boot times even with hundreds of files.

**Rules:**
- Add a .js file to any subfolder inside commands, minigames, or memes $\rightarrow$ The bot loads it automatically
- Add a new folder at the same level as `commands` $\rightarrow$ You must add that folder name to `commandFolders`.

## 3. How to add a new Command

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
  // If you want to add more or than 1 category, use array format: category: "['category1', 'category2']",

  usage: '!hello', // really need, if you lazy to add then you could create a file to automatic add to all command
  notes: 'You can tag a user to greet them, or leave it blank to greet yourself.', // not necessary to add
  show: true, // Visibility, normally default will set true
  execute(message, args) {
    message.reply('Hello!');
  },
};
(To add a custom category, edit getOptions function in commands/utils/NavigateManager.js)
```
3. **Restart the bot.** (if you run `npm run dev` so you only have to save file)

### Example: Part-time Command
Here's a real example from `src/commands/EconomicCMD/work.js` that demonstrates:
- Using discord.js EmbedBuilder
- Database operations
- Cooldown system
- Custom imports

```js
const { EmbedBuilder } = require('discord.js');
const { jobs, jobs_txt } = require('../Utils/tips'); // Import job from tips.js
const { checkCooldown } = require('../Utils/Cooldown'); // Import cooldown function from Cooldown.js
const { CURRENCY_EMOJI } = require('../Utils/config');
const { checkWantedRestrictions } = require('../Utils/WantedLevel');

module.exports = {
  name: 'parttime',
  description: 'Do part-time work cuz u unemployed final boss',
  category: 'eco',
  usage: 'Zparttime',
  async execute(message) {
    const { client, author } = message;
    const dbManager = message.client.db;

    // Cooldown
    const timeLeft = checkCooldown(author.id, this.name);

    if (timeLeft) {
      return message.reply(`Please wait ${timeLeft} before using the \`${this.name}\` command again.`);
    }

    const wantedCheck = await checkWantedRestrictions(author.id, this.name, client, message);
    if (!wantedCheck.allowed) {
      if (!wantedCheck.handled && wantedCheck.message) message.reply(wantedCheck.message);
      return;
    }

    // rand fuc
    const randJob = jobs[Math.floor(Math.random() * jobs.length)];
    const jobQuote = jobs_txt[Math.floor(Math.random() * jobs_txt.length)];

    // Random job paid
    const amountEarned = Math.floor(Math.random() * (50 - 5 + 1)) + 5;

    try {
      await dbManager.addMoney(message.author.id, amountEarned, { trackEarning: true });

      // work embed
      const workEmbed = new EmbedBuilder()
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL()
        })
        .setDescription(
          `**${randJob.name}**` +
          ` and you earned **${amountEarned.toLocaleString()}${CURRENCY_EMOJI}**!\n\n` +
          `*"${jobQuote}"*`
        )
        .setTimestamp();
      message.channel.send({ embeds: [workEmbed] });
    } catch (error) {
      console.error('Error occurred while updating user balance:', error);
    }
  }
};
```

## 4. Items System (`src/items`)

This folder contains only data, not command execution logic

### Folder Structure:
- `[mine/fish]/[Rarity]/item.js`: Divided by rarity (Common $\rightarrow$ Mythic) for the two minigames
- `shopItems/[ShopName]/item.js`: Divided by shop name

### Item File Format:
```js
module.exports = {
    id: 'stone',
    name: 'Stone',
    sell: 10,
    desc: 'You could find this somewhere at your garden',
    type: ['consumable'], // Currently only two type: equippable and consumable
    is_sellable: true,
    is_tradeable: true
    // show: false
};
// By default, you can define is_sellable: true and is_tradeable: true to indicate if the item can be sold or traded.
// If not specified, they might have default fallback behaviors depending on the command.
// Show: hide or show items in shop. If omitted, items appear in shop by default.
```
Another specific type:
```js
module.exports = {
    ...
    // Fishing
    durability: 50, // For fishing rod, when if zero its will break and fallback to hand.js items
    capacity: 5, // For buckets
    stats: "• get random 3-5 fish in one time but very worse (mostly get common 80-90%)\n• Durability hard to break\n• Cannot use any bait", // Needed to view stats on fishing equipment

    // Other
    effects: { health: 10, stamina: 20 }, // Consumable type, for reviving health and stamina
    stats: { health: 1000, stamina: 1000, attack: 500, defense: 500 }, // Equippable type, for PVP stuff
}
```

## 5. Discord.js Embed Guide

### Basic Embed Structure
Discord.js provides the `EmbedBuilder` class to create rich embeds for your bot messages:

```js
const { EmbedBuilder } = require('discord.js');

const basicEmbed = new EmbedBuilder()
  .setTitle('Title Here')
  .setDescription('Description text here')
  .setColor('#0099ff') // Hex color code
  .setTimestamp()
  .setFooter({ text: 'Footer text' });

message.channel.send({ embeds: [basicEmbed] });
```

### Common Embed Methods

**Set Author with User Info:**
```js
const embed = new EmbedBuilder()
  .setAuthor({
    name: message.author.username,
    iconURL: message.author.displayAvatarURL()
  });
```

**Add Fields:**
```js
const embed = new EmbedBuilder()
  .addFields(
    { name: 'Field 1', value: 'Value 1', inline: true },
    { name: 'Field 2', value: 'Value 2', inline: true },
    { name: 'Field 3', value: 'Value 3', inline: false }
  );
```

**Set Thumbnail and Image:**
```js
const embed = new EmbedBuilder()
  .setThumbnail('https://example.com/thumbnail.png')
  .setImage('https://example.com/image.png');
```

**Conditional Styling:**
```js
const successEmbed = new EmbedBuilder()
  .setColor('#00ff00') // Green for success
  .setDescription('Operation completed successfully!');

const errorEmbed = new EmbedBuilder()
  .setColor('#ff0000') // Red for errors
  .setDescription('An error occurred!');
```

### Advanced Embed Features

**Dynamic Fields from Database:**
```js
const userData = await dbManager.getUser(userId);
const embed = new EmbedBuilder()
  .setTitle('User Profile')
  .addFields(
    { name: 'Balance', value: `${userData.balance}${CURRENCY_EMOJI}`, inline: true },
    { name: 'Bank', value: `${userData.bank}${CURRENCY_EMOJI}`, inline: true },
    { name: 'Level', value: userData.level.toString(), inline: true }
  );
```

**Conditional Embed Creation:**
```js
function createStatusEmbed(status, message) {
  const colors = {
    success: '#00ff00',
    error: '#ff0000',
    warning: '#ffaa00',
    info: '#0099ff'
  };

  return new EmbedBuilder()
    .setColor(colors[status] || colors.info)
    .setDescription(message)
    .setTimestamp();
}

// Usage
const embed = createStatusEmbed('success', 'Money added successfully!');
```

### Interactive Components with Embeds

**Buttons with Embeds:**
```js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const row = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_button')
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('cancel_button')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

const embed = new EmbedBuilder()
  .setTitle('Confirmation Required')
  .setDescription('Please confirm your action');

message.channel.send({ embeds: [embed], components: [row] });
```

**Select Menus with Embeds:**
```js
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const menu = new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('category_select')
      .setPlaceholder('Select a category')
      .addOptions([
        { label: 'Economy', value: 'economy' },
        { label: 'Utilities', value: 'utilities' },
        { label: 'Fun', value: 'fun' }
      ])
  );

const embed = new EmbedBuilder()
  .setTitle('Category Selection')
  .setDescription('Choose a category to view commands');

message.channel.send({ embeds: [embed], components: [menu] });
```

### Database Integration with Embeds

**Displaying User Data:**
```js
async function showUserProfile(message, userId) {
  const userData = await dbManager.getUser(userId);
  const inventory = await rpgmanager.getInventory(userId);

  const embed = new EmbedBuilder()
    .setAuthor({
      name: message.author.username,
      iconURL: message.author.displayAvatarURL()
    })
    .setTitle('User Profile')
    .addFields(
      { name: 'Balance', value: `${userData.balance}${CURRENCY_EMOJI}`, inline: true },
      { name: 'Bank', value: `${userData.bank}${CURRENCY_EMOJI}`, inline: true },
      { name: 'Total Assets', value: `${Number(userData.balance) + Number(userData.bank)}${CURRENCY_EMOJI}`, inline: false },
      { name: 'Inventory Items', value: inventory.length.toString(), inline: true }
    )
    .setTimestamp();

  return embed;
}
```

**Pagination with Embeds:**
```js
async function showPaginatedList(message, items, pageSize = 5) {
  let currentPage = 0;
  const totalPages = Math.ceil(items.length / pageSize);

  const generateEmbed = (page) => {
    const start = page * pageSize;
    const end = start + pageSize;
    const pageItems = items.slice(start, end);

    return new EmbedBuilder()
      .setTitle(`Items List (Page ${page + 1}/${totalPages})`)
      .setDescription(pageItems.map((item, i) => 
        `${start + i + 1}. ${item.name} - ${item.description}`
      ).join('\n'))
      .setTimestamp();
  };

  const response = await message.channel.send({ embeds: [generateEmbed(currentPage)] });
  // Add pagination buttons and collector logic here
}
```

## 6. Minigames System (`src/minigames`)

Complex minigames are usually divided into 5 parts:
- **Core (`...Core.js`):** Handles main logic, items skill and calculations exp,...
- **UI (`...UI.js` or `...Board.js`):** Handles display and gameplay for minigames
- **Map Manager (`MapManager.js`):** Where managed all map and random rarity
- **Shop (`...Shop.js`):** Handle or a single commands to view/buy items (its same as shop)
- **Main (`...js`):** Main command file to control all file above
- Other: At times, minigames generate extra files due to overly complex codebase like *fishBucket* and *fishSkill*,..  
(for ...list.js like fishlist or minelist, its just a list of items)

Simple or other minigames type: only 1 single file .js

## 7. Data Management (Database)

The bot stores data in SQLite using two database files:

### `database/balance.db` via `dbmanager.js`
Use this for money, bank, jobs, and help preferences.
- `balances`: user cash and bank data
- `job_states`: current job info and cooldowns
- `help_preferences`: last help categories per user

### `database/rpg.db` via `rpgmanager.js`
Use this for inventory, player stats, PVP history, and fishing progress.
- `inventory`: every owned item record
- `stats`: player stats + equipment + fishing profile
- `pvp_history`: saved fight results

Keep these points in mind:
- `dbmanager.js` initializes `balance.db` and creates missing tables.
- `rpgmanager.js` initializes `rpg.db` and makes sure old databases still work.
- If you add new fields, update the create/alter statements in the correct manager file.

### Database Usage Examples

**Accessing Database Managers:**
```js
// In command files, access via client.db
const dbManager = message.client.db; // For balance operations
const rpgManager = message.client.rpg; // For RPG operations

// Or require directly
const dbmanager = require('../../../database/dbmanager');
const rpgmanager = require('../../../database/rpgmanager');
```

**Common Database Operations:**

**Money Operations (dbmanager):**
```js
// Get user data
const userData = await dbManager.getUser(userId);

// Add money to balance
await dbManager.addMoney(userId, amount, { trackEarning: true });

// Remove money from balance
await dbManager.removeMoney(userId, amount);

// Add money to bank
await dbManager.addBank(userId, amount);

// Remove money from bank
await dbManager.removeBank(userId, amount);

// Get inventory value
const inventoryValue = await dbManager.getInventoryValue(userId);
```

**Inventory Operations (rpgmanager):**
```js
// Get user inventory
const inventory = await rpgmanager.getInventory(userId);

// Add item to inventory
await rpgmanager.addItem(userId, itemId, quantity);

// Remove item from inventory
await rpgmanager.removeItem(userId, itemId, quantity);

// Check if user has item
const hasItem = await rpgmanager.hasItem(userId, itemId);

// Get user stats
const stats = await rpgmanager.getStats(userId);

// Update user stats
await rpgmanager.updateStats(userId, { level: newLevel, xp: newXp });
```

**Query Operations:**
```js
// Get money leaderboard
const leaderboard = await dbmanager.getMoneyLeaderboard(10);

// Get level leaderboard
const levelLeaderboard = await rpgmanager.getLevelLeaderboard(10);

// Get PVP wins leaderboard
const winsLeaderboard = await rpgmanager.getWinsLeaderboard(10);
```

**Error Handling:**
```js
try {
  await dbManager.addMoney(userId, amount);
  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setDescription(`Successfully added ${amount}${CURRENCY_EMOJI}!`);
  message.channel.send({ embeds: [embed] });
} catch (error) {
  console.error('Database error:', error);
  const errorEmbed = new EmbedBuilder()
    .setColor('#ff0000')
    .setDescription('An error occurred while processing your request.');
  message.channel.send({ embeds: [errorEmbed] });
}
```

**Database with Cooldowns:**
```js
const { checkCooldown } = require('../Utils/Cooldown');

async execute(message) {
  const userId = message.author.id;
  const commandName = this.name;

  // Check cooldown
  const timeLeft = checkCooldown(userId, commandName);
  if (timeLeft) {
    return message.reply(`Please wait ${timeLeft} before using this command again.`);
  }

  // Perform database operation
  try {
    await dbManager.addMoney(userId, 100);
    message.reply('Money added successfully!');
  } catch (error) {
    console.error('Error:', error);
    message.reply('An error occurred.');
  }
}
```

## 8. Boss & Memory System

- `database/bosses/*.json`: Contains boss stats and skill configurations
- `database/bosses_memory/*.json`: Stores current boss state (e.g., remaining health) so it isn't reset when the bot restarts
---

## 9. TO DO
### ⚠️ Things not to do
- Do not delete/rename main folders: `commands`, `minigames`, `memes`, `items`, `database`, also other important folder: utils, items...
- Do not modify the file scanning logic in `src/index.js` unless you fully understand it
- Do not delete files without checking if they are imported anywhere

### ✅ THINGS TO DO
- [ ] Remove all navigate button emojis (in `commands/utils/NavigateManager.js`)
- [ ] Update emoji currency via `config.js` in the same folder
