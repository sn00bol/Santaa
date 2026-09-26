const isEnabled = settings => Boolean(settings.lvl_notifi);

module.exports = {
	id: 'lvl_notifi',
	order: 25,
	label: 'Level-up Notifications',
	description: 'Receive a DM whenever you gain a level.',
	isEnabled,
	toggle: settings => !isEnabled(settings),
	shouldNotify: settings => isEnabled(settings),
};
