# Data Management (Database)

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

### Boss & Memory System

- `database/bosses/*.json`: Contains boss stats and skill configurations
- `database/bosses_memory/*.json`: Stores current boss state (e.g., remaining health) so it isn't reset when the bot restarts
---