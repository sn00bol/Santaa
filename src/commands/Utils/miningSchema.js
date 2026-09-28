const DEFAULT_MINING_PROFILE = {
    equipment: {
        currentPickaxe: 'defaultpickaxe',
        currentHelmet: 'defaulthelmet',
        currentBackpack: 'defaultbackpack',
        pickaxeDurability: 80,
        helmetDurability: 100,
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
    const equipment = {
        ...DEFAULT_MINING_PROFILE.equipment,
        ...(parsed.equipment && typeof parsed.equipment === 'object' ? parsed.equipment : {}),
    };

    const pickaxeDurability = Number(equipment.pickaxeDurability);
    equipment.pickaxeDurability = Number.isFinite(pickaxeDurability) ? Math.max(0, pickaxeDurability) : 0;
    if (equipment.pickaxeDurability <= 0 && equipment.currentPickaxe !== fallbackPickaxe) {
        equipment.currentPickaxe = fallbackPickaxe;
    }

    const helmetDurability = Number(equipment.helmetDurability);
    equipment.helmetDurability = Number.isFinite(helmetDurability) ? Math.max(0, helmetDurability) : 0;
    if (equipment.helmetDurability <= 0) {
        equipment.currentHelmet = null;
    }

    if (!equipment.currentPickaxe) equipment.currentPickaxe = fallbackPickaxe;
    if (!equipment.currentBackpack) equipment.currentBackpack = 'defaultbackpack';

    return {
        ...parsed,
        equipment,
        fallbackPickaxe,
        initialItemsGranted: Boolean(parsed.initialItemsGranted),
    };
}

module.exports = {
    DEFAULT_MINING_PROFILE,
    parseMiningProfile,
};