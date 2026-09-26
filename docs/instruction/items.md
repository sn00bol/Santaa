# Items System (`src/items`)

This folder contains only data, not command execution logic

### Folder Structure:
- `[mine/fish]/[Rarity]/item.js`: Divided by rarity (Common $\rightarrow$ Mythic) for the two minigames
- `shopItems/[ShopName]/item.js`: Divided by shop name

### Item File Format:
```js
module.exports = {
    id: 'stone',
    name: 'Stone',
    sell: 10,
    desc: 'You could find this somewhere at your garden',
    type: ['consumable'], // Currently only two type: equippable and consumable
    is_sellable: true,
    is_tradeable: true
    // show: false
};
// By default, you can define is_sellable: true and is_tradeable: true to indicate if the item can be sold or traded.
// If not specified, they might have default fallback behaviors depending on the command.
// Show: hide or show items in shop. If omitted, items appear in shop by default.
```
Another specific type:
```js
module.exports = {
    ...
    // Fishing
    durability: 50, // For fishing rod, when if zero its will break and fallback to hand.js items
    capacity: 5, // For buckets
    stats: "• get random 3-5 fish in one time but very worse (mostly get common 80-90%)\n• Durability hard to break\n• Cannot use any bait", // Needed to view stats on fishing equipment

    // Other
    effects: { health: 10, stamina: 20 }, // Consumable type, for reviving health and stamina
    stats: { health: 1000, stamina: 1000, attack: 500, defense: 500 }, // Equippable type, for PVP stuff
}
```