The `.db` files contain the bot's persistent economy, inventory, and player data. `dbmanager.js` and `rpgmanager.js` define the schema and database operations.

Back up before changing database code or files. For a consistent live Docker backup, create `.backups/` and run `docker compose --profile tools run --rm backup` from the project root. The backup service mounts `database/` read-only, snapshots SQLite databases through SQLite's backup API, and excludes `.env` files.

Stop the bot before restoring a backup. Do not run the Docker bot and host `npm` bot at the same time: both write to the same SQLite databases. Keep at least one backup copy off the machine running Docker.