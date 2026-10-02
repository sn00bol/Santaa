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

const RARITY_ORDER = Object.keys(RARITY_CONFIG);

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

const getRandomMineral = (options = {}) => {
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const pickaxe = options.pickaxe || null;
    const rawLuck = Number(options.luck ?? pickaxe?.luck);
    const luck = Math.max(0.05, (Number.isFinite(rawLuck) ? rawLuck : 1) + (Number(options.luckBonus) || 0));
    const canMineLegendaryPlus = !options.dynamite && Boolean(pickaxe?.canMineLegendaryPlus);
    const availableRarities = RARITY_ORDER.filter(rarity => mineralData[rarity].length > 0);
    if (!availableRarities.length) return null;

    const tierWeights = availableRarities.map(rarity => {
        const tier = RARITY_ORDER.indexOf(rarity);
        const blocked = tier >= RARITY_ORDER.indexOf('LEGENDARY') && !canMineLegendaryPlus;
        return {
            rarity,
            weight: blocked ? 0 : RARITY_CONFIG[rarity].weight * (luck ** tier),
        };
    });
    const eligibleWeights = tierWeights.filter(entry => entry.weight > 0);
    const totalWeight = eligibleWeights.reduce((sum, entry) => sum + entry.weight, 0);
    if (!totalWeight) return mineralData.COMMON[0] || mineralData[availableRarities[0]][0];

    let target;
    if (options.dynamite) {
        const configuredChance = Number(options.commonChance);
        const commonChance = Number.isFinite(configuredChance)
            ? Math.max(0.9, Math.min(0.95, configuredChance))
            : getDynamiteCommonChance(random);
        if (random() < commonChance && mineralData.COMMON.length) {
            return mineralData.COMMON[Math.floor(random() * mineralData.COMMON.length)];
        }
        const nonCommon = eligibleWeights.filter(entry => entry.rarity !== 'COMMON');
        target = random() * nonCommon.reduce((sum, entry) => sum + entry.weight, 0);
        for (const entry of nonCommon) {
            target -= entry.weight;
            if (target < 0) {
                return mineralData[entry.rarity][Math.floor(random() * mineralData[entry.rarity].length)];
            }
        }
        const fallbackRarity = nonCommon[0]?.rarity || 'COMMON';
        return mineralData[fallbackRarity][0];
    }

    target = random() * totalWeight;
    let selectedRarity = eligibleWeights[0].rarity;
    for (const entry of eligibleWeights) {
        target -= entry.weight;
        if (target < 0) {
            selectedRarity = entry.rarity;
            break;
        }
    }

    if (canMineLegendaryPlus) {
        const selectedTier = RARITY_ORDER.indexOf(selectedRarity);
        if (selectedTier >= RARITY_ORDER.indexOf('LEGENDARY')) {
            const lowerTier = RARITY_ORDER[selectedTier - 1];
            selectedRarity = mineralData[lowerTier].length
                ? lowerTier
                : [...availableRarities].reverse().find(rarity => RARITY_ORDER.indexOf(rarity) < selectedTier) || lowerTier;
        }
    }

    const pool = mineralData[selectedRarity];
    return pool[Math.floor(random() * pool.length)];
};

const getDynamiteCommonChance = (random = Math.random) => 0.9 + random() * 0.05;
const getDynamiteDropCount = (random = Math.random) => 3 + Math.floor(random() * 3);

const prioritizeMineralsByRarity = (minerals, capacity) => {
    const limit = Math.max(0, Math.floor(Number(capacity) || 0));
    return [...minerals]
        .sort((left, right) => RARITY_ORDER.indexOf(right.rarity) - RARITY_ORDER.indexOf(left.rarity))
        .slice(0, limit);
};

const calculateExp = (mineral) => {
    if (!mineral) return 0;
    const r = mineral.rarity || 'COMMON';
    const cfg = RARITY_CONFIG[r] || RARITY_CONFIG.COMMON;
    // Base exp from rarity; scale lightly by item cost.
    const base = cfg.exp || 5;
    const costFactor = Math.max(1, Math.floor((mineral.cost || 10) / 10));
    return Math.max(1, Math.floor(base * costFactor));
};

module.exports = {
    RARITY_CONFIG,
    RARITY_ORDER,
    mineralData,
    getRandomMineral,
    getDynamiteCommonChance,
    getDynamiteDropCount,
    prioritizeMineralsByRarity,
    calculateExp
};
