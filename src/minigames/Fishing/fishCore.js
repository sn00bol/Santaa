const fs = require('fs');
const path = require('path');
const { isVisibleItem } = require('../../commands/Utils/itemVisibility');

const RARITY_CONFIG = {
    COMMON: { weight: 40, label: 'Common', exp: 5 },
    UNCOMMON: { weight: 30, label: 'Uncommon', exp: 15 },
    EPIC: { weight: 20, label: 'Epic', exp: 30 }, // 20%
    RARE: { weight: 9, label: 'Rare', exp: 50 },     // 9%
    LEGENDARY: { weight: 1, label: 'Legendary', exp: 150 },
    MYTHIC: { weight: 0.5, label: 'Mythic', exp: 300 },
};

const fishData = {
    COMMON: [],
    UNCOMMON: [],
    EPIC: [],
    RARE: [],
    LEGENDARY: [],
    MYTHIC: []
};

const resolveFishBaseDir = () => {
    const candidates = [
        path.join(__dirname, '..', '..', 'items', 'fish'),
        path.join(__dirname, 'fish')
    ];
    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
};

const loadFish = () => {
    const fishBaseDir = resolveFishBaseDir();
    const rarities = Object.keys(RARITY_CONFIG);

    for (const rarity of rarities) {
        const rarityDir = path.join(fishBaseDir, rarity);
        if (fs.existsSync(rarityDir)) {
            const files = fs.readdirSync(rarityDir).filter(f => f.endsWith('.js'));
            for (const file of files) {
                try {
                    const fish = require(path.join(rarityDir, file));
                    // validate minimal fields
                    if (!fish || !fish.id || !fish.name || fish.sell === undefined) {
                        console.warn(`Skipping fish file ${file} in ${rarityDir}: missing id/name/sell`);
                        continue;
                    }
                    if (!isVisibleItem(fish)) continue;
                    // annotate rarity key
                    fish.rarity = rarity;
                    fishData[rarity].push(fish);
                } catch (e) {
                    console.warn(`Error loading fish file ${file} in ${rarityDir}:`, e.message);
                }
            }
        }
    }
};

loadFish();

function getRandomFish() {
    const roll = Math.random() * 100;
    let accumulatedWeight = 0;
    let selectedRarity = 'COMMON';

    for (const [rarity, config] of Object.entries(RARITY_CONFIG)) {
        accumulatedWeight += config.weight;
        if (roll <= accumulatedWeight) {
            selectedRarity = rarity;
            break;
        }
    }

    const pool = fishData[selectedRarity];
    if (pool.length === 0) return null;

    const fish = pool[Math.floor(Math.random() * pool.length)];
    // ensure returned fish includes rarity key and label
    return { ...fish, rarity: selectedRarity, rarityLabel: RARITY_CONFIG[selectedRarity].label };
}

function calculateExp(fish) {
    if (!fish) return 0;
    const r = fish.rarity || fish.rarityLabel || 'COMMON';
    const key = (RARITY_CONFIG[r]) ? r : Object.keys(RARITY_CONFIG).find(k => RARITY_CONFIG[k].label === r) || 'COMMON';
    const cfg = RARITY_CONFIG[key] || RARITY_CONFIG.COMMON;
    // scale by sell value slightly
    const sellFactor = Math.max(1, Math.floor((fish.sell || 10) / 10));
    return Math.max(1, Math.floor(cfg.exp * sellFactor));
}

module.exports = {
    getRandomFish,
    calculateExp,
    RARITY_CONFIG,
    fishData
};