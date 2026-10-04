const assert = require('node:assert/strict');
const { test } = require('node:test');
const achievementChecker = require('./achievementChecker');
const achievementManager = require('./achievementManager');
const { mineralData } = require('../Mining/mineCore');

test('mining rarity achievements use historical mined totals', async () => {
    const grants = [];
    const originalCheckAndGrant = achievementManager.checkAndGrant;
    achievementManager.checkAndGrant = async (userId, achievementId) => {
        grants.push(achievementId);
        return true;
    };

    try {
        const profile = {
            historicalMines: { Common: 50, Uncommon: 0, Rare: 0, Epic: 0, Legendary: 0, Mythic: 0 },
            achievements: [],
        };
        await achievementChecker.checkMining('test-user', profile);

        assert.deepEqual(grants, ['mine_common_50']);
        assert.deepEqual(profile.achievements, ['mine_common_50']);
    } finally {
        achievementManager.checkAndGrant = originalCheckAndGrant;
    }
});

test('mining special achievements cover bomb streaks, first finds, flint, and full collection', async () => {
    const grants = [];
    const originalCheckAndGrant = achievementManager.checkAndGrant;
    achievementManager.checkAndGrant = async (userId, achievementId) => {
        grants.push(achievementId);
        return true;
    };

    try {
        const allMinerals = Object.values(mineralData).flat();
        const profile = {
            historicalMines: {},
            historicalMinerals: allMinerals.map(mineral => mineral.id),
            bombStreak: 5,
            achievements: [],
        };

        await achievementChecker.checkMining('test-user', profile, { type: 'bomb' });
        await achievementChecker.checkMining('test-user', profile, { type: 'chest' });
        await achievementChecker.checkMining('test-user', profile, { type: 'exit', immediate: true });
        await achievementChecker.checkMining('test-user', profile, {
            type: 'minerals',
            minerals: [{ id: 'flint' }],
        });

        assert.deepEqual(grants, [
            'mine_bomb_5',
            'mine_chest_first',
            'mine_exit_first',
            'mine_flint',
            'mine_minerals_all',
        ]);
        assert.deepEqual(profile.achievements, grants);
    } finally {
        achievementManager.checkAndGrant = originalCheckAndGrant;
    }
});
