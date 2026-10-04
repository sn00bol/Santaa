const assert = require('node:assert/strict');
const { test } = require('node:test');
const { RARITY_ORDER, mineralData } = require('./mineCore');

test('every mining rarity loads five additional unique ores', () => {
    const ids = [];

    for (const rarity of RARITY_ORDER) {
        assert.equal(mineralData[rarity].length, 10, `${rarity} should have 10 ores`);
        ids.push(...mineralData[rarity].map(mineral => mineral.id));
    }

    assert.equal(new Set(ids).size, ids.length, 'ore IDs should be unique across rarities');
    for (const rarity of RARITY_ORDER) {
        for (const mineral of mineralData[rarity]) {
            assert.ok(mineral.name, `${mineral.id} should have a name`);
            assert.ok(mineral.cost > 0, `${mineral.id} should have a positive value`);
            assert.equal(mineral.rarity, rarity);
            assert.equal(mineral.is_sellable, true);
            assert.equal(mineral.is_tradeable, true);
        }
    }
});
