const isEnabled = settings => Boolean(settings.passive);
const { passiveInactivityMs, passiveSweepIntervalMs, passiveInactivityLabel } = require('../../Utils/config');

module.exports = {
	id: 'passive',
	order: 10,
	label: 'Passive Mode',
	description: `Protecting from being stolen from, but prevents you from stealing or committing crimes (Expired in ${passiveInactivityLabel})`,
	autoDisableAfterMs: passiveInactivityMs,
	sweepIntervalMs: passiveSweepIntervalMs,
	inactivityLabel: passiveInactivityLabel,
	isEnabled,
	toggle: settings => !isEnabled(settings),
	blocksCrime: settings => isEnabled(settings),
	blocksSteal: settings => isEnabled(settings),
	protectsFromSteal: settings => isEnabled(settings),
};
