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

const ROD_STATS = {
    hand: { reelPower: 3, mythicBoost: 1, multiCatch: 1, rarityPenalty: 0 },
    defaultRod: { reelPower: 4, mythicBoost: 1, multiCatch: 1, rarityPenalty: 0 },
    sharkRod: { reelPower: 3, mythicBoost: 2, multiCatch: 1, rarityPenalty: 0 },
    kaboom: { reelPower: 3, mythicBoost: 1, multiCatch: 3, rarityPenalty: 10 },
    bucketRod: { reelPower: 3, mythicBoost: 1, multiCatch: { min: 3, max: 5 }, rarityPenalty: 20 },
    niceGlove: { reelPower: 3, mythicBoost: 1, multiCatch: 2, rarityPenalty: 0 },
};

const BAIT_STATS = {
    finger: { reelPower: 3, rarityLimit: 'RARE', rateBoost: 1 },
    crank: { reelPower: 3, rarityLimit: null, rateBoost: 1.2 },
    jig: { reelPower: 5, rarityLimit: null, rateBoost: 1 },
    worm: { reelPower: 3, rarityLimit: null, rateBoost: 1.1 },
};

// Tug-of-war strength parameters per rarity
const FISH_STRENGTH_PARAMS = {
    COMMON:    { baseStrength: 0.10, driftPerTick: 0.06, startPosition: 6, reelCooldown: 0 },
    UNCOMMON:  { baseStrength: 0.20, driftPerTick: 0.09, startPosition: 6, reelCooldown: 0 },
    EPIC:      { baseStrength: 0.35, driftPerTick: 0.13, startPosition: 7, reelCooldown: 0 },
    RARE:      { baseStrength: 0.50, driftPerTick: 0.17, startPosition: 7, reelCooldown: 0 },
    LEGENDARY: { baseStrength: 0.70, driftPerTick: 0.22, startPosition: 8, reelCooldown: 300 },
    MYTHIC:    { baseStrength: 0.90, driftPerTick: 0.28, startPosition: 9, reelCooldown: 400 },
};

// Fish emoji per rarity shown inside the tug-of-war bar
const FISH_RARITY_EMOJI = {
    COMMON:    '🐟',
    UNCOMMON:  '🐠',
    EPIC:      '🐡',
    RARE:      '🦈',
    LEGENDARY: '🐉',
    MYTHIC:    '🐙',
};

const TOW_BEHAVIORS = ['steady', 'burst', 'erratic'];

/**
 * Returns tug-of-war fight parameters derived from rarity and map tier.
 * @param {string} rarity - RARITY_CONFIG key (COMMON, UNCOMMON, EPIC, RARE, LEGENDARY, MYTHIC)
 * @param {number} mapTier - The current map tier (1–4)
 * @returns {{ baseStrength, driftPerTick, startPosition, reelCooldown, behavior }}
 */
function getFishStrengthParams(rarity, mapTier = 1) {
    const key = String(rarity).toUpperCase();
    const base = FISH_STRENGTH_PARAMS[key] || FISH_STRENGTH_PARAMS.COMMON;
    const tierBonus = (Math.max(1, mapTier) - 1) * 0.05;
    const behavior = TOW_BEHAVIORS[Math.floor(Math.random() * TOW_BEHAVIORS.length)];
    return {
        baseStrength:  Math.min(1.0,  base.baseStrength  + tierBonus),
        driftPerTick:  Math.min(0.35, base.driftPerTick  + tierBonus * 0.5),
        startPosition: base.startPosition,
        reelCooldown:  base.reelCooldown,
        behavior,
    };
}

// Cached fish data to avoid repeated filesystem operations
let fishDataCache = null;
let fishDataCacheTime = 0;
const FISH_DATA_CACHE_DURATION = 60000; // 1 minute cache

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

const getFishData = () => {
    const now = Date.now();
    if (!fishDataCache || (now - fishDataCacheTime) > FISH_DATA_CACHE_DURATION) {
        loadFish();
        fishDataCache = JSON.parse(JSON.stringify(fishData));
        fishDataCacheTime = now;
    }
    return fishDataCache || fishData;
};

loadFish();

function getRandomFish(rodId = 'hand', baitId = 'finger') {
    const rod = ROD_STATS[rodId] || ROD_STATS.hand;
    const bait = BAIT_STATS[baitId] || BAIT_STATS.finger;

    let roll = Math.random() * 100;
    let accumulatedWeight = 0;
    let selectedRarity = 'COMMON';

    // Apply Mythic Boost from SharkRod
    const mythicWeight = RARITY_CONFIG.MYTHIC.weight * (rod.mythicBoost || 1);
    
    // Adjust weights based on rod rarity penalty (for Kaboom/BucketRod)
    const penalty = rod.rarityPenalty || 0;

    for (const [rarity, config] of Object.entries(RARITY_CONFIG)) {
        let weight = config.weight;
        if (rarity === 'MYTHIC') weight = mythicWeight;
        if (penalty > 0 && (rarity === 'MYTHIC' || rarity === 'LEGENDARY')) {
            weight = Math.max(0.1, weight - penalty);
        }
        
        accumulatedWeight += weight;
        if (roll <= accumulatedWeight) {
            selectedRarity = rarity;
            break;
        }
    }

    // Apply Bait Rarity Limit (Finger)
    if (bait.rarityLimit) {
        const limits = { 'COMMON': 1, 'UNCOMMON': 2, 'EPIC': 3, 'RARE': 4, 'LEGENDARY': 5, 'MYTHIC': 6 };
        const currentLimit = limits[bait.rarityLimit];
        const selectedLimit = limits[selectedRarity];
        if (selectedLimit > currentLimit) {
            const allowedRarities = Object.keys(RARITY_CONFIG).filter(r => limits[r] <= currentLimit);
            selectedRarity = allowedRarities[Math.floor(Math.random() * allowedRarities.length)];
        }
    }

    const cachedFishData = getFishData();
    const pool = cachedFishData[selectedRarity];
    if (pool.length === 0) return null;

    const fish = pool[Math.floor(Math.random() * pool.length)];
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
    getFishStrengthParams,
    RARITY_CONFIG,
    ROD_STATS,
    BAIT_STATS,
    FISH_STRENGTH_PARAMS,
    FISH_RARITY_EMOJI,
    fishData,
    getFishData,
};