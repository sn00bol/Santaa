const { execSync } = require('child_process');
const readline = require('readline');
const { createBackup } = require('./backup');

let isUpdating = false;

function execCmd(command) {
    try {
        return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
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

        rl.question('\nDo you want to update? (y/n): ', (answer) => {
            rl.close();
            const lowerAnswer = answer.trim().toLowerCase();
            resolve(lowerAnswer === 'y' || lowerAnswer === 'yes');
        });
    });
}


async function checkForUpdates() {
    if (isUpdating) return;

    const autoUpdate = process.env.AUTO_UPDATE === 'true';
    const branch = process.env.UPDATE_BRANCH || 'main';

    if (!autoUpdate) return;

    try {
        execCmd(`git fetch origin ${branch}`);
        const localCommit = execCmd('git rev-parse HEAD');
        const remoteCommit = execCmd(`git rev-parse origin/${branch}`);

        if (!localCommit || !remoteCommit) {
            console.error('[UPDATE] Failed to get local or remote commit hashes.');
            return;
        }

        if (localCommit === remoteCommit) {
            return;
        } else {
            isUpdating = true;

            const localPkg = require('../../package.json');
            const localVersion = localPkg.version;
            let remoteVersion = 'unknown';
            try {
                const remotePkgStr = execCmd(`git show origin/${branch}:package.json`);
                if (remotePkgStr) remoteVersion = JSON.parse(remotePkgStr).version;
            } catch (e) { }

            console.log(`\n[UPDATE] New update found! (Local: v${localVersion} -> Remote: v${remoteVersion})`);

            if (localVersion.localeCompare(remoteVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
                console.log(`\n[WARNING] Your local version (v${localVersion}) is HIGHER than the remote branch (v${remoteVersion}).`);
                console.log(`You might be on a dev branch pulling from an older stable branch. Proceed with caution!\n`);
            }

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
                let updateStage = 'init';
                try {
                    const changedFiles = execCmd(`git diff --name-only HEAD origin/${branch}`).split('\n').filter(Boolean);
                    const isOnlyPackage = changedFiles.length > 0 && changedFiles.every(file => file === 'package.json' || file === 'package-lock.json');
                    const isSmallUpdate = changedFiles.length > 0 && changedFiles.length <= 5 && !changedFiles.includes('package.json');
                    const needsNpmInstall = changedFiles.includes('package.json') || changedFiles.includes('package-lock.json');

                    if (isSmallUpdate) {
                        updateStage = 'merge';
                        console.log(`[UPDATE] Fast update mode: Only ${changedFiles.length} file(s) changed. Merging directly...`);
                        execSync(`git merge origin/${branch}`, { stdio: 'inherit' });
                        console.log('[UPDATE] Fast update completed successfully! Restarting bot...');
                    } else if (isOnlyPackage) {
                        updateStage = 'merge';
                        console.log(`[UPDATE] Fast update mode: Only package files changed. Skipping backup...`);
                        execSync(`git merge origin/${branch}`, { stdio: 'inherit' });

                        updateStage = 'install_onlypackage';
                        console.log('[UPDATE] Installing dependencies...');
                        execSync('npm install', { stdio: 'inherit' });
                        console.log('[UPDATE] Fast update completed successfully! Restarting bot...');
                    } else {
                        updateStage = 'backup';
                        console.log('[UPDATE] Major update detected. Running full backup and reset...');
                        await createBackup();

                        updateStage = 'reset';
                        console.log(`[UPDATE] Updating local codebase from origin/${branch}...`);
                        execSync(`git reset --hard origin/${branch}`, { stdio: 'inherit' });
                        execCmd('git clean -fd');

                        if (needsNpmInstall) {
                            updateStage = 'install_major';
                            console.log('[UPDATE] Installing dependencies...');
                            execSync('npm install', { stdio: 'inherit' });
                        } else {
                            console.log('[UPDATE] No dependencies changed. Skipping npm install.');
                        }

                        console.log('[UPDATE] Full update completed successfully! Restarting bot...');
                    }

                    process.exit(0);
                } catch (updateError) {
                    console.error('\n[UPDATE] Error during update:', updateError.message || updateError);
                    console.log('[UPDATE] Initiating Safe-Fail rollback procedure...');

                    try {
                        if (updateStage === 'merge' || updateStage === 'install_onlypackage') {
                            console.log('[ROLLBACK] Aborting git merge...');
                            execCmd('git merge --abort');
                            if (updateStage === 'install_onlypackage') {
                                console.log('[ROLLBACK] Reverting npm install...');
                                execCmd('npm install');
                            }
                        } else if (updateStage === 'reset' || updateStage === 'install_major') {
                            console.log(`[ROLLBACK] Reverting code back to commit ${localCommit}...`);
                            execCmd(`git reset --hard ${localCommit}`);
                            if (updateStage === 'install_major') {
                                console.log('[ROLLBACK] Reverting dependencies...');
                                execCmd('npm install');
                            }
                        }
                        console.log('[UPDATE] Safe-Fail rollback completed successfully. Bot is safe.');
                    } catch (rollbackError) {
                        console.error('[FATAL] Rollback also failed! You may need to manually restore from backup or run "npm run fallback".');
                        console.error(rollbackError.message || rollbackError);
                    }

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
        setTimeout(() => {
            checkForUpdates();
            setInterval(checkForUpdates, intervalMs);
        }, 5000);
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
