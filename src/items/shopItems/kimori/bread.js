module.exports = {
    id: 'bread',
    name: 'Bread',
    cost: 45,
    sell: 15,
    desc: 'Bread... no baguette (Restores 15 HP and 10 Stamina)',
    type: ['consumable'],
    effects: { health: 15, stamina: 0 },
    is_sellable: true,
    is_tradeable: true
};
