const rpgmanager = require('../../../database/rpgmanager');
const path = require('path');
const fs = require('fs');
const inflationManager = require('./InflationManager');

/**
 * Loads all item definitions from the unified items folders.
 */
const loadItems = () => {
    const allItems = new Map();
    const dirs = ['gepora', 'kimori'];
    const shopItemsRoot = path.join(__dirname, '..', 'shop', '..', '..', 'items', 'shopItems');
    const legacyShopItemsRoot = path.join(__dirname, '..', 'shop', 'shopUtils');

    const resolveDir = (basePath, dirName) => {
        const candidates = [path.join(basePath, dirName), path.join(legacyShopItemsRoot, dirName)];
        return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
    };

    for (const d of dirs) {
        const dirPath = resolveDir(shopItemsRoot, d);
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
            for (const file of files) {
                const item = require(path.join(dirPath, file));
                item.shop = d;
                if (item.cost !== undefined) item.baseCost = item.cost;
                if (item.sell !== undefined) item.baseSell = item.sell;
                allItems.set(item.id, item);
            }
        }
    }
    const targets = [
        path.join(__dirname, '..', '..', 'items', 'mine'),
        path.join(__dirname, '..', '..', 'minigames', 'Mining', 'minerals'),
        path.join(__dirname, '..', '..', 'items', 'fish'),
        path.join(__dirname, '..', '..', 'minigames', 'Fishing', 'fish')
    ];

    // Recursively loads all .js item files from a directory tree
    const loadFromDir = (dirPath, shopName) => {
        if (!fs.existsSync(dirPath)) return;
        for (const entry of fs.readdirSync(dirPath)) {
            const fullPath = path.join(dirPath, entry);
            if (fs.lstatSync(fullPath).isDirectory()) {
                loadFromDir(fullPath, shopName);
            } else if (entry.endsWith('.js')) {
                try {
                    const item = require(fullPath);
                    if (item && item.id) {
                        item.shop = shopName;
                        if (item.cost !== undefined) item.baseCost = item.cost;
                        if (item.sell !== undefined) item.baseSell = item.sell;
                        allItems.set(item.id, item);
                    }
                } catch (e) { /* skip invalid items */ }
            }
        }
    };

    // targetPath: array of [path, shopName]
    const targetsWithShop = [
        [path.join(__dirname, '..', '..', 'items', 'mine'), 'mining'],
        [path.join(__dirname, '..', '..', 'minigames', 'Mining', 'minerals'), 'mining'],
        [path.join(__dirname, '..', '..', 'items', 'fish'), 'fishing'],
        [path.join(__dirname, '..', '..', 'minigames', 'Fishing', 'fish'), 'fishing']
    ];

    for (const [targetPath, shopName] of targetsWithShop) {
        loadFromDir(targetPath, shopName);
    }

    return allItems;
};

// Cache items to avoid repeated disk reads
const allItemsCache = loadItems();
inflationManager.applyAll(allItemsCache);

/**
 * Calculates the final stats for a user by combining base stats from DB 
 * with bonuses from their equipped item.
 */
async function getTotalStats(userId) {
    const baseStats = await rpgmanager.getStats(userId);

    let maxHealth = 100;
    let maxStamina = 100;
    let totalAttack = baseStats.attack;
    let totalDefense = baseStats.defense || 0;
    let equippedItemName = "None";

    // Support multiple equipped items (stored as JSON array in equipped_items)
    let equippedItemsArr = [];
    if (baseStats.equipped_items) {
        try { equippedItemsArr = JSON.parse(baseStats.equipped_items); } catch (e) { equippedItemsArr = []; }
    }
    // Backwards-compat: include single equipped_item_id if present
    if (baseStats.equipped_item_id) equippedItemsArr.push(baseStats.equipped_item_id);

    const equippedNames = [];
    for (const eqId of equippedItemsArr) {
        const eqItem = allItemsCache.get(eqId);
        if (!eqItem) continue;
        equippedNames.push(eqItem.name);
        if (eqItem.stats) {
            if (eqItem.stats.health) maxHealth += eqItem.stats.health;
            if (eqItem.stats.stamina) maxStamina += eqItem.stats.stamina;
            if (eqItem.stats.attack) totalAttack += eqItem.stats.attack;
            if (eqItem.stats.defense) totalDefense += eqItem.stats.defense;
        }
    }
    if (equippedNames.length > 0) equippedItemName = equippedNames.join(', ');

    return {
        ...baseStats,
        maxHealth,
        maxStamina,
        totalAttack,
        totalDefense,
        equippedItemName,
        equippedItemsArr
    };
}

module.exports = { getTotalStats, allItemsCache };
