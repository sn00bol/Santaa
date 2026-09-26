const numberFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 20
});

module.exports = function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return numberFormatter.format(number);
};