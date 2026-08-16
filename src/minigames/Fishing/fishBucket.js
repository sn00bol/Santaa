const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const fishSkills = require('./fishSkills');
const { isVisibleItem } = require('../../commands/Utils/itemVisibility');
const { sellItemsCore } = require('../../commands/EconomicCMD/sell');
const dbmanager = require('../../../database/dbmanager');
const rpgmanager = require('../../../database/rpgmanager');

const FREE_SLOT_COUNT = 5;

function isBucketItemDefinition(itemDef) {
    return Boolean(itemDef)
        && typeof itemDef.capacity === 'number'
        && itemDef.capacity > 0
        && isVisibleItem(itemDef);
}

function ensureContainers(profile, inventory) {
    profile.bucket = (profile.bucket && typeof profile.bucket === 'object') ? profile.bucket : {};
    if (!profile.bucket.containers || typeof profile.bucket.containers !== 'object') {
        profile.bucket.containers = {};
    }
    const containers = profile.bucket.containers;
    const activeItemId = profile.bucket.currentBucket || 'defaultBucket';

    const legacyItems = Array.isArray(profile.bucket.currentItems) ? profile.bucket.currentItems : [];
    const activeRow = inventory.find(inv =>
        inv.item_id === activeItemId && isBucketItemDefinition(allItemsCache.get(inv.item_id))
    );
    if (activeRow && legacyItems.length > 0 && !containers[String(activeRow.id)]) {
        containers[String(activeRow.id)] = { locked: false, items: legacyItems.slice() };
    }

    // Seed empty state for every owned bucket copy.
    for (const row of inventory) {
        if (isBucketItemDefinition(allItemsCache.get(row.item_id)) && !containers[String(row.id)]) {
            containers[String(row.id)] = { locked: false, items: [] };
        }
    }

    return containers;
}

/**
 * Keep the profile mirrors (currentItems / maxSpace) pointing at the ACTIVE
 * fishing bucket so every other UI that reads bucket stats stays accurate.
 */
function syncActiveBucket(profile, inventory) {
    const containers = ensureContainers(profile, inventory);
    const activeItemId = profile.bucket.currentBucket || 'defaultBucket';
    const activeRow = inventory.find(inv =>
        inv.item_id === activeItemId && isBucketItemDefinition(allItemsCache.get(inv.item_id))
    );
    if (activeRow) {
        const state = containers[String(activeRow.id)];
        if (state) {
            if (!Array.isArray(state.items)) state.items = [];
            profile.bucket.currentItems = state.items;
            profile.bucket.maxSpace = Number(allItemsCache.get(activeRow.item_id).capacity) || 1;
            return state;
        }
    }
    return null;
}

function containersOfBucket(profile, bucketKey) {
    return profile.bucket && profile.bucket.containers ? profile.bucket.containers[String(bucketKey)] : null;
}

/**
 * Resolve the player's real buckets from their actual inventory (one entry per
 * owned copy). Never a hardcoded list — checks the real item `capacity`.
 */
function getOwnedBuckets(profile = {}, inventory = []) {
    ensureContainers(profile, inventory);
    syncActiveBucket(profile, inventory);

    const oneHandLevel = fishSkills.getSkillLevel(profile, 'one_hand');
    const activeItemId = profile.bucket.currentBucket || 'defaultBucket';
    let activeAssigned = false;
    const owned = [];

    for (const row of inventory) {
        const def = allItemsCache.get(row.item_id);
        if (!isBucketItemDefinition(def)) continue;
        const state = containersOfBucket(profile, row.id) || { locked: false, items: [] };
        if (!Array.isArray(state.items)) state.items = [];
        const isActive = !activeAssigned && row.item_id === activeItemId;
        if (isActive) activeAssigned = true;
        // one_hand skill: +1 capacity per level
        const baseCapacity = Number(def.capacity) || 1;
        const enhancedCapacity = baseCapacity + oneHandLevel;
        owned.push({
            rowId: String(row.id),
            itemId: row.item_id,
            name: def.name,
            capacity: enhancedCapacity,
            locked: Boolean(state.locked),
            items: state.items,
            isActive,
        });
    }

    return owned;
}

function getBucketTotals(ownedBuckets = []) {
    return ownedBuckets.reduce((acc, bucket) => {
        acc.filled += bucket.items.length;
        acc.capacity += bucket.capacity;
        return acc;
    }, { filled: 0, capacity: 0 });
}

/**
 * Summary shown on the FISHING MAIN MENU: aggregate fish / capacity across ALL
 * real buckets the player owns (not just the active one). Falls back to the
 * legacy single-bucket profile data when no real buckets are found.
 */
function getBucketSummary(profile = {}, inventory = []) {
    const owned = getOwnedBuckets(profile, inventory);
    if (owned.length > 0) {
        const totals = getBucketTotals(owned);
        return { filled: totals.filled, capacity: totals.capacity, owned: owned.length };
    }
    const bucket = (profile && profile.bucket) || {};
    return {
        filled: Array.isArray(bucket.currentItems) ? bucket.currentItems.length : 0,
        capacity: Number(bucket.maxSpace) || 0,
        owned: 1,
    };
}

/** Prev/next navigation between the player's buckets. Disabled when 1 bucket. */
function getBucketNavigation(profile = {}, inventory = [], bucketKey) {
    const owned = getOwnedBuckets(profile, inventory);
    const idx = owned.findIndex(bucket => String(bucket.rowId) === String(bucketKey));
    const index = idx >= 0 ? idx : 0;
    return {
        index,
        total: owned.length,
        prevKey: owned.length > 1 ? owned[(index - 1 + owned.length) % owned.length].rowId : null,
        nextKey: owned.length > 1 ? owned[(index + 1) % owned.length].rowId : null,
    };
}

/** Get (or lazily create) the mutable state object for one bucket copy. */
function getContainerState(profile, bucketKey) {
    profile.bucket = (profile.bucket && typeof profile.bucket === 'object') ? profile.bucket : {};
    if (!profile.bucket.containers || typeof profile.bucket.containers !== 'object') {
        profile.bucket.containers = {};
    }
    const key = String(bucketKey);
    if (!profile.bucket.containers[key]) {
        profile.bucket.containers[key] = { locked: false, items: [] };
    }
    return profile.bucket.containers[key];
}

function toggleBucketLock(profile, bucketKey) {
    const state = getContainerState(profile, bucketKey);
    state.locked = !state.locked;
    return state.locked;
}

function placeCaughtFish(profile, inventory, fish) {
    const owned = getOwnedBuckets(profile, inventory);
    let target = owned.find(bucket => bucket.isActive) || owned[0] || null;
    if (!target) return { placed: false, reason: 'no-bucket' };

    if (target.locked || target.items.length >= target.capacity) {
        const alternative = owned.find(bucket => !bucket.locked && bucket.items.length < bucket.capacity);
        if (alternative) {
            target = alternative;
        }
    }

    if (target.locked) return { placed: false, reason: 'locked', bucketName: target.name };
    if (target.items.length >= target.capacity) return { placed: false, reason: 'full', bucketName: target.name };

    const state = getContainerState(profile, target.rowId);
    state.items.push({ id: fish.id, name: fish.name });
    return { placed: true, bucketName: target.name, capacity: target.capacity };
}

async function sellFishFromBucket(userId, profile, inventory, bucketKey, fishIndex) {
    const owned = getOwnedBuckets(profile, inventory);
    const sellersManLevel = fishSkills.getSkillLevel(profile, 'sellers_man');

    const bucket = owned.find(entry => String(entry.rowId) === String(bucketKey));
    if (!bucket) return { ok: false, message: 'Bucket not found.' };
    if (bucket.locked) return { ok: false, message: '🔒 This bucket is locked — unlock it first.' };

    const entry = bucket.items[Math.floor(fishIndex)];
    if (!entry) return { ok: false, message: 'That slot is empty.' };

    const def = allItemsCache.get(entry.id);
    if (!def) return { ok: false, message: `**${entry.name || entry.id}** cannot be sold.` };

    const result = await sellItemsCore(userId, [{ itemData: def, quantity: 1 }]);
    if (result.soldItems.length === 0) {
        return { ok: false, message: `**${def.name || entry.id}** cannot be sold.` };
    }

    // sellers_man skill: * (1 + 0.03 + level * 0.0025) to earned value
    const sellersManMultiplier = 1 + 0.03 + (sellersManLevel - 1) * 0.0025;

    const state = getContainerState(profile, bucketKey);
    state.items.splice(Math.floor(fishIndex), 1);

    const sold = result.soldItems[0];
    return {
        ok: true,
        name: sold.name,
        earned: Math.round(sold.earned * sellersManMultiplier),
        remaining: state.items.length,
    };
}

async function sellAllFish(userId, profile, inventory, bucketKeyOrAll) {
    const owned = getOwnedBuckets(profile, inventory);
    const sellersManLevel = fishSkills.getSkillLevel(profile, 'sellers_man');

    let scope = [];
    if (bucketKeyOrAll === 'all') {
        scope = owned.filter(bucket => !bucket.locked);
    } else {
        const target = owned.find(bucket => String(bucket.rowId) === String(bucketKeyOrAll));
        if (!target) return { ok: false, message: 'Bucket not found.' };
        if (target.locked) return { ok: false, message: '🔒 This bucket is locked — unlock it first.' };
        scope = [target];
    }

    const itemsToSellMap = new Map();

    for (const bucket of scope) {
        const state = getContainerState(profile, bucket.rowId);
        const remaining = [];
        for (const entry of bucket.items) {
            const def = allItemsCache.get(entry.id);
            if (def && def.is_sellable && (def.sell ?? 0) > 0) {
                const existing = itemsToSellMap.get(entry.id) || { itemData: def, quantity: 0 };
                existing.quantity += 1;
                itemsToSellMap.set(entry.id, existing);
            } else {
                remaining.push(entry);
            }
        }
        state.items = remaining;
    }

    const itemsToSell = Array.from(itemsToSellMap.values());
    if (itemsToSell.length === 0) {
        return { ok: true, sold: [], soldCount: 0, totalEarned: 0 };
    }

    const result = await sellItemsCore(userId, itemsToSell);
    if (!result || !result.sold) {
        return { ok: true, sold: [], soldCount: 0, totalEarned: 0 };
    }

    // sellers_man skill: * (1 + 0.03 + level * 0.0025) to earned value
    const sellersManMultiplier = 1 + 0.03 + (sellersManLevel - 1) * 0.0025;
    result.totalEarned = Math.round((result.totalEarned || 0) * sellersManMultiplier);
    // Round individual earnings
    result.sold = result.sold.map(item => ({
        ...item,
        earned: Math.round((item.earned || 0) * sellersManMultiplier)
    }));

    const sold = (result.soldItems || []).map(item => ({
        itemId: item.itemId,
        name: item.name,
        count: item.quantity,
        earned: item.earned
    }));

    const soldCount = sold.reduce((sum, item) => sum + item.count, 0);

    return {
        ok: true,
        sold,
        soldCount,
        totalEarned: result.totalEarned
    };
}

module.exports = {
    FREE_SLOT_COUNT,
    isBucketItemDefinition,
    getOwnedBuckets,
    getBucketTotals,
    getBucketSummary,
    getBucketNavigation,
    getContainerState,
    toggleBucketLock,
    placeCaughtFish,
    sellFishFromBucket,
    sellAllFish,
};