# Database and Data Access

The bot uses two SQLite databases. Their files are created at runtime and should not be committed:

| File | Manager facade | Main data |
| --- | --- | --- |
| `database/balance.db` | `database/dbmanager.js` | Wallet/bank balances, settings, activity, daily claims, jobs, and net-worth peaks |
| `database/rpg.db` | `database/rpgmanager.js` | Inventory, player stats/profiles, and PvP history |

The manager modules are compatibility facades: existing commands can continue calling the same methods, while database access and schema work live in focused modules.

## Module responsibilities

- `database/connection.js` opens SQLite connections and applies shared connection settings (`busy_timeout`, WAL journaling, normal synchronous mode, and foreign keys). It also provides the shared idempotent column migration helper.
- `database/schema/balance.js` creates and migrates the balance database tables and their indexes. It applies the split-notification settings migration transactionally.
- `database/schema/game.js` creates and migrates inventory, stats, and PvP tables and indexes.
- `database/repositories/` contains data operations grouped by domain:
  - `settingsRepository.js`: user settings, help preferences, and passive activity.
  - `jobsRepository.js`: job state and daily reward/reminder claims.
  - `economyRepository.js`: balances, bank operations, and bank limits.
  - `financialRepository.js`: inventory valuations, net-worth peaks, and financial leaderboards.
  - `inventoryRepository.js`: item ownership and inventory mutations.
  - `statsRepository.js`: player stats, equipment, and fishing/mining profiles.
  - `leaderboardRepository.js`: PvP history and game/stat leaderboards.
- `database/dbmanager.js` and `database/rpgmanager.js` compose those repositories and expose the legacy API. Keep SQL and domain logic in the repositories/schema modules, not in new commands or the facades.

## Accessing data

Commands normally use the managers attached to the Discord client:

```js
const balanceManager = message.client.db;
const rpgManager = message.client.rpg;

const account = await balanceManager.getUser(message.author.id);
const stats = await rpgManager.getStats(message.author.id);
```

Direct imports are also supported where the client context is unavailable:

```js
const dbmanager = require('../../../database/dbmanager');
const rpgmanager = require('../../../database/rpgmanager');
```

Choose `dbmanager` for money, settings, jobs, and net worth. Choose `rpgmanager` for inventory, player stats/profiles, and PvP data. Keep parameterized SQL in repositories; do not interpolate user input into SQL.

### Common operations

```js
// Wallet and bank
await dbmanager.addMoney(userId, amount, { trackEarning: true });
await dbmanager.removeMoney(userId, amount);
await dbmanager.addBank(userId, amount);
await dbmanager.removeBank(userId, amount);
const summary = await dbmanager.getNetWorthSummary(userId);

// Inventory stores one row per item copy
const inventory = await rpgmanager.getInventory(userId);
await rpgmanager.addItem(userId, itemId, itemName);
await rpgmanager.removeItem(inventory[0].id);

// Stats and leaderboards
const stats = await rpgmanager.getStats(userId);
await rpgmanager.updateStats(userId, health, stamina);
await rpgmanager.updateProgress(userId, { level: 2, exp: 100 });
const levelLeaderboard = await rpgmanager.getLevelLeaderboard(10);
const moneyLeaderboard = await dbmanager.getMoneyLeaderboard(10);
```

`addItem` inserts one inventory row; call it once per item copy. `removeItem` accepts the inventory row ID, not an item ID or quantity. Check the manager/repository implementation before relying on a method signature—older snippets or examples may not match the current API.

## Adding or changing stored data

1. Decide which database owns the data: balance/economy or RPG/gameplay.
2. Add or update the table/column/index in the matching schema module.
3. Use `ensureColumn` for additive columns so existing databases migrate safely. Keep migrations idempotent; do not swallow unrelated SQL errors.
4. Add domain queries to the corresponding repository and expose them through the existing manager facade if commands need the new operation.
5. Add or update tests in `database/repositories/repositories.test.js`. Tests use in-memory SQLite and cover repeatable migrations, legacy schemas, and repository workflows.
6. Run `npm test` before shipping.

Do not rename database files, move tables between the two databases, or remove columns as part of a routine refactor without a deliberate data migration and backup plan. Each manager owns and closes its own connection; startup initializes both before login, and shutdown closes both.

## Performance and consistency

- Existing indexes support inventory ownership/item lookups, user-setting sweeps, active jobs, level rankings, and PvP history.
- Prefer a batched query over a loop that performs one database read per user/item. Financial leaderboards use a shared inventory snapshot for valuation.
- Use a transaction for multi-step migrations or writes that must succeed/fail together. SQLite transactions are connection-local; do not assume a transaction spans `balance.db` and `rpg.db`.
- SQL operations use placeholders for values. Dynamic SQL fragments should only be selected from fixed, trusted field names.
- WAL mode may create SQLite `-wal` and `-shm` sidecar files while the bot is running; treat them as runtime data alongside the database files.

## Other persisted data

Boss configuration and memory files under `database/bosses/` and `database/bosses_memory/` are JSON, not part of these SQLite managers. Preserve their existing file-based storage unless their subsystem is intentionally migrated.
