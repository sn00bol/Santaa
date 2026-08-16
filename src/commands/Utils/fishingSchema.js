const DEFAULT_FISHING_PROFILE = {
    level: 1,
    xp: 0,
    dailyStreak: 0,
    currentMap: null,
    unlockedMaps: [],
    historicalCatches: {
        Common: 0,
        Uncommon: 0,
        Rare: 0,
        Epic: 0,
        Legendary: 0,
        Mythic: 0,
    },
    equipment: {
        currentRod: 'defaultRod',
        currentBait: 'worm',
        durability: 100,
        baitStock: {
            worm: 5,
            finger: 0,
        },
    },
    bucket: {
        currentBucket: 'defaultBucket',
        maxSpace: 5,
        currentItems: [],
        fallbackBucket: 'YourHandLOL',
        // Per-bucket state keyed by the REAL inventory row id of each owned
        // bucket copy: { "<inventoryRowId>": { locked: bool, items: [{ id, name }] } }
        containers: {},
    },
    fallbackRod: 'hand',
    initialItemsGranted: false,
    skill: {
        // Legacy fields (kept for backward compat)
        profit: 0,
        fishingSkill: 0,
        duration: 0,
        // New skill system
        totalPoints: 0,    // cumulative points earned from catches
        levels: {},        // { skillId: levelNumber, ... }
    },
    durability: 100,
};

function generateProgressBar(current, max, length = 10) {
    const safeCurrent = Number.isFinite(current) ? Math.max(0, Number(current)) : 0;
    const safeMax = Number.isFinite(max) && max > 0 ? Number(max) : 1;
    const filled = Math.min(length, Math.max(0, Math.round((safeCurrent / safeMax) * length)));
    const empty = length - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percent = Math.round((safeCurrent / safeMax) * 100);
    return `${bar} ${safeCurrent}/${safeMax} (${percent}%)`;
}

function parseFishingProfile(raw) {
    if (!raw) return { ...DEFAULT_FISHING_PROFILE };
    let parsed;
    if (typeof raw === 'object') {
        parsed = raw;
    } else {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return { ...DEFAULT_FISHING_PROFILE };
        }
    }

    if (typeof parsed !== 'object' || parsed === null) {
        return { ...DEFAULT_FISHING_PROFILE };
    }

    const merged = {
        ...DEFAULT_FISHING_PROFILE,
        ...parsed,
        historicalCatches: {
            ...DEFAULT_FISHING_PROFILE.historicalCatches,
            ...(parsed.historicalCatches || {}),
        },
        equipment: {
            ...DEFAULT_FISHING_PROFILE.equipment,
            ...(parsed.equipment || {}),
        },
        bucket: {
            ...DEFAULT_FISHING_PROFILE.bucket,
            ...(parsed.bucket || {}),
            // Fresh per-call object so distinct profiles never share the default
            // containers reference (mutating one profile would leak into another).
            containers: (parsed.bucket && parsed.bucket.containers && typeof parsed.bucket.containers === 'object')
                ? parsed.bucket.containers
                : {},
        },
        skill: {
            ...DEFAULT_FISHING_PROFILE.skill,
            ...(parsed.skill || {}),
            // Always ensure levels is a plain object, never undefined
            levels: (parsed.skill && parsed.skill.levels && typeof parsed.skill.levels === 'object')
                ? parsed.skill.levels
                : {},
            totalPoints: Number((parsed.skill && parsed.skill.totalPoints) || 0),
        },
    };

    if (merged.equipment.baitStock?.worm <= 0) {
        merged.equipment.currentBait = 'finger';
    }

    if (merged.equipment.durability <= 0) {
        merged.equipment.currentRod = merged.fallbackRod || 'hand';
        merged.equipment.durability = 0;
    }

    if (!merged.bucket.currentBucket) {
        merged.bucket.currentBucket = DEFAULT_FISHING_PROFILE.bucket.currentBucket;
    }

    return merged;
}

function getActiveBait(profile) {
    const p = parseFishingProfile(profile);
    if (p.equipment.baitStock?.worm > 0) {
        return 'worm';
    }
    return 'finger';
}

function getActiveRod(profile) {
    const p = parseFishingProfile(profile);
    return p.equipment.durability > 0 ? p.equipment.currentRod : (p.fallbackRod || 'hand');
}

function getActiveBucket(profile) {
    const p = parseFishingProfile(profile);
    return p.bucket.currentBucket || p.bucket.fallbackBucket || DEFAULT_FISHING_PROFILE.bucket.fallbackBucket;
}

module.exports = {
    DEFAULT_FISHING_PROFILE,
    generateProgressBar,
    parseFishingProfile,
};
