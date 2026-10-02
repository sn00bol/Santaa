const formatNumber = require('../../commands/Utils/formatNumber');

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

const SKILL_BRANCHES = {
    prospecting: {
        label: 'Prospecting',
        emoji: '🔎',
        skills: [
            {
                id: 'keen_eye',
                name: 'Keen Eye',
                desc: 'Improves the rarity luck of every pickaxe.',
                maxLevel: 5,
                cost: 1,
                effectPerLevel: level => level * 0.1,
                effectLabel: effect => `+${formatNumber(effect)} pickaxe luck`,
            },
            {
                id: 'vein_reader',
                name: 'Vein Reader',
                desc: 'Further improves the rarity luck of every pickaxe.',
                maxLevel: 5,
                cost: 1,
                prereq: 'keen_eye',
                effectPerLevel: level => level * 0.15,
                effectLabel: effect => `+${formatNumber(effect)} pickaxe luck`,
            },
        ],
    },
    toolcraft: {
        label: 'Toolcraft',
        emoji: '⛏️',
        skills: [
            {
                id: 'steady_grip',
                name: 'Steady Grip',
                desc: 'Chance to avoid losing pickaxe durability when a mining run starts.',
                maxLevel: 5,
                cost: 1,
                effectPerLevel: level => level * 0.05,
                effectLabel: effect => `${formatNumber(effect * 100)}% chance to preserve durability`,
            },
            {
                id: 'efficient_strike',
                name: 'Efficient Strike',
                desc: 'Earn more Mining EXP from collected ores.',
                maxLevel: 5,
                cost: 1,
                prereq: 'steady_grip',
                effectPerLevel: level => level * 0.04,
                effectLabel: effect => `+${formatNumber(effect * 100)}% Mining EXP`,
            },
        ],
    },
    survival: {
        label: 'Survival',
        emoji: '🛡️',
        skills: [
            {
                id: 'blast_training',
                name: 'Blast Training',
                desc: 'Reduce HP lost when a mining bomb explodes without helmet protection.',
                maxLevel: 5,
                cost: 1,
                effectPerLevel: level => level * 2,
                effectLabel: effect => `-${formatNumber(effect)} bomb damage`,
            },
        ],
    },
};

function getSkillLevel(profile, skillId) {
    return Math.max(0, Number(profile?.skill?.levels?.[skillId]) || 0);
}

function findSkill(skillId) {
    for (const [branchKey, branch] of Object.entries(SKILL_BRANCHES)) {
        const skill = branch.skills.find(entry => entry.id === skillId);
        if (skill) return { branchKey, branch, skill };
    }
    return null;
}

function getSkillEffect(skillId, level) {
    if (level <= 0) return 0;
    return findSkill(skillId)?.skill.effectPerLevel(level) || 0;
}

function getSpentPoints(profile) {
    const levels = profile?.skill?.levels || {};
    return Object.values(levels).reduce((sum, level) => sum + Math.max(0, Number(level) || 0), 0);
}

function getAvailablePoints(profile) {
    return Math.max(0, (Number(profile?.skill?.totalPoints) || 0) - getSpentPoints(profile));
}

function unlockSkillLevel(profile, skillId) {
    profile.skill = profile.skill || { totalPoints: 0, totalXp: 0, levels: {} };
    profile.skill.levels = profile.skill.levels || {};
    profile.skill.totalPoints = Math.max(0, Number(profile.skill.totalPoints) || 0);

    const found = findSkill(skillId);
    if (!found) return { ok: false, message: 'Skill not found.' };
    const { skill } = found;
    const currentLevel = getSkillLevel(profile, skillId);
    if (currentLevel >= skill.maxLevel) {
        return { ok: false, message: `**${skill.name}** is already at max level.` };
    }
    if (skill.prereq && getSkillLevel(profile, skill.prereq) < 1) {
        const prereqName = findSkill(skill.prereq)?.skill.name || skill.prereq;
        return { ok: false, message: `You must unlock **${prereqName}** first.` };
    }
    if (getAvailablePoints(profile) < skill.cost) {
        return { ok: false, message: `Not enough skill points! You need **${formatNumber(skill.cost)}**.` };
    }

    profile.skill.levels[skillId] = currentLevel + 1;
    return { ok: true, newLevel: currentLevel + 1 };
}

function resetSkills(profile) {
    profile.skill = profile.skill || { totalPoints: 0, totalXp: 0, levels: {} };
    profile.skill.levels = {};
}

function awardSkillPoints(profile, expGained) {
    profile.skill = profile.skill || { totalPoints: 0, totalXp: 0, levels: {} };
    profile.skill.levels = profile.skill.levels || {};
    const gained = Math.max(0, Number(expGained) || 0);
    const oldXp = Math.max(0, Number(profile.skill.totalXp) || 0);
    const newXp = oldXp + gained;
    const earnedPoints = Math.floor(newXp / 100) - Math.floor(oldXp / 100);

    profile.skill.totalXp = newXp;
    profile.skill.totalPoints = Math.max(0, Number(profile.skill.totalPoints) || 0) + earnedPoints;
    return { expGained: gained, earnedPoints };
}

function buildLevelList(profile, skill) {
    const current = getSkillLevel(profile, skill.id);
    return Array.from({ length: skill.maxLevel }, (_, index) => {
        const level = index + 1;
        const unlocked = index < current;
        const effect = skill.effectPerLevel(level);
        const label = skill.effectLabel ? skill.effectLabel(effect) : `Level ${formatNumber(level)} effect`;
        return `${unlocked ? '✔️' : '✖️'} **${ROMAN[index] || formatNumber(level)}** ${label}`;
    }).join('\n');
}

function buildBranchBar(profile, branch, barLength = 8) {
    const total = branch.skills.reduce((sum, skill) => sum + skill.maxLevel, 0);
    const unlocked = branch.skills.reduce((sum, skill) => sum + getSkillLevel(profile, skill.id), 0);
    const filled = Math.min(barLength, Math.round((unlocked / Math.max(1, total)) * barLength));
    return `${'█'.repeat(filled)}${'░'.repeat(barLength - filled)} ${formatNumber(unlocked)}/${formatNumber(total)}`;
}

module.exports = {
    ROMAN,
    SKILL_BRANCHES,
    getSkillLevel,
    findSkill,
    getSkillEffect,
    getSpentPoints,
    getAvailablePoints,
    unlockSkillLevel,
    resetSkills,
    awardSkillPoints,
    buildLevelList,
    buildBranchBar,
};