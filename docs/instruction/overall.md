
# Overall Folder Structure

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
│   ├── scripts/            # Scripts
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

# TO DO
### ⚠️ Things not to do
- Do not delete/rename main folders: `commands`, `minigames`, `memes`, `items`, `database`, also other important folder: utils, items...
- Do not modify the file scanning logic in `src/index.js` unless you fully understand it
- Do not delete files without checking if they are imported anywhere

### ✅ THINGS TO DO
- [ ] Remove all navigate button emojis (in `commands/utils/NavigateManager.js`)
- [ ] Update emoji currency via `config.js` in the same folder