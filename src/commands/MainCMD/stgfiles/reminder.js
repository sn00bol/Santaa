const isEnabled = settings => Boolean(settings.reminder);

module.exports = {
	id: 'reminder',
	order: 20,
	label: 'Reminders',
	description: 'Receive DMs for incoming trade requests.',
	isEnabled,
	toggle: settings => !isEnabled(settings),
	shouldRemind: settings => isEnabled(settings),
};
