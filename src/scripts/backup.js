const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const sqlite3 = require('sqlite3');

const backupDir = path.join(__dirname, '..', '..', '.backups');
const excludedRootEntries = new Set(['node_modules', '.git', '.scrap_dbtest', '.backups']);

function getFormattedDate() {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}${month}${year}`;
}

function ensureBackupDir(directory = backupDir) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
}

function getNextBackupNumber(dateStr, directory = backupDir) {
    ensureBackupDir(directory);
    const files = fs.readdirSync(directory);
    let maxNum = 0;

    files.forEach(file => {
        const match = file.match(new RegExp(`^${dateStr}_(\\d+)\\.zip$`));
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });

    return maxNum + 1;
}

function isSqliteFile(fileName) {
    return /\.(?:db|sqlite3?)$/i.test(fileName);
}

function isSqliteSidecar(fileName) {
    return /\.(?:db|sqlite3?)-(?:wal|shm|journal)$/i.test(fileName);
}

function createDatabaseSnapshot(sourcePath, destinationPath) {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(sourcePath, sqlite3.OPEN_READONLY, error => {
            if (error) return reject(error);

            const finish = backupError => {
                database.close(closeError => {
                    if (backupError) return reject(backupError);
                    if (closeError) return reject(closeError);
                    resolve();
                });
            };

            const backup = database.backup(destinationPath, backupError => {
                if (backupError) return finish(backupError);

                const step = () => backup.step(-1, (stepError, completed) => {
                    if (stepError) return finish(stepError);
                    if (completed) return finish();
                    step();
                });
                step();
            });
        });
    });
}

async function addDatabaseEntries(zip, sourceDirectory, archiveDirectory, tempDirectory) {
    const entries = fs.readdirSync(sourceDirectory, { withFileTypes: true });
    let snapshotIndex = 0;

    for (const entry of entries) {
        const sourcePath = path.join(sourceDirectory, entry.name);
        const archivePath = path.posix.join(archiveDirectory, entry.name);
        if (entry.isDirectory()) {
            await addDatabaseEntries(zip, sourcePath, archivePath, tempDirectory);
        } else if (entry.isFile() && isSqliteSidecar(entry.name)) {
            continue;
        } else if (entry.isFile() && isSqliteFile(entry.name)) {
            const snapshotPath = path.join(tempDirectory, `database-${snapshotIndex++}.sqlite`);
            await createDatabaseSnapshot(sourcePath, snapshotPath);
            zip.addLocalFile(snapshotPath, archiveDirectory, entry.name);
        } else if (entry.isFile()) {
            zip.addLocalFile(sourcePath, archiveDirectory, entry.name);
        }
    }
}

async function createBackup({ rootDir = path.join(__dirname, '..', '..'), outputDir = backupDir } = {}) {
    ensureBackupDir(outputDir);
    const dateStr = getFormattedDate();
    const backupFileName = `${dateStr}_${getNextBackupNumber(dateStr, outputDir)}.zip`;
    const backupFilePath = path.join(outputDir, backupFileName);
    const tempArchivePath = path.join(outputDir, `.${backupFileName}.${process.pid}.tmp`);
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'santaa-backup-'));

    try {
        const zip = new AdmZip();
        for (const item of fs.readdirSync(rootDir, { withFileTypes: true })) {
            if (excludedRootEntries.has(item.name) || item.name.startsWith('.env')) continue;

            const fullPath = path.join(rootDir, item.name);
            if (item.isDirectory() && item.name === 'database') {
                await addDatabaseEntries(zip, fullPath, item.name, tempDirectory);
            } else if (item.isDirectory()) {
                zip.addLocalFolder(fullPath, item.name);
            } else if (item.isFile()) {
                zip.addLocalFile(fullPath);
            }
        }

        zip.writeZip(tempArchivePath);
        fs.renameSync(tempArchivePath, backupFilePath);
        console.log(`[Backup] Successfully created backup: ${backupFileName}`);
        return backupFilePath;
    } catch (error) {
        console.error('[Backup] Error creating backup:', error);
        throw error;
    } finally {
        fs.rmSync(tempArchivePath, { force: true });
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
}

function listBackups() {
    ensureBackupDir();
    return fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.zip'))
        .sort((a, b) => {
            return fs.statSync(path.join(backupDir, b)).mtime.getTime() -
                fs.statSync(path.join(backupDir, a)).mtime.getTime();
        });
}

function restoreBackup(backupFileName) {
    return new Promise((resolve, reject) => {
        try {
            const backupFilePath = path.join(backupDir, backupFileName);
            if (!fs.existsSync(backupFilePath)) {
                return reject(new Error(`Backup file ${backupFileName} not found!`));
            }

            console.log(`[Backup] Restoring from ${backupFileName}...`);
            const zip = new AdmZip(backupFilePath);
            const rootDir = path.join(__dirname, '..', '..');

            zip.extractAllTo(rootDir, true);
            console.log(`[Backup] Successfully restored from ${backupFileName}`);
            resolve();
        } catch (error) {
            console.error(`[Backup] Error restoring backup:`, error);
            reject(error);
        }
    });
}

module.exports = {
    createBackup,
    listBackups,
    restoreBackup
};

if (require.main === module) {
    createBackup().catch(() => {
        process.exitCode = 1;
    });
}
