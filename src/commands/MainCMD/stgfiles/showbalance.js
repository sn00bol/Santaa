const isEnabled = settings => Boolean(settings.show_balance);

module.exports = {
    id: 'show_balance',
    order: 30,
    label: 'Hide Balance',
    description: 'Block other users from viewing your wallet and bank balance with the balance command.',
    isEnabled,
    toggle: settings => !isEnabled(settings),
    canViewBalance: settings => !isEnabled(settings),
};