# Structure and Content Guide for Santaa Project

<p align="center">
  <a href="#1-overall-folder-structure">STRUCTURE</a> ·
  <a href="#2-how-bot-loads-commands">HOW BOT LOAD COMMANDS</a> ·
  <a href="#3-how-to-add-a-new-command">HOW TO ADD A NEW COMMAND</a> ·
  <a href="#4-item-system-srct-items">ITEMS SYSTEM</a> ·
  <a href="#5-minigames-system-srct-minigames">MINIGAMES</a> ·
  <a href="#6-data-management-database">DATABASE</a> ·
  <a href="#7-boss--memory-system">PVP BOSSES</a> ·
  <a href="#8-TO-DO">TODOs</a>
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
The bot recursively scans all `.js` files in these folders

**Rules:**
- Add a `.js` file to a subfolder of `commands`, `minigames`, `memes` $\rightarrow$ Bot loads it automatically.
- Add a new folder at the same level as `commands` $\rightarrow$ You must add that folder name to `commandFolders`.

## 3. How to add a new Command

1. **Create file:** Example `src/commands/MainCMD/hello.js` (Note: Creating a .js file directly inside the root commands folder is not recommended)
2. **Export structure:**
```js

// Add import or some function here, Make sure you move module.export at bottom

module.exports = {
  name: 'hello',
  aliases: ['hi', 'hallo'], // Not required to add
  description: 'Bot greeting command', // Needed for help command
  category: 'gnr', // eco: Economic, gnr: General, owner: Owner (Important, if you make a command literally cheat lol), utl: Utils, mie: Minigames
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

## 5. Minigames System (`src/minigames`)

Complex minigames are usually divided into 3 parts:
- **Core (`...Core.js`):** Handles main logic and calculations
- **UI (`...UI.js` or `...Board.js`):** Handles display and message formatting for the user
- **Map Manager (`MapManager.js`):** Where managed all map and random rarity
- **Shop (`...Shop.js`):** Handle or a single commands to view/buy items (its same as shop)
- **Main (`...js`):** Main command file connecting Core and UI

(for ...list.js like fishlist or minelist, its just a list of items)

Simple or other minigames type: only 1 single file .js

## 6. Data Management (Database)

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

## 7. Boss & Memory System

- `database/bosses/*.json`: Contains boss stats and skill configurations
- `database/bosses_memory/*.json`: Stores current boss state (e.g., remaining health) so it isn't reset when the bot restarts
---

## 8. TO DO
### ⚠️ Things not to do
- Do not delete/rename main folders: `commands`, `minigames`, `memes`, `items`, `database`, also other important folder: utils, items...
- Do not modify the file scanning logic in `src/index.js` unless you fully understand it
- Do not delete files without checking if they are imported anywhere

### ✅ THINGS TO DO
- [ ] Remove all navigate button emojis (in `commands/utils/NavigateManager.js`)
- [ ] Update emoji currency via `config.js` in the same folder
