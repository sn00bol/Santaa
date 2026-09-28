const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const { isVisibleItem } = require('../../commands/Utils/itemVisibility');
const { sellItemsCore } = require('../../commands/EconomicCMD/sell');
const mineCore = require('./mineCore');
const mineShop = require('./mineShop');

const FREE_SLOT_COUNT = 5;

// Cache for owned backpacks to reduce repeated calculations
let ownedBackpacksCache = null;
let ownedBackpacksCacheKey = null;
let ownedBackpacksCacheTime = 0;
const OWNED_BACKPACKS_CACHE_DURATION = 3000;

const getCacheKey = (profile, inventory) => {
    return `${profile.equipment?.currentBackpack || 'defaultbackpack'}_${inventory.length}`;
};

/**
 * Returns true if the item definition is a valid mining backpack
 * (has a positive capacity AND belongs to the 'mine' type).
 */
function isBackpackItemDefinition(itemDef) {
    return Boolean(itemDef)
        && typeof itemDef.capacity === 'number'
        && itemDef.capacity > 0
        && Array.isArray(itemDef.type)
        && itemDef.type.includes('mine');
}

/**
 * Ensure every backpack in the player's inventory has a container state entry in
 * profile.backpack.containers. Creates empty state for new ones.
 */
function ensureContainers(profile, inventory) {
    profile.backpack = (profile.backpack && typeof profile.backpack === 'object') ? profile.backpack : {};
    if (!profile.backpack.containers || typeof profile.backpack.containers !== 'object') {
        profile.backpack.containers = {};
    }
    const containers = profile.backpack.containers;

    for (const row of inventory) {
        // Only use mineShop items — never fall back to allItemsCache which includes fishing buckets
        const itemDef = mineShop.loadCategoryItems('backpack', true).get(row.item_id);
        if (isBackpackItemDefinition(itemDef) && !containers[String(row.id)]) {
            containers[String(row.id)] = { locked: false, items: [] };
        }
    }

    return containers;
}

/**
 * Get the container state for a specific backpack copy (by DB row id).
 * Lazily creates the state if it doesn't exist yet.
 */
function getContainerState(profile, backpackKey) {
    profile.backpack = (profile.backpack && typeof profile.backpack === 'object') ? profile.backpack : {};
    if (!profile.backpack.containers || typeof profile.backpack.containers !== 'object') {
        profile.backpack.containers = {};
    }
    const key = String(backpackKey);
    if (!profile.backpack.containers[key]) {
        profile.backpack.containers[key] = { locked: false, items: [] };
    }
    return profile.backpack.containers[key];
}

/**
 * Resolve the player's owned backpacks from their inventory.
 * One entry per physical backpack copy. Cached for OWNED_BACKPACKS_CACHE_DURATION ms.
 */
function getOwnedBackpacks(profile = {}, inventory = []) {
    const cacheKey = getCacheKey(profile, inventory);
    const now = Date.now();

    if (ownedBackpacksCache && ownedBackpacksCacheKey === cacheKey && (now - ownedBackpacksCacheTime) < OWNED_BACKPACKS_CACHE_DURATION) {
        return ownedBackpacksCache;
    }

    ensureContainers(profile, inventory);

    const activeItemId = profile.equipment?.currentBackpack || 'defaultbackpack';
    let activeAssigned = false;
    const owned = [];
    const allBackpacks = mineShop.loadCategoryItems('backpack', true);

    for (const row of inventory) {
        // Strictly use mineShop backpack definitions — never fall back to allItemsCache
        const def = allBackpacks.get(row.item_id);
        if (!isBackpackItemDefinition(def)) continue;

        const state = getContainerState(profile, row.id);
        if (!Array.isArray(state.items)) state.items = [];

        const isActive = !activeAssigned && row.item_id === activeItemId;
        if (isActive) activeAssigned = true;

        owned.push({
            rowId: String(row.id),
            itemId: row.item_id,
            name: def.name,
            capacity: Number(def.capacity) || 1,
            locked: Boolean(state.locked),
            items: state.items,
            isActive,
        });
    }

    ownedBackpacksCache = owned;
    ownedBackpacksCacheKey = cacheKey;
    ownedBackpacksCacheTime = now;

    return owned;
}

/**
 * Aggregate filled / capacity across all owned backpacks.
 */
function getBackpackTotals(ownedBackpacks = []) {
    return ownedBackpacks.reduce((acc, bp) => {
        acc.filled += bp.items.length;
        acc.capacity += bp.capacity;
        return acc;
    }, { filled: 0, capacity: 0 });
}

/**
 * Summary shown on the mining main menu: aggregate minerals / capacity across
 * ALL backpacks the player owns. Returns zeros when no backpacks are found.
 */
function getBackpackSummary(profile = {}, inventory = []) {
    const owned = getOwnedBackpacks(profile, inventory);
    const totals = getBackpackTotals(owned);
    return { filled: totals.filled, capacity: totals.capacity, owned: owned.length };
}

/**
 * Prev/next navigation between the player's backpacks. Disabled when only 1.
 */
function getBackpackNavigation(profile = {}, inventory = [], backpackKey) {
    const owned = getOwnedBackpacks(profile, inventory);
    const idx = owned.findIndex(bp => String(bp.rowId) === String(backpackKey));
    const index = idx >= 0 ? idx : 0;
    return {
        index,
        total: owned.length,
        prevKey: owned.length > 1 ? owned[(index - 1 + owned.length) % owned.length].rowId : null,
        nextKey: owned.length > 1 ? owned[(index + 1) % owned.length].rowId : null,
    };
}

/**
 * Toggle the locked state of a specific backpack copy.
 */
function toggleBackpackLock(profile, backpackKey) {
    const state = getContainerState(profile, backpackKey);
    state.locked = !state.locked;
    // Invalidate cache so next read reflects the new lock state
    ownedBackpacksCache = null;
    ownedBackpacksCacheKey = null;
    return state.locked;
}

/**
 * Place a mined mineral into the player's active (or first available) backpack.
 * Falls back to next unlocked/non-full backpack if the active one is full/locked.
 */
function placeMinedMineral(profile, inventory, mineral) {
    const owned = getOwnedBackpacks(profile, inventory);
    let target = owned.find(bp => bp.isActive) || owned[0] || null;
    if (!target) return { placed: false, reason: 'no-backpack' };

    // Try to find an alternative if the active backpack is locked or full
    if (target.locked || target.items.length >= target.capacity) {
        const alternative = owned.find(bp => !bp.locked && bp.items.length < bp.capacity);
        if (alternative) target = alternative;
    }

    if (target.locked) return { placed: false, reason: 'locked', backpackName: target.name };
    if (target.items.length >= target.capacity) return { placed: false, reason: 'full', backpackName: target.name };

    const state = getContainerState(profile, target.rowId);
    state.items.push({ id: mineral.id, name: mineral.name });
    ownedBackpacksCache = null;
    ownedBackpacksCacheKey = null;
    return { placed: true, backpackName: target.name, capacity: target.capacity };
}

/**
 * Sell a single mineral from a specific backpack slot.
 */
async function sellMineralFromBackpack(userId, profile, inventory, backpackKey, mineralIndex) {
    const owned = getOwnedBackpacks(profile, inventory);

    const backpack = owned.find(entry => String(entry.rowId) === String(backpackKey));
    if (!backpack) return { ok: false, message: 'Backpack not found.' };
    if (backpack.locked) return { ok: false, message: '🔒 This backpack is locked — unlock it first.' };

    const entry = backpack.items[Math.floor(mineralIndex)];
    if (!entry) return { ok: false, message: 'That slot is empty.' };

    const def = allItemsCache.get(entry.id) || mineCore.getMineralData(entry.id);
    if (!def) return { ok: false, message: `**${entry.name || entry.id}** cannot be sold.` };

    const result = await sellItemsCore(userId, [{ itemData: def, quantity: 1 }]);
    if (!result.soldItems || result.soldItems.length === 0) {
        return { ok: false, message: `**${def.name || entry.id}** cannot be sold.` };
    }

    const state = getContainerState(profile, backpackKey);
    state.items.splice(Math.floor(mineralIndex), 1);
    ownedBackpacksCache = null;
    ownedBackpacksCacheKey = null;

    const sold = result.soldItems[0];
    return {
        ok: true,
        name: sold.name,
        earned: sold.earned,
        remaining: state.items.length,
    };
}

/**
 * Sell all sellable minerals from one backpack (by key) or from all unlocked backpacks ('all').
 */
async function sellAllMinerals(userId, profile, inventory, backpackKeyOrAll) {
    const owned = getOwnedBackpacks(profile, inventory);

    let scope = [];
    if (backpackKeyOrAll === 'all') {
        scope = owned.filter(bp => !bp.locked);
    } else {
        const target = owned.find(bp => String(bp.rowId) === String(backpackKeyOrAll));
        if (!target) return { ok: false, message: 'Backpack not found.' };
        if (target.locked) return { ok: false, message: '🔒 This backpack is locked — unlock it first.' };
        scope = [target];
    }

    const itemsToSellMap = new Map();

    for (const bp of scope) {
        const state = getContainerState(profile, bp.rowId);
        const remaining = [];
        for (const entry of bp.items) {
            const def = allItemsCache.get(entry.id) || mineCore.getMineralData(entry.id);
            if (def && def.is_sellable && (def.cost ?? 0) > 0) {
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
    if (!result || !result.soldItems) {
        return { ok: true, sold: [], soldCount: 0, totalEarned: 0 };
    }

    const sold = result.soldItems.map(item => ({
        itemId: item.itemId,
        name: item.name,
        count: item.quantity,
        earned: item.earned,
    }));

    const soldCount = sold.reduce((sum, item) => sum + item.count, 0);

    ownedBackpacksCache = null;
    ownedBackpacksCacheKey = null;

    return {
        ok: true,
        sold,
        soldCount,
        totalEarned: result.totalEarned,
    };
}

module.exports = {
    FREE_SLOT_COUNT,
    isBackpackItemDefinition,
    getOwnedBackpacks,
    getBackpackTotals,
    getBackpackSummary,
    getBackpackNavigation,
    getContainerState,
    toggleBackpackLock,
    placeMinedMineral,
    sellMineralFromBackpack,
    sellAllMinerals,
};
