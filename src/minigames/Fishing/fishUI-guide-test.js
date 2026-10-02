const test = require('node:test');
const assert = require('node:assert/strict');
const fishUI = require('./fishUI');

test('Fishing main menu links to its guide beside Fishing now', () => {
    const payload = fishUI.buildMain({ currentMap: 'nomanssea' }, []).toJSON();
    const buttons = payload.components
        .flatMap(component => component.components || [])
        .filter(component => component.type === 2);
    const fishingNowIndex = buttons.findIndex(button => button.custom_id === 'fish_now');
    const guide = buttons[fishingNowIndex + 1];

    assert.equal(guide.label, '\u200B');
    assert.equal(guide.emoji, undefined);
    assert.equal(guide.style, 5);
    assert.equal(guide.url, 'https://github.com/meh2025/Example-Discord-Bot-using-Javascript/blob/alpha/docs/instruction/Fish.md');
});