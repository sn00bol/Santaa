const fs = require('fs');
const path = require('path');

const SETTINGS = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.js') && file !== 'index.js')
    .map(file => require(path.join(__dirname, file)))
    .filter(setting =>
        setting &&
        typeof setting.id === 'string' &&
        typeof setting.label === 'string' &&
        typeof setting.description === 'string' &&
        typeof setting.isEnabled === 'function' &&
        typeof setting.toggle === 'function'
    )
    .sort((a, b) => a.order - b.order);

module.exports = {
    getSettings: () => SETTINGS,
    getSetting: id => SETTINGS.find(setting => setting.id === id),
};