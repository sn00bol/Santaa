const fs = require('fs');
const path = require('path');
const { isVisibleItem } = require('../../commands/Utils/itemVisibility');

const RARITY_CONFIG = {
    COMMON:    { weight: 50, label: 'Common',    emoji: '⚪', valueMultiplier: 1,   exp: 5   },
    UNCOMMON:  { weight: 30, label: 'Uncommon',  emoji: '🟢', valueMultiplier: 2,   exp: 12  },
    RARE:      { weight: 10, label: 'Rare',      emoji: '🔵', valueMultiplier: 5,   exp: 25  },
    EPIC:      { weight: 5.25, label: 'Epic',      emoji: '🟣', valueMultiplier: 15,  exp: 45  },
    LEGENDARY: { weight: 4.25,  label: 'Legendary', emoji: '🟡', valueMultiplier: 50,  exp: 100 },
    MYTHIC:    { weight: 0.5,  label: 'Mythic',    emoji: '🔴', valueMultiplier: 200, exp: 300 },
};

const mineralData = { COMMON: [], UNCOMMON: [], RARE: [], EPIC: [], LEGENDARY: [], MYTHIC: [] };

const resolveMineralsBaseDir = () => {
    const candidates = [
        path.join(__dirname, '..', '..', 'items', 'mine'),
        path.join(__dirname, 'minerals')
    ];
    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
};

const loadMinerals = () => {
    const baseDir = resolveMineralsBaseDir();
    for (const rarity of Object.keys(RARITY_CONFIG)) {
        const rarityDir = path.join(baseDir, rarity.charAt(0) + rarity.slice(1).toLowerCase());
        if (fs.existsSync(rarityDir)) {
            const files = fs.readdirSync(rarityDir).filter(f => f.endsWith('.js'));
            for (const file of files) {
                const mineral = require(path.join(rarityDir, file));
                if (!mineral || !mineral.id) continue;
                if (!isVisibleItem(mineral)) continue;
                mineral.rarity = rarity;
                mineralData[rarity].push(mineral);
            }
        }
    }
};

loadMinerals();

const getRandomMineral = () => {
    const roll = Math.random() * 100;
    let cumulativeWeight = 0;

    for (const [rarity, config] of Object.entries(RARITY_CONFIG)) {
        cumulativeWeight += config.weight;
        if (roll <= cumulativeWeight) {
            const pool = mineralData[rarity];
            return pool[Math.floor(Math.random() * pool.length)];
        }
    }
    return mineralData.COMMON[0];
};

const calculateExp = (mineral) => {
    if (!mineral) return 0;
    const r = mineral.rarity || 'COMMON';
    const cfg = RARITY_CONFIG[r] || RARITY_CONFIG.COMMON;
    // Base exp from rarity; scale lightly by sell value
    const base = cfg.exp || 5;
    const sellFactor = Math.max(1, Math.floor((mineral.sell || 10) / 10));
    return Math.max(1, Math.floor(base * sellFactor));
};

module.exports = {
    RARITY_CONFIG,
    mineralData,
    getRandomMineral,
    calculateExp
};
