const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const sellCommand = require('../../commands/EconomicCMD/sell');

const originalSellItemsCore = sellCommand.sellItemsCore;
let sellItemsCoreResult;
sellCommand.sellItemsCore = async () => sellItemsCoreResult;
const fishBucket = require('./fishBucket');

const bucketDefinition = { id: 'testBucket', name: 'Test Bucket', capacity: 5 };
const fishDefinition = {
    id: 'testFish',
    name: 'Test Fish',
    cost: 100,
    is_sellable: true,
};

after(() => {
    sellCommand.sellItemsCore = originalSellItemsCore;
    allItemsCache.delete(bucketDefinition.id);
    allItemsCache.delete(fishDefinition.id);
});

test('selling all fish reports successful sales and removes only sold fish', async () => {
    allItemsCache.set(bucketDefinition.id, bucketDefinition);
    allItemsCache.set(fishDefinition.id, fishDefinition);
    sellItemsCoreResult = {
        totalEarned: 200,
        soldItems: [{
            itemId: fishDefinition.id,
            name: fishDefinition.name,
            quantity: 2,
            earned: 200,
        }],
    };

    const bucketItems = [
        { id: fishDefinition.id, name: fishDefinition.name },
        { id: fishDefinition.id, name: fishDefinition.name },
    ];
    const profile = {
        skill: { totalPoints: 0, levels: { sellers_man: 0 } },
        bucket: {
            currentBucket: bucketDefinition.id,
            containers: { 'test-bucket-row': { locked: false, items: bucketItems } },
            currentItems: bucketItems,
        },
    };
    const inventory = [{
        id: 'test-bucket-row',
        item_id: bucketDefinition.id,
        item_name: bucketDefinition.name,
    }];

    const result = await fishBucket.sellAllFish(
        'test-user',
        profile,
        inventory,
        'test-bucket-row'
    );

    assert.equal(result.ok, true);
    assert.equal(result.soldCount, 2);
    assert.equal(result.sold[0].name, fishDefinition.name);
    assert.equal(result.sold[0].earned, Math.round(200 * 1.0275));
    assert.equal(result.totalEarned, Math.round(200 * 1.0275));
    assert.deepEqual(profile.bucket.containers['test-bucket-row'].items, []);
});

test('selling no inventory-backed fish keeps fish in the bucket', async () => {
    sellItemsCoreResult = { totalEarned: 0, soldItems: [] };
    const fish = { id: fishDefinition.id, name: fishDefinition.name };
    const profile = {
        skill: { totalPoints: 1, levels: { sellers_man: 0 } },
        bucket: {
            currentBucket: bucketDefinition.id,
            containers: { 'test-bucket-row-2': { locked: false, items: [fish] } },
            currentItems: [fish],
        },
    };
    const inventory = [{
        id: 'test-bucket-row-2',
        item_id: bucketDefinition.id,
        item_name: bucketDefinition.name,
    }];

    const result = await fishBucket.sellAllFish(
        'test-user',
        profile,
        inventory,
        'test-bucket-row-2'
    );

    assert.equal(result.soldCount, 0);
    assert.deepEqual(profile.bucket.containers['test-bucket-row-2'].items, [fish]);
});
