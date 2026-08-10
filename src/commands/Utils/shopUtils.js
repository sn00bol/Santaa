const fs = require('fs');
const path = require('path');
const { isVisibleItem } = require('./itemVisibility');

const SHOP_ITEMS_ROOT = path.join(__dirname, '..', '..', 'items', 'shopItems');
const LEGACY_SHOP_ITEMS_ROOT = path.join(__dirname, 'shopUtils');
const FISH_SHOP_ITEMS_ROOT = path.join(__dirname, '..', '..', 'items', 'fish', 'fshop');

const resolveShopItemsPath = (shopType) => {
    if (shopType === 'fish') {
        return FISH_SHOP_ITEMS_ROOT;
    }

    const candidates = [
        path.join(SHOP_ITEMS_ROOT, shopType),
        path.join(LEGACY_SHOP_ITEMS_ROOT, shopType),
    ];

    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
};

const loadShopItems = (shopType) => {
    const items = new Map();
    const shopPath = resolveShopItemsPath(shopType);

    if (!fs.existsSync(shopPath)) {
        return items;
    }

    const traverse = (dir) => {
        for (const entry of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, entry);
            const stat = fs.lstatSync(fullPath);
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (entry.endsWith('.js')) {
                try {
                    const item = require(fullPath);
                    if (!item || !item.id) continue;
                    if (!isVisibleItem(item)) continue;
                    items.set(item.id, item);
                } catch (err) {
                    // Skip invalid item definitions
                }
            }
        }
    };

    traverse(shopPath);
    return items;
};

const getShopItemCost = (item) => {
    return Number(item.cost ?? item.sell ?? 0) || 0;
};

const sortShopItems = (itemMap) => {
    return Array.from(itemMap.values()).sort((a, b) => {
        const priceA = getShopItemCost(a);
        const priceB = getShopItemCost(b);
        if (priceA !== priceB) return priceA - priceB;
        return String(a.name).localeCompare(String(b.name));
    });
};

module.exports = {
    resolveShopItemsPath,
    loadShopItems,
    getShopItemCost,
    sortShopItems,
};
