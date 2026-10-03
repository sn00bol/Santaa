# Docker

Docker Engine and the Docker Compose plugin are required. A single Compose file supports local builds and GHCR production images. By default, `docker compose up --build -d` builds from this checkout.

Publish a release image by pushing a version tag such as `v1.3.0-alpha.7`. The GitHub Actions workflow tests the project, then publishes `ghcr.io/meh2025/santaa` for `linux/amd64` and `linux/arm64`. Prerelease tags do not move `latest`; only stable version tags do. GHCR packages are private by default; make the package public before deployment because this Compose setup does not configure private-registry credentials.

For production, set these values in `.env`:
```dotenv
SANTAA_IMAGE=ghcr.io/meh2025/santaa:latest
SANTAA_PULL_POLICY=always
SANTAA_WATCHTOWER_ENABLED=true
```

GHCR packages are private by default; make the package public before deployment because this setup does not configure private-registry credentials.

Production deployment:
```bash
docker compose pull bot
docker compose up -d bot
docker compose ps
docker compose logs -f bot
```

Local development build:
```bash
docker compose up --build -d
docker compose logs -f bot
```

Create the persistent backup directory before using the backup service. On Windows PowerShell:
```powershell
New-Item -ItemType Directory -Force .backups
```

On Linux, create it and grant the configured container UID/GID write access:
```bash
mkdir -p .backups
sudo chown 1000:1000 .backups
```

Create a consistent backup of the live SQLite databases:
```bash
docker compose --profile tools run --rm backup
```

The backup excludes `.env`, snapshots SQLite databases through SQLite's backup API, and stores archives in `.backups/`. Watchtower runs the same backup immediately before replacing the bot and skips that update if the backup command fails. Test restore before relying on automation; stop the bot before restoring. Keep an off-host copy. The bot and host npm process share `database/`, so never run both as writers at once.

The Compose file applies non-root execution, dropped Linux capabilities, `no-new-privileges`, resource/PID limits, bounded logs, and a loopback-only readiness check. The root filesystem is not read-only yet because map managers may create missing directories.

Watchtower is optional and disabled by default. The profile only monitors the explicitly labeled Santaa image, at 04:00 UTC, with cleanup disabled, and creates a pre-update backup; it still has Docker socket access (effectively host-admin) and does not provide rollback. Prefer manual releases unless you accept that risk. To opt in:
```bash
docker compose --profile auto-update up -d watchtower
docker compose --profile auto-update logs -f watchtower
```

To roll back, set `SANTAA_IMAGE` in `.env` to a previously published version tag, then run `docker compose pull bot` and `docker compose up -d bot`. `AUTO_UPDATE` controls only the experimental host-side Git updater; it is forced off in Docker.

Use `docker compose down` to stop and remove the Compose containers. On Linux, set `SANTAA_UID` and `SANTAA_GID` in `.env` to match the owner of `database/` and `.backups/` if the defaults do not fit your host. On Windows Docker Desktop, verify SQLite persistence and backup permissions before enabling automatic updates.