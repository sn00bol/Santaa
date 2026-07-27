// Imma make a setting command later lol
// wtf is config.js? this is where contain settings function and some stuff

// EMOJI CURRENCY
const CURRENCY_EMOJI = '<a:coin:1526046578996154569>'; // your coin emoji
const CURRENCY_SYMBOL = '🪙'; // fallback for canvas

// Slash and DM
const DM = '<:DM:1531243221374468176>';
const noDM = '<:noDM:1531243237606428702>';
const SLASH = '<:slash:1531243250353049650>';
const noSLASH = '<:noSLASH:1531246838458351818>';

// COOLDOWN CONFIG
const COOLDOWN_MODE = process.env.COOLDOWN_MODE === 'test' ? 'test' : 'prod';

const configs = {
    prod: {
        parttime: 60 * 60 * 1000,
        beg: 10 * 60 * 1000,
        crime: 30 * 60 * 1000,
        steal: 30 * 60 * 1000,
        daily: 24 * 60 * 60 * 1000,
        fishExhaustion: 1.5 * 60 * 60 * 1000,
        mineExhaustion: 2 * 60 * 60 * 1000,
        jobWorkCooldown: 5 * 60 * 1000, // Currently this command use their own cooldown
        jobFirePenalty: 2.5 * 60 * 60 * 1000,
        wantedDecay: 24 * 60 * 60 * 1000,
    },
    test: {
        parttime: 5 * 1000,
        beg: 5 * 1000,
        crime: 5 * 1000,
        steal: 5 * 1000,
        daily: 10 * 1000,
        fishExhaustion: 5 * 1000,
        mineExhaustion: 5 * 1000,
        jobWorkCooldown: 5 * 1000,
        jobFirePenalty: 2 * 1000,
        wantedDecay: 5 * 60 * 1000, // 5 minutes for testing
    }
};

module.exports = {
    CURRENCY_EMOJI,
    CURRENCY_SYMBOL,
    DM,
    noDM,
    SLASH,
    noSLASH,
    mode: COOLDOWN_MODE,
    ...configs[COOLDOWN_MODE],
};
