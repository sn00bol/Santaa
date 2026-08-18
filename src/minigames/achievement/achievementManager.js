const fs = require('fs');
const path = require('path');

class AchievementManager {
    constructor() {
        this.achievements = [];
        this.categories = new Set();
        this.loadAchievements();
    }

    loadAchievements() {
        const achDir = path.join(__dirname, 'achievements');
        if (!fs.existsSync(achDir)) return;

        this.achievements = [];
        this.categories.clear();

        const walk = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    walk(fullPath);
                } else if (file.endsWith('.js')) {
                    try {
                        const ach = require(fullPath);
                        if (!ach.id || !ach.name || !ach.category || !ach.requirement) {
                            console.warn(`Achievement file ${file} is missing required fields (id, name, category, or requirement).`);
                            continue;
                        }
                        this.achievements.push(ach);
                        this.categories.add(ach.category);
                    } catch (e) {
                        console.error(`Error loading achievement ${file}:`, e);
                    }
                }
            }
        };

        walk(achDir);
    }

    getAchievements() {
        return this.achievements;
    }

    getCategories() {
        return Array.from(this.categories);
    }

    async checkAndGrant(userId, achievementId, profile, rpgmanager) {
        const ach = this.achievements.find(a => a.id === achievementId);
        if (!ach) return false;

        if (profile.achievements?.includes(achievementId)) return false;

        // Note: The logic for 'how' to achieve is usually called from the game logic
        // but this manager can handle the granting part.
        if (!profile.achievements) profile.achievements = [];
        profile.achievements.push(achievementId);
        
        await rpgmanager.updateProgress(userId, { fishing_profile: profile }); // This needs to be more generic, maybe a general profile update
        return true;
    }
}

module.exports = new AchievementManager();
