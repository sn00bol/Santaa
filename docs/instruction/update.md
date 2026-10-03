# Updating bot
The host-side Git updater is experimental and disabled by default. Prefer a reviewed `git pull` for host deployments.
To editing update settings, update it via `.env`:
```
AUTO_UPDATE=false # Enable or disable the experimental host-side updater
UPDATE_REPOSITORY=https://github.com/your-user/your-repository.git # Repository URL for the updater
UPDATE_BRANCH=main # Branch to update from, including: `main`, `alpha`, `beta`
CHECK_INTERVAL=3600 # Check interval in seconds (1 hour)
```

These are some commands related to update:
```
npm run update # fast update

npm run fallback # rollback codebase before update
```
When enabled, the host-side updater checks every `CHECK_INTERVAL` seconds while running `npm run start` or `npm run dev`. Docker always forces this Git updater off; Docker releases are published as images and deployed by pulling the selected image tag.

For example:
```
D:\Santaa> npm run update

> santaa@1.3.0-alpha.1 update
> node src/updater.js

◇ injected env (6) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
[UPDATE] Running manual update check...
From https://github.com/meh2025/Example-Discord-Bot-using-Javascript
 * branch            main       -> FETCH_HEAD

[UPDATE] New update found! (Local: v1.3.0-alpha.1 -> Remote: v1.2.4)

[WARNING] Your local version (v1.3.0-alpha.1) is HIGHER than the remote branch (v1.2.4).
You might be on a dev branch pulling from an older stable branch. Proceed with caution!


------------------------------------------
v1.2.4 - 9.15.2026
- Upgrading checking owner permission now checking if category have owner instead ONLY owner category
- Ugrading catch error logs and blocking commands temporarily to prevent bot crash (except some bugs will crash whole bot normally)
------------------------------------------

Do you want to update? (y/n): n
[UPDATE] Update skipped.
[UPDATE] No updates found or update cancelled.
D:\Santaa>
```

To change where to update, set `UPDATE_REPOSITORY` to the repository URL and change `UPDATE_BRANCH` to `main` (for stable), `alpha` (for latest dev/feature) or `beta` (for latest unstable feature). If `UPDATE_REPOSITORY` is empty, the updater keeps using the repository already configured as the local Git `origin` remote.

(If you saw this link `https://github.com/meh2025/Example-Discord-Bot-using-Javascript` at the top of response, it basically old repo name of bots)

Docker image publishing runs from version tags such as `v1.3.0-alpha.7` through `.github/workflows/docker-publish.yml`. To deploy manually, run `docker compose pull bot` followed by `docker compose up -d bot`.

An opt-in Watchtower profile is available through `docker compose --profile auto-update up -d watchtower`. The upstream Watchtower repository was archived in December 2025; its Docker socket access is highly privileged, and updates have no automatic rollback. Keep the profile disabled unless you accept that risk and have verified a backup and restore first. See the Docker section in the root README for the backup and rollback commands.