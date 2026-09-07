const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', '..', 'database', 'inflation.json');

const DEFAULT_CONFIG = {
    global: 1.0,
    shops: {},
    items: {}
};

class InflationManager {
    constructor() {
        this.config = this.getDefaultConfig();
        this.load();
    }
    
    getDefaultConfig() {
        return {
            global: 1.0,
            shops: {},
            items: {}
        };
    }
    
    load() {
        try {
            if (!fs.existsSync(configPath)) {
                console.log('[InflationManager] inflation.json not found. Automatically creating default inflation.json...');
                this.config = this.getDefaultConfig();
                this.save();
                return;
            }

            const content = fs.readFileSync(configPath, 'utf8').trim();
            if (!content) {
                console.warn('[InflationManager] inflation.json is empty. Automatically creating default inflation.json...');
                this.config = this.getDefaultConfig();
                this.save();
                return;
            }

            const parsed = JSON.parse(content);
            this.config = {
                global: typeof parsed?.global === 'number' ? parsed.global : 1.0,
                shops: (parsed?.shops && typeof parsed.shops === 'object') ? parsed.shops : {},
                items: (parsed?.items && typeof parsed.items === 'object') ? parsed.items : {}
            };
        } catch (e) {
            console.warn('[InflationManager] Failed to load or parse inflation config. Automatically recreating default inflation.json... Error:', e.message);
            this.config = this.getDefaultConfig();
            this.save();
        }
    }
    
    save() {
        try {
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 4), 'utf8');
        } catch (e) {
            console.error('[InflationManager] Failed to save inflation config:', e);
        }
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
