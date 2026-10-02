<p align="center">
  <img width="300" height="300" alt="Santaa Bot Logo" src="https://github.com/user-attachments/assets/1804bf80-6b57-4d55-8345-a3eb55386cb1" />
</p>

<p align="center">
  <strong>A lightweight, lightning-fast Discord bot built for easy customization using 100% Javascript</strong>
</p>

<p align="center">
  <a href="#PREREQUISITES">BEGIN SETUP</a> ·
  <a href="docs/CHANGELOG.md">CHANGELOG</a> ·
  <a href="docs/ISSUES.md">KNOWN ISSUES</a> ·
  <a href="docs/GUIDE.md">BOT GUIDE</a>
</p>

---

## FEATURES
- Good looking UI/UX
- Economy System: Balance, Jobs, Part Time, beg, crime, steal,...
- Fun and advance minigames: PVP, fishing, mining, guess, olympac,...
- Trading and shopping (ofc)
- Using cheat legally with owner commands so you could flex anyone
- Scanning commands using get files recursive and customize bot status
- Lightweight and easily to manage database
- Coding stuff and you notice that why tf a lot of README.md 


## PREREQUISITES

Before do anything:

1. **Node.js** (recommend v16 or higher)
2. **Docker** (optional)
3. **Your Discord User ID and Bot Token** (To starting bot and owner commands)

> **Note on Databases:**  
> Currently bot using SQlite due to minimal usage, the bot may not operate stably when running "very" many servers, so switching to another SQL is recommended (required to change a lot database)

## SETUP
### running via `npm run`
Run these commands in your terminal:

```bash
git clone https://github.com/meh2025/Santaa.git
cd Santaa
npm install
```

Now rename `.env.example` (remove .example) and put your full information

You can run the bot with the existing npm commands:
```
npm run start  # daily usage

npm run dev    # for development (supporting fast cooldown)

npm run test   # test if it's bugging or not (have to create folder `test` to work)
```

### running via Docker
(Cautions: This Docker currently running simillar like `npm run start`, so no fast cooldown there)
Docker Engine and the Docker Compose plugin are required. Create `.env` from `.env.example` and configure at least `DISCORD_BOT_API_KEY` and `PFX`, then run these commands from the project root:

```bash
docker compose up --build -d    # Build and starting bot
docker compose logs -f bot      # Stop running
docker compose down             # View bot logs
```

The Compose service stores bot data in the project's `database/` directory, so that data is available to both Docker and the traditional npm workflow. Do not run both bot instances at the same time because they would write to the same SQLite databases. The updater is disabled inside Docker even if `AUTO_UPDATE=true` is set in `.env`, it remains available when running the bot with npm on the host

On Linux, Compose runs as UID/GID 1000 by default. If your project files use a different owner, set `SANTAA_UID` and `SANTAA_GID` to match that user before starting Compose so the container can write to `database/`

---
thx for read ts, have a gut day bradar
