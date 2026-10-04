<p align="center">
  <img width="300" height="300" alt="Santaa Bot Logo" src="https://github.com/user-attachments/assets/1804bf80-6b57-4d55-8345-a3eb55386cb1" />
</p>

<p align="center">
  <strong>A lightweight, lightning-fast Discord bot built for easy customization using 100% Javascript</strong>
</p>

<p align="center">
  <a href="#FEATURES">FEATURES</a> ·
  <a href="#PREREQUISITES">PREREQUISITES</a> ·
  <a href="#SETUP">SETUP</a> ·
  <a href="docs/GUIDE.md">BOT GUIDE</a>
</p>

---

## FEATURES
- Good looking UI/UX
- Economy System: Balance, Jobs, Part Time, beg, crime, steal,...
- Fun and advance minigames: PVP, fishing, mining, hunt, climb, memory, guess, olympac,...
- Meme commands: `meme` for a random online template, `slap`, `drake`, and `distracted` for dedicated online meme templates.
- Trading and shopping (ofc)
- Using cheat legally with owner commands so you could flex anyone
- Scanning commands using get files recursive and customize bot status
- Lightweight and easily to manage database
- Coding stuff and you notice that why tf a lot of README.md 

## PREREQUISITES

Before do anything:

1. Node.js v16 or higher
2. Git to make updater work
3. Docker (Optional)
4. Your discord bot token and some enable intents

> **Note on Databases:**  
<<<<<<< HEAD
> Currently bot using SQlite due to minimal usage, the bot may not operate stably when running "very" many servers, so switching to another SQL is recommended (required to change a lot database)
=======
> Currently bot using SQlite due to minimal usage, the bot may not operate stably when running many servers, so switching to MongoDB is recommended (required to change a lot database)

## SETUP
Run these commands in your terminal:

1. Clone repository:
```bash
git clone https://github.com/meh2025/Santaa.git
cd Santaa
npm install
```

2. Configure enviroments
```bash
cp .env.example .env
```

set  `DISCORD_BOT_API_KEY`, `PFX`, `OWNER_ID` (Optional but recommend for owner commands) as required.

Now, to run bot normally have two ways:

**npm run**
```
npm run start  # daily usage

npm run dev    # for development (supporting fast cooldown)

npm run test   # test if it's bugging or not
```

**Docker**

(Cautions: This Docker currently running simillar like `npm run start`, so no fast cooldown there)

```bash
docker compose up --build -d     # Build and start container

docker compose logs -f bot       # Getting bot logs

docker compose ps                # Container status
```
For more details about docker check it [here](docs/instruction/Docker.md).

## LICENSE
Santaa is using Apache v2.0 License, see [LICENSE](LICENSE) for more details

---
thx for read ts, have a gut day bradar
<p align="left">
  <a href="docs/CHANGELOG.md">CHANGELOG</a> ·
  <a href="docs/ISSUES.md">KNOWN ISSUES</a> 
</p>
