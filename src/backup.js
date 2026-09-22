const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const backupDir = path.join(__dirname, '..', '.backups');

function getFormattedDate() {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}${month}${year}`;
}

function ensureBackupDir() {
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
}

function getNextBackupNumber(dateStr) {
    ensureBackupDir();
    const files = fs.readdirSync(backupDir);
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

// Function to create a backup
function createBackup() {
    return new Promise((resolve, reject) => {
        try {
            ensureBackupDir();
            const dateStr = getFormattedDate();
            const nextNum = getNextBackupNumber(dateStr);
            const backupFileName = `${dateStr}_${nextNum}.zip`;
            const backupFilePath = path.join(backupDir, backupFileName);

            const zip = new AdmZip();
            const rootDir = path.join(__dirname, '..');

            const excludeList = ['node_modules', '.git', '.scrap_dbtest', '.backups'];

            const items = fs.readdirSync(rootDir);

            for (const item of items) {
                if (excludeList.includes(item)) continue;

                const fullPath = path.join(rootDir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    zip.addLocalFolder(fullPath, item);
                } else {
                    zip.addLocalFile(fullPath);
                }
            }

            zip.writeZip(backupFilePath);
            console.log(`[Backup] Successfully created backup: ${backupFileName}`);
            resolve(backupFilePath);
        } catch (error) {
            console.error(`[Backup] Error creating backup:`, error);
            reject(error);
        }
    });
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
            const rootDir = path.join(__dirname, '..');

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
