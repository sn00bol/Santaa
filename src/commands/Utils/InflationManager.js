const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', '..', 'database', 'inflation.json');

class InflationManager {
    constructor() {
        this.config = {
            global: 1.0,
            shops: {},
            items: {}
        };
        this.load();
    }
    
    load() {
        if (fs.existsSync(configPath)) {
            try {
                this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch (e) {
                console.error('Failed to load inflation config', e);
            }
        } else {
            this.save();
        }
    }
    
    save() {
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 4));
    }
    
    getMultiplier(itemDef) {
        if (!itemDef) return 1.0;
        
        // Item specific override
        if (this.config.items && this.config.items[itemDef.id]) {
            return this.config.items[itemDef.id];
        }
        
        // Shop specific override
        if (itemDef.shop && this.config.shops && this.config.shops[itemDef.shop]) {
            return this.config.shops[itemDef.shop];
        }
        
        // Global
        return this.config.global || 1.0;
    }

    applyAll(allItemsCache) {
        for (const [id, item] of allItemsCache) {
            const multiplier = this.getMultiplier(item);
            
            // Only modify if it has a cost or sell value
            if (item.baseCost !== undefined) {
                item.cost = Math.max(1, Math.round(item.baseCost * multiplier));
            }
            if (item.baseSell !== undefined) {
                item.sell = Math.max(1, Math.round(item.baseSell * multiplier));
            }
        }
    }
}

module.exports = new InflationManager();
