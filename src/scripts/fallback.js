const readline = require('readline');
const { listBackups, restoreBackup } = require('./backup');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function runFallback() {
    console.log("=== Fallback System ===");
    const backups = listBackups();
    
    if (backups.length === 0) {
        console.log("No backups found in .backups directory.");
        process.exit(1);
    }
    
    console.log("Available backups:");
    backups.forEach((b, index) => {
        console.log(`[${index + 1}] ${b}`);
    });
    
    rl.question(`Select a backup to restore (1-${backups.length}): `, async (answer) => {
        const selectedIndex = parseInt(answer, 10) - 1;
        
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= backups.length) {
            console.log("Invalid selection. Exiting.");
            process.exit(1);
        }
        
        const selectedBackup = backups[selectedIndex];
        console.log(`\nWARNING: Restoring ${selectedBackup} will overwrite current files.`);
        rl.question(`Are you sure you want to proceed? (y/n): `, async (confirm) => {
            if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
                try {
                    await restoreBackup(selectedBackup);
                    console.log("Fallback successful! You can now restart the bot.");
                } catch (error) {
                    console.error("Fallback failed:", error);
                }
            } else {
                console.log("Fallback cancelled.");
            }
            process.exit(0);
        });
    });
}

runFallback();
