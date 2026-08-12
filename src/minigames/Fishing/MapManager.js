const fs = require('fs');
const path = require('path');

class MapManager {
    constructor() {
        this.maps = new Map();
        this.loadMaps();
    }

    loadMaps() {
        const mapsDir = path.join(__dirname, 'maps');
        if (!fs.existsSync(mapsDir)) {
            fs.mkdirSync(mapsDir, { recursive: true });
            return;
        }

        const loadFromDir = (dir) => {
            const list = fs.readdirSync(dir);
            for (const item of list) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    loadFromDir(fullPath);
                } else if (item.endsWith('.js')) {
                    try {
                        const mapDef = require(fullPath);
                        if (mapDef && mapDef.id) {
                            this.maps.set(mapDef.id, mapDef);
                        }
                    } catch (err) {
                        console.error(`Failed to load map ${item}:`, err);
                    }
                }
            }
        };

        loadFromDir(mapsDir);
    }

    getMap(mapId) {
        return this.maps.get(mapId);
    }

    getAllMaps() {
        return Array.from(this.maps.values()).sort((a, b) => a.tier - b.tier);
    }

    isMapUnlocked(mapId, historicalCatches) {
        const map = this.getMap(mapId);
        if (!map) return false;

        const c = historicalCatches?.Common || 0;
        const u = historicalCatches?.Uncommon || 0;
        const r = historicalCatches?.Rare || 0;
        const e = historicalCatches?.Epic || 0;
        const l = historicalCatches?.Legendary || 0;
        const m = historicalCatches?.Mythic || 0;
        
        const total = c + u + r + e + l + m;
        const commonUncommon = c + u;

        // Hidden map override condition
        if (total >= 1000 && m >= 1 && map.isHidden) {
            return true;
        }

        // If it's a hidden map and the requirement above isn't met, it remains locked
        if (map.isHidden) return false;

        switch (map.tier) {
            case 1:
                return true;
            case 2:
                // 100 Common, 50 Uncommon, 5 Rare
                return c >= 100 && u >= 50 && r >= 5;
            case 3:
                // Common + Uncommon 300, 50 Rare, 10 Epic
                return commonUncommon >= 300 && r >= 50 && e >= 10;
            case 4:
                // Common + Uncommon 500, 100 Rare, 50 Epic, 5 legendary
                return commonUncommon >= 500 && r >= 100 && e >= 50 && l >= 5;
            default:
                return false;
        }
    }

    getUnlockedMaps(historicalCatches) {
        return this.getAllMaps().filter(map => this.isMapUnlocked(map.id, historicalCatches));
    }

    getMapUnlockRequirements(map) {
        if (!map) return 'Unknown map.';
        if (map.isHidden) return 'Requires 1000 total catches and at least 1 Mythic catch.';
        
        switch (map.tier) {
            case 1:
                return 'No requirements.';
            case 2:
                return '100 Common, 50 Uncommon, 5 Rare.';
            case 3:
                return '300 (Common + Uncommon), 50 Rare, 10 Epic.';
            case 4:
                return '500 (Common + Uncommon), 100 Rare, 50 Epic, 5 Legendary.';
            default:
                return 'Unknown requirements.';
        }
    }

    rollFish(mapId, fishData, RARITY_CONFIG) {
        const map = this.getMap(mapId);
        if (!map || !map.rates) return null;

        // Roll rarity based on map rates
        const roll = Math.random() * 100;
        let accumulatedWeight = 0;
        let selectedRarity = 'COMMON';

        // Expected map.rates format: { COMMON: 45, UNCOMMON: 54, RARE: 0.9, EPIC: 0.1 }
        for (const [rarity, rate] of Object.entries(map.rates)) {
            accumulatedWeight += rate;
            if (roll <= accumulatedWeight) {
                selectedRarity = rarity;
                break;
            }
        }

        const pool = fishData[selectedRarity];
        if (!pool || pool.length === 0) return null;

        const fish = pool[Math.floor(Math.random() * pool.length)];
        return { ...fish, rarity: selectedRarity, rarityLabel: RARITY_CONFIG[selectedRarity]?.label || selectedRarity };
    }
}

module.exports = new MapManager();
