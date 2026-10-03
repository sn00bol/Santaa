const WOOD_TYPES = ['wood', 'birchwood', 'oakwood', 'pinewood'];

const CUT_DROP_TABLE = [
    { id: 'wood',      weight: 60, min: 1, max: 3 },
    { id: 'birchwood', weight: 25, min: 1, max: 2 },
    { id: 'oakwood',   weight: 12, min: 1, max: 2 },
    { id: 'pinewood',  weight: 3,  min: 1, max: 1 },
];

const PICKAXE_UPGRADE_TIERS = [
    { oak: 2,  pine: 0,  money: 100,   luckBonus: 0.10, durabilityBonus: 8  },
    { oak: 3,  pine: 0,  money: 200,   luckBonus: 0.10, durabilityBonus: 8  },
    { oak: 4,  pine: 1,  money: 400,   luckBonus: 0.15, durabilityBonus: 10 },
    { oak: 5,  pine: 2,  money: 800,   luckBonus: 0.15, durabilityBonus: 10 },
    { oak: 6,  pine: 3,  money: 1600,  luckBonus: 0.20, durabilityBonus: 12 },
    { oak: 8,  pine: 4,  money: 3200,  luckBonus: 0.20, durabilityBonus: 12 },
    { oak: 10, pine: 6,  money: 6400,  luckBonus: 0.25, durabilityBonus: 15 },
    { oak: 15, pine: 10, money: 12800, luckBonus: 0.30, durabilityBonus: 20 },
];

// helmet: { wood, oak, money, healthBonus }
const HELMET_UPGRADE_TIERS = [
    { wood: 3,  oak: 0,  money: 80,    healthBonus: 3  },
    { wood: 4,  oak: 1,  money: 160,   healthBonus: 3  },
    { wood: 5,  oak: 2,  money: 320,   healthBonus: 5  },
    { wood: 6,  oak: 3,  money: 640,   healthBonus: 5  },
    { wood: 8,  oak: 5,  money: 1280,  healthBonus: 7  },
    { wood: 10, oak: 7,  money: 2560,  healthBonus: 7  },
    { wood: 12, oak: 9,  money: 5120,  healthBonus: 10 },
    { wood: 18, oak: 14, money: 10240, healthBonus: 10 },
];

const MAX_UPGRADE_LEVEL = 8;

const NON_FIXABLE_IDS = new Set(['hand', 'minehand', 'finger', 'wood', 'birchwood', 'oakwood', 'pinewood']);
const NON_FIXABLE_TYPES = new Set(['craft', 'food']);

function isFixable(item) {
    if (!item || !item.id) return false;
    if (NON_FIXABLE_IDS.has(item.id)) return false;
    if (!item.durability || item.durability === Infinity) return false;
    if (Array.isArray(item.type) && item.type.some(t => NON_FIXABLE_TYPES.has(t))) return false;
    return true;
}

function getUpgradeType(item) {
    if (!item || !item.id) return null;
    if (!Array.isArray(item.type)) return null;
    if (item.id === 'minehand' || item.id === 'defaultpickaxe') return null; // starter items not upgradable
    if (item.type.includes('mine') && item.durability && item.luck !== undefined) return 'pickaxe';
    if (item.type.includes('mine') && item.stats?.health !== undefined) return 'helmet';
    return null;
}

function isUpgradable(item) {
    return getUpgradeType(item) !== null;
}

function getFixCost(item) {
    if (!item) return null;
    const maxDur = Number(item.durability) || 10;
    const woodCost = Math.ceil(maxDur / 8);
    const moneyCost = Math.max(10, Math.ceil((item.cost || 0) * 0.15));
    return { woodId: 'wood', woodCost, moneyCost };
}

function getUpgradeTier(upgradeType, currentLevel) {
    if (currentLevel >= MAX_UPGRADE_LEVEL) return null;
    if (upgradeType === 'pickaxe') return PICKAXE_UPGRADE_TIERS[currentLevel] || null;
    if (upgradeType === 'helmet')  return HELMET_UPGRADE_TIERS[currentLevel]  || null;
    return null;
}

function getAppliedStats(upgradeType, level) {
    const tiers = upgradeType === 'pickaxe' ? PICKAXE_UPGRADE_TIERS : HELMET_UPGRADE_TIERS;
    let luckBonus = 0;
    let durabilityBonus = 0;
    let healthBonus = 0;
    for (let i = 0; i < Math.min(level, MAX_UPGRADE_LEVEL); i++) {
        const t = tiers[i];
        if (!t) break;
        luckBonus       += t.luckBonus       || 0;
        durabilityBonus += t.durabilityBonus  || 0;
        healthBonus     += t.healthBonus      || 0;
    }
    return { luckBonus, durabilityBonus, healthBonus };
}

function rollWoodDrop() {
    const totalWeight = CUT_DROP_TABLE.reduce((s, e) => s + e.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of CUT_DROP_TABLE) {
        roll -= entry.weight;
        if (roll <= 0) {
            const quantity = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
            return { id: entry.id, quantity };
        }
    }
    return { id: 'wood', quantity: 1 };
}

function getUpgradeLevel(profile, itemId) {
    return Number(profile?.upgrades?.[itemId]) || 0;
}

function setUpgradeLevel(profile, itemId, level) {
    if (!profile.upgrades) profile.upgrades = {};
    profile.upgrades[itemId] = level;
}

function formatTierCost(tier, upgradeType) {
    if (!tier) return 'Max level reached';
    const parts = [];
    if (upgradeType === 'pickaxe') {
        if (tier.oak  > 0) parts.push(`${tier.oak}x Oak Wood`);
        if (tier.pine > 0) parts.push(`${tier.pine}x Pine Wood`);
    } else {
        if (tier.wood > 0) parts.push(`${tier.wood}x Wood`);
        if (tier.oak  > 0) parts.push(`${tier.oak}x Oak Wood`);
    }
    parts.push(`$${tier.money.toLocaleString()}`);
    return parts.join(' + ');
}

module.exports = {
    WOOD_TYPES,
    CUT_DROP_TABLE,
    PICKAXE_UPGRADE_TIERS,
    HELMET_UPGRADE_TIERS,
    MAX_UPGRADE_LEVEL,
    isFixable,
    isUpgradable,
    getUpgradeType,
    getFixCost,
    getUpgradeTier,
    getAppliedStats,
    rollWoodDrop,
    getUpgradeLevel,
    setUpgradeLevel,
    formatTierCost,
};
