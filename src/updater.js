const { execSync } = require('child_process');
const readline = require('readline');
const { createBackup } = require('./backup');

let isUpdating = false;

function execCmd(command) {
    try {
        return execSync(command, { encoding: 'utf8' }).trim();
    } catch (error) {
        return null;
    }
}

function parseChangelog(changelogContent) {
    if (!changelogContent) return null;

    const lines = changelogContent.split('\n');
    let versionHeader = '';
    const changes = [];
    let foundStart = false;

    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('# v') || line.startsWith('# V')) {
            if (foundStart) {
                break;
            } else {
                foundStart = true;
                versionHeader = line.replace(/^#\s*/, '');
            }
        } else if (foundStart && line) {
            changes.push(line);
        }
    }

    return { versionHeader, changes };
}

async function promptUpdate(versionData, showChangelog) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        if (showChangelog) {
            console.log('\n------------------------------------------');
            console.log(versionData.versionHeader);
            versionData.changes.forEach(change => console.log(change));
            console.log('------------------------------------------');
        } else {
            console.log('\n[UPDATE] Changelog for this version is not available.');
        }

        rl.question('Do you want to update? (y/n): ', (answer) => {
            rl.close();
            const lowerAnswer = answer.trim().toLowerCase();
            resolve(lowerAnswer === 'y' || lowerAnswer === 'yes');
        });
    });
}

// Visual helper for download bar
async function simulateDownloadBar(actionText, totalMB = 15) {
    return new Promise(resolve => {
        let downloaded = 0;
        const width = 25;
        process.stdout.write(`[UPDATE] ${actionText}...\n`);

        const interval = setInterval(() => {
            downloaded += (Math.random() * 3 + 1);
            if (downloaded >= totalMB) downloaded = totalMB;

            const progress = downloaded / totalMB;
            const filled = Math.round(width * progress);
            const empty = width - filled;
            const bar = '█'.repeat(filled) + '-'.repeat(empty);

            process.stdout.write(`\r   ${downloaded.toFixed(1)}MB / ${totalMB.toFixed(1)}MB [${bar}] ${Math.round(progress * 100)}%`);

            if (downloaded >= totalMB) {
                clearInterval(interval);
                console.log();
                resolve();
            }
        }, 150);
    });
}

async function checkForUpdates() {
    if (isUpdating) return;

    const autoUpdate = process.env.AUTO_UPDATE === 'true';
    const branch = process.env.UPDATE_BRANCH || 'main';

    if (!autoUpdate) return;

    try {
        // Fetch remote
        execCmd(`git fetch origin ${branch}`);

        // Compare commits
        const localCommit = execCmd('git rev-parse HEAD');
        const remoteCommit = execCmd(`git rev-parse origin/${branch}`);

        if (!localCommit || !remoteCommit) {
            console.error('[UPDATE] Failed to get local or remote commit hashes.');
            return;
        }

        if (localCommit !== remoteCommit) {
            isUpdating = true; // Prevent multiple update prompts

            // Check version to prevent pulling older branch accidentally
            const localPkg = require('../package.json');
            const localVersion = localPkg.version;
            let remoteVersion = 'unknown';
            try {
                const remotePkgStr = execCmd(`git show origin/${branch}:package.json`);
                if (remotePkgStr) remoteVersion = JSON.parse(remotePkgStr).version;
            } catch (e) { }

            console.log(`\n[UPDATE] New update found! (Local: v${localVersion} -> Remote: v${remoteVersion})`);

            // Simple version compare using localeCompare numeric
            if (localVersion.localeCompare(remoteVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
                console.log(`\n[WARNING] Your local version (v${localVersion}) is HIGHER than the remote branch (v${remoteVersion}).`);
                console.log(`You might be on a dev branch pulling from an older stable branch. Proceed with caution!\n`);
            }

            // Extract changelog from remote
            const remoteChangelog = execCmd(`git show origin/${branch}:docs/CHANGELOG.md`);
            const versionData = parseChangelog(remoteChangelog);

            let showChangelog = false;
            if (versionData && versionData.versionHeader && remoteVersion !== 'unknown') {
                if (versionData.versionHeader.includes(remoteVersion) || remoteVersion.includes(versionData.versionHeader)) {
                    showChangelog = true;
                }
            }

            const wantsUpdate = await promptUpdate(versionData || { versionHeader: 'New Version', changes: ['Check github for details'] }, showChangelog);

            if (wantsUpdate) {
                console.log('[UPDATE] Starting update process...');
                try {
                    const changedFiles = execCmd(`git diff --name-only HEAD origin/${branch}`).split('\n').filter(Boolean);
                    const isOnlyPackage = changedFiles.length > 0 && changedFiles.every(file => file === 'package.json' || file === 'package-lock.json');
                    const isSmallUpdate = changedFiles.length > 0 && changedFiles.length <= 5 && !changedFiles.includes('package.json');

                    if (isSmallUpdate) {
                        await simulateDownloadBar(`Downloading ${changedFiles.length} file(s)`, 2);
                        execCmd(`git merge origin/${branch}`);
                        console.log('[UPDATE] Fast update completed successfully! Restarting bot...');
                    } else if (isOnlyPackage) {
                        console.log(`[UPDATE] Fast update mode: Only package files changed. Skipping backup...`);
                        execCmd(`git merge origin/${branch}`);
                        await simulateDownloadBar('Installing dependencies', 25);
                        execCmd('npm install');
                        console.log('[UPDATE] Fast update completed successfully! Restarting bot...');
                    } else {
                        console.log('[UPDATE] Major update detected. Running full backup and reset...');
                        await createBackup();

                        await simulateDownloadBar(`Downloading new code from origin/${branch}`, 10);
                        execCmd(`git reset --hard origin/${branch}`);
                        execCmd('git clean -fd');

                        await simulateDownloadBar('Installing dependencies', 25);
                        execCmd('npm install');

                        console.log('[UPDATE] Full update completed successfully! Restarting bot...');
                    }

                    process.exit(0);
                } catch (updateError) {
                    console.error('[UPDATE] Error during update:', updateError);
                    console.log('[UPDATE] Update aborted.');
                    isUpdating = false;
                }
            } else {
                console.log('[UPDATE] Update skipped.');
                isUpdating = false;
            }
        }
    } catch (err) {
        console.error('[UPDATE] Error checking for updates:', err);
    }
}

function initUpdater() {
    const autoUpdate = process.env.AUTO_UPDATE === 'true';
    const intervalStr = process.env.CHECK_INTERVAL;
    let intervalMs = 3600 * 1000;

    if (intervalStr) {
        const parsed = parseInt(intervalStr, 10);
        if (!isNaN(parsed) && parsed > 0) {
            intervalMs = parsed * 1000;
        }
    }

    if (autoUpdate) {
        console.log(`[UPDATE] Auto-updater initialized. Checking every ${intervalMs / 1000} seconds.`);
        setTimeout(() => {
            checkForUpdates();
            setInterval(checkForUpdates, intervalMs);
        }, 5000);
    } else {
        console.log('[UPDATE] Auto-updater is disabled.');
    }
}

module.exports = { initUpdater, checkForUpdates };

if (require.main === module) {
    require('dotenv').config();
    console.log('[UPDATE] Running manual update check...');

    process.env.AUTO_UPDATE = 'true';

    checkForUpdates().then(() => {
        setTimeout(() => {
            if (!isUpdating) {
                console.log('[UPDATE] No updates found or update cancelled.');
                process.exit(0);
            }
        }, 1000);
    });
}
