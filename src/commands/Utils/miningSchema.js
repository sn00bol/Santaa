const DEFAULT_MINING_PROFILE = {
    skill: {
        totalPoints: 0,
        totalXp: 0,
        levels: {},
    },
    historicalMines: {
        Common: 0,
        Uncommon: 0,
        Rare: 0,
        Epic: 0,
        Legendary: 0,
        Mythic: 0,
    },
    historicalMinerals: [],
    bombStreak: 0,
    achievements: [],
    equipment: {
        currentPickaxe: 'defaultpickaxe',
        currentHelmet: 'defaulthelmet',
        currentBackpack: 'defaultbackpack',
        pickaxeDurability: 80,
        helmetDurability: 15,
        helmetHealth: 15,
        helmetHealths: {},
    },
    fallbackPickaxe: 'minehand',
    initialItemsGranted: false,
};

function parseMiningProfile(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = null;
        }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        parsed = {};
    }

    const fallbackPickaxe = parsed.fallbackPickaxe || DEFAULT_MINING_PROFILE.fallbackPickaxe;
    const skill = parsed.skill && typeof parsed.skill === 'object' ? parsed.skill : {};
    const skillLevels = skill.levels && typeof skill.levels === 'object' && !Array.isArray(skill.levels)
        ? skill.levels
        : {};
    const equipment = {
        ...DEFAULT_MINING_PROFILE.equipment,
        ...(parsed.equipment && typeof parsed.equipment === 'object' ? parsed.equipment : {}),
    };

    const pickaxeDurability = Number(equipment.pickaxeDurability);
    equipment.pickaxeDurability = Number.isFinite(pickaxeDurability) ? Math.max(0, pickaxeDurability) : 0;
    if (equipment.pickaxeDurability <= 0 && equipment.currentPickaxe !== fallbackPickaxe) {
        equipment.currentPickaxe = fallbackPickaxe;
    }

    if (!equipment.helmetHealths || typeof equipment.helmetHealths !== 'object') {
        equipment.helmetHealths = {};
    }

    let helmetHealth = Number(equipment.helmetHealth);
    if (!Number.isFinite(helmetHealth)) {
        const legacyDur = Number(equipment.helmetDurability);
        helmetHealth = Number.isFinite(legacyDur) && legacyDur <= 25 && legacyDur > 0 ? legacyDur : 15;
    }
    equipment.helmetHealth = Math.max(0, helmetHealth);
    equipment.helmetDurability = equipment.helmetHealth;

    if (equipment.helmetHealth <= 0) {
        equipment.currentHelmet = null;
    }

    if (!equipment.currentPickaxe) equipment.currentPickaxe = fallbackPickaxe;
    if (!equipment.currentBackpack) equipment.currentBackpack = 'defaultbackpack';

    return {
        ...parsed,
        historicalMines: {
            ...DEFAULT_MINING_PROFILE.historicalMines,
            ...(parsed.historicalMines && typeof parsed.historicalMines === 'object' ? parsed.historicalMines : {}),
        },
        historicalMinerals: Array.isArray(parsed.historicalMinerals) ? parsed.historicalMinerals : [],
        bombStreak: Math.max(0, Number(parsed.bombStreak) || 0),
        achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
        skill: {
            ...DEFAULT_MINING_PROFILE.skill,
            ...skill,
            totalPoints: Math.max(0, Number(skill.totalPoints) || 0),
            totalXp: Math.max(0, Number(skill.totalXp) || 0),
            levels: skillLevels,
        },
        equipment,
        fallbackPickaxe,
        initialItemsGranted: Boolean(parsed.initialItemsGranted),
    };
}

module.exports = {
    DEFAULT_MINING_PROFILE,
    parseMiningProfile,
};