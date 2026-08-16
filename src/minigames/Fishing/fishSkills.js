// Fishing Skill System
// Skills are organized into three branches: economic, rod, bucket.
// Each skill is leveled up by spending skill points.
// Skill points are earned by catching fish — rarer fish award more points.

// Points awarded per rarity
const RARITY_POINTS = {
    COMMON: 1,
    UNCOMMON: 2,
    RARE: 3,
    EPIC: 5,
    LEGENDARY: 8,
    MYTHIC: 15,
};

// Roman numeral labels for levels
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * All skill branches and their skills.
 * Each skill:
 *   id          - unique key stored in profile.skill.levels
 *   name        - display name
 *   desc        - description shown in UI
 *   maxLevel    - max upgradeable levels (skills with maxLevel: 1 are "one-shot" unlocks)
 *   cost        - points required per level (always 1)
 *   rodRequired - if set, skill only activates when this rod is equipped
 */
const SKILL_BRANCHES = {
    economic: {
        label: 'Economic',
        emoji: '💰',
        skills: [
            {
                id: 'shopping_god',
                name: 'Shopping God',
                desc: 'Reduces item prices in the fishing shop. Each level cuts an additional 2% off the cost.',
                maxLevel: 5,
                cost: 1,
                effectPerLevel: (level) => level * 2, // % discount
            },
            {
                id: 'sellers_man',
                name: 'The Sellers Man',
                desc: 'When selling fish, gain a bonus on the sell price. Starts at +3%, increasing by 0.25% each level.',
                maxLevel: 6,
                cost: 1,
                effectPerLevel: (level) => 3 + (level - 1) * 0.25, // % bonus
            },
        ],
    },
    rod: {
        label: 'Fishing Rod',
        emoji: '🎣',
        skills: [
            {
                id: 'hand_lovers',
                name: 'The Hand Lovers',
                desc: 'When fishing bare-handed, boosts the chance of catching fish instead of junk. Starts at +3%, +0.55% per level.',
                maxLevel: 6,
                cost: 1,
                rodRequired: 'hand',
                effectPerLevel: (level) => 3 + (level - 1) * 0.55, // % fish chance bonus
            },
            {
                id: 'bazookanist',
                name: 'Bazookanist',
                desc: 'Only works with Dynamite Kaboom. Slightly improves the rarity penalty from explosions. Starts at +0.5%, +0.25% per level.',
                maxLevel: 5,
                cost: 1,
                rodRequired: 'kaboom',
                effectPerLevel: (level) => 0.5 + (level - 1) * 0.25, // rarity penalty reduction
            },
            {
                id: 'im_stronger',
                name: "Im stronger, Im better!",
                desc: 'Increases the maximum durability of all fishing rods. Each level adds +10 max durability.',
                maxLevel: 5,
                cost: 1,
                effectPerLevel: (level) => level * 10, // bonus max durability
            },
            {
                id: 'im_smarter',
                name: 'IM SMARTER!',
                desc: 'Increases the reel power of all fishing rods. Each level adds +0.2 reel power.',
                maxLevel: 5,
                cost: 1,
                effectPerLevel: (level) => level * 0.2, // bonus reel power
            },
            {
                id: 'buckets_enhanced',
                name: 'Buckets Enhanced',
                desc: 'Only works with A Bucket rod. Reduces the rarity penalty from bucket fishing. Starts at +0.5%, +0.25% per level.',
                maxLevel: 6,
                cost: 1,
                rodRequired: 'bucketRod',
                effectPerLevel: (level) => 0.5 + (level - 1) * 0.25, // rarity penalty reduction
            },
        ],
    },
    bucket: {
        label: 'Buckets',
        emoji: '🪣',
        skills: [
            {
                id: 'one_hand',
                name: 'One hand hold buckets, one hand hold fishing rod, last one hold a fish',
                desc: 'Increases the capacity of every bucket you own. Each level adds +1 slot.',
                maxLevel: 2,
                cost: 1,
                effectPerLevel: (level) => level, // extra capacity per bucket
            },
            {
                id: 'slot_6',
                name: 'Unlock slot #6',
                desc: 'Unlocks the sixth bucket display slot, allowing you to equip more buckets at once.',
                maxLevel: 1,
                cost: 1,
                effectPerLevel: () => 1,
            },
            {
                id: 'slot_7',
                name: 'Unlock slot #7',
                desc: 'Unlocks the seventh bucket display slot.',
                maxLevel: 1,
                cost: 1,
                prereq: 'slot_6', // must unlock slot_6 first
                effectPerLevel: () => 1,
            },
        ],
    },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get current level of a skill from profile (0 = not unlocked). */
function getSkillLevel(profile, skillId) {
    return Number((profile?.skill?.levels || {})[skillId]) || 0;
}

/** Compute the effect value at a given level (returns 0 if level is 0). */
function getSkillEffect(skillId, level) {
    if (level <= 0) return 0;
    for (const branch of Object.values(SKILL_BRANCHES)) {
        const skill = branch.skills.find(s => s.id === skillId);
        if (skill) return skill.effectPerLevel(level);
    }
    return 0;
}

/** Total skill points already spent across all skills. */
function getSpentPoints(profile) {
    const levels = (profile?.skill?.levels) || {};
    return Object.values(levels).reduce((sum, v) => sum + Number(v || 0), 0);
}

/** Available (unspent) skill points. */
function getAvailablePoints(profile) {
    const total = Number(profile?.skill?.totalPoints) || 0;
    return Math.max(0, total - getSpentPoints(profile));
}

/** Find a skill definition by id. Returns { branch, skill } or null. */
function findSkill(skillId) {
    for (const [branchKey, branch] of Object.entries(SKILL_BRANCHES)) {
        const skill = branch.skills.find(s => s.id === skillId);
        if (skill) return { branchKey, branch, skill };
    }
    return null;
}

/**
 * Try to unlock the next level of a skill.
 * Returns { ok, message } — mutates profile.skill in-place on success.
 */
function unlockSkillLevel(profile, skillId) {
    profile.skill = profile.skill || {};
    profile.skill.levels = profile.skill.levels || {};
    profile.skill.totalPoints = Number(profile.skill.totalPoints) || 0;

    const found = findSkill(skillId);
    if (!found) return { ok: false, message: 'Skill not found.' };
    const { skill } = found;

    const currentLevel = getSkillLevel(profile, skillId);
    if (currentLevel >= skill.maxLevel) {
        return { ok: false, message: `**${skill.name}** is already at max level.` };
    }

    // Check prereq
    if (skill.prereq && getSkillLevel(profile, skill.prereq) < 1) {
        const prereqFound = findSkill(skill.prereq);
        const prereqName = prereqFound ? prereqFound.skill.name : skill.prereq;
        return { ok: false, message: `You must unlock **${prereqName}** first.` };
    }

    const available = getAvailablePoints(profile);
    if (available < skill.cost) {
        return { ok: false, message: `Not enough skill points! You need **${skill.cost}** but have **${available}**.` };
    }

    profile.skill.levels[skillId] = currentLevel + 1;
    return { ok: true, newLevel: currentLevel + 1 };
}

/**
 * Reset all skill levels — refund spent points back to totalPoints pool.
 * Mutates profile.skill in-place.
 */
function resetSkills(profile) {
    profile.skill = profile.skill || {};
    profile.skill.levels = {};
}

/**
 * Award skill points for catching a fish. Call after a successful catch.
 * `rarity` should be a RARITY_CONFIG key e.g. 'COMMON', 'MYTHIC'.
 * Mutates profile.skill in-place.
 */
function awardSkillPoints(profile, rarity) {
    const points = RARITY_POINTS[String(rarity).toUpperCase()] || 1;
    profile.skill = profile.skill || {};
    profile.skill.totalPoints = (Number(profile.skill.totalPoints) || 0) + points;
    return points;
}

/**
 * Build the Roman-numeral level progress text for a skill.
 * ✔️ = unlocked, ✖️ = locked
 */
function buildLevelList(profile, skill) {
    const current = getSkillLevel(profile, skill.id);
    return Array.from({ length: skill.maxLevel }, (_, i) => {
        const emoji = i < current ? '✔️' : '✖️';
        return `${emoji} ${ROMAN[i] || (i + 1)}`;
    }).join('\n');
}

/**
 * Build a short bar showing how many levels of a skill are unlocked.
 * Used on the main skill menu.
 */
function buildBranchBar(profile, branch, barLength = 8) {
    const skills = branch.skills;
    const totalLevels = skills.reduce((sum, s) => sum + s.maxLevel, 0);
    const unlockedLevels = skills.reduce((sum, s) => sum + getSkillLevel(profile, s.id), 0);
    const filled = Math.min(barLength, Math.round((unlockedLevels / Math.max(1, totalLevels)) * barLength));
    return `${'█'.repeat(filled)}${'░'.repeat(barLength - filled)} ${unlockedLevels}/${totalLevels}`;
}

module.exports = {
    SKILL_BRANCHES,
    RARITY_POINTS,
    ROMAN,
    getSkillLevel,
    getSkillEffect,
    getSpentPoints,
    getAvailablePoints,
    findSkill,
    unlockSkillLevel,
    resetSkills,
    awardSkillPoints,
    buildLevelList,
    buildBranchBar,
};
