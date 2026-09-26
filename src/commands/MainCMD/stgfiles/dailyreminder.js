const isEnabled = settings => Boolean(settings.daily_reminder);

module.exports = {
	id: 'daily_reminder',
	order: 21,
	label: 'Daily Reminders',
	description: 'Receive a daily DM reminder to claim your daily reward and work your job shift.',
	isEnabled,
	toggle: settings => !isEnabled(settings),
	shouldRemind: settings => isEnabled(settings),
};
