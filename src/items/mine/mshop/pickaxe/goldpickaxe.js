module.exports = {
    id: 'goldpickaxe',
    name: 'Gold Pickaxe',
    cost: 500,
    desc: 'Feeling lucky? This pickaxe is made of gold, so it will break easily but it will give you a lot of luck when mining',
    type: ['mine'], // not using
    // Specific type for mining
    durability: 100,
    luck: 1.4,
    canMineLegendaryPlus: true,
    stats: "• Increase your luck when mining\n• 1.4x luck\n• Can access Legendary+ ore veins (the ore is one rarity lower)",

    is_sellable: true,
    is_tradeable: true
};