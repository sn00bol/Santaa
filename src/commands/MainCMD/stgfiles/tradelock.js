const isEnabled = settings => Boolean(settings.trade_lock);

module.exports = {
	id: 'trade_lock',
	order: 40,
	label: 'Trade Lock',
	description: 'Prevents anyone from sending you trade requests.',
	isEnabled,
	toggle: settings => !isEnabled(settings),
	blocksIncomingTrade: settings => isEnabled(settings),
};
