const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');

function resolveItemName(itemId, fallback) {
    const item = allItemsCache.get(itemId);
    return item ? item.name : fallback || itemId || 'Unknown';
}

function getFishingRodOptions(currentRod, inventory = []) {
    const rodIds = ['hand', 'defaultRod', 'sharkRod', 'bucketRod', 'kaboomRod', 'niceGlove'];

    return rodIds
        .map(id => {
            const item = allItemsCache.get(id);
            if (!item) return null;

            const isHand = id === 'hand';

            // Count how many this user owns in inventory
            const owned = isHand ? '∞' : inventory.filter(i => i.item_id === id).length;

            // Max durability from item definition
            const maxDurability = isHand ? '∞' : (item.durability ?? '?');

            const description = isHand
                ? undefined
                : `Your owned: ${owned} | Durability: ${maxDurability}`;

            return {
                label: item.name,
                value: id,
                ...(description ? { description: description.slice(0, 100) } : {}),
                default: id === currentRod,
            };
        })
        .filter(Boolean);
}

function getBaitOptions(currentBait) {
    const baitIds = ['worm', 'jig', 'crank', 'finger'];
    return baitIds.map(id => {
        const item = allItemsCache.get(id);
        return {
            label: item ? item.name : id,
            value: id,
            description: item?.desc?.slice(0, 50) || 'Fishing bait',
            default: id === currentBait,
        };
    });
}

function buildMainV2(profile = {}) {
    const bucketSize = profile.bucket?.maxSpace || 5;
    const bucketCount = Array.isArray(profile.bucket?.currentItems) ? profile.bucket.currentItems.length : 0;
    const rodName = resolveItemName(profile.equipment?.currentRod, 'Bare Hand');

    const isBareHand = String(profile.equipment?.currentRod || '').toLowerCase() === 'hand' || rodName.toLowerCase().includes('hand');
    const durabilityCurrent = isBareHand ? '∞' : String(profile.equipment?.durability ?? 0);
    const durabilityMax = isBareHand ? '∞' : '100';

    const durabilityLine = formatStatLine(durabilityCurrent, durabilityMax, rodName, 10);
    const bucketLine = formatStatLine(String(bucketCount), String(bucketSize), '', 10);

    const text1 = new TextDisplayBuilder()
        .setContent('# 🎣 Fishing\n> How its going? Feel boring old fish once? Now this time is literally different, pick your bucket and rods and catch some big fish!\n> **Daily Streak:** ' + (profile.dailyStreak || 0) + ' days');

    const text2 = new TextDisplayBuilder()
        .setContent(`**Current Equipment**\n${durabilityLine}\n\n**Bucket capacity:**\n${bucketLine}\n\n**Current Location**\n${profile.currentMap || 'Unknown'}`);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_buckets')
            .setLabel('Buckets')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_skill')
            .setLabel('Skills')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_shop')
            .setLabel('Shop')
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment')
            .setLabel('Equipment')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('fish_location')
            .setLabel('Location')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('fish_now')
            .setLabel('Fishing now')
            .setStyle(ButtonStyle.Success)
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(text1)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(text2)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(row1)
        .addActionRowComponents(row2);
}

function buildBar(current, max, length = 10) {
    if (current === '∞' || max === '∞') {
        return '█'.repeat(length);
    }
    const parsedCurrent = Number(current);
    const parsedMax = Number(max);
    if (!Number.isFinite(parsedCurrent) || !Number.isFinite(parsedMax) || parsedMax <= 0) {
        return '█'.repeat(length);
    }
    const safeCurrent = Math.max(0, Math.min(parsedMax, parsedCurrent));
    const filled = Math.min(length, Math.max(0, Math.round((safeCurrent / parsedMax) * length)));
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function formatStatLine(current, max, label, length = 10) {
    const currentText = String(current);
    const maxText = String(max);
    const width = Math.max(currentText.length, maxText.length);
    const currentPadded = currentText.padStart(width, ' ');
    const maxPadded = maxText.padStart(width, ' ');
    const bar = buildBar(currentText, maxText, length);
    const labelSuffix = label ? ` ${label}` : '';
    return `\`${currentPadded} / ${maxPadded}\` ${bar}${labelSuffix}`;
}



function buildBucketV2() {
    const text = new TextDisplayBuilder()
        .setContent('# 🎒 Buckets\nBucket UI will be implemented here.');
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary)
    );
    return new ContainerBuilder()
        .addTextDisplayComponents(text)
        .addActionRowComponents(buttons);
}

function buildSkillV2() {
    const text = new TextDisplayBuilder()
        .setContent('# 🧠 Skill\nSkill UI will be implemented here.');
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary)
    );
    return new ContainerBuilder()
        .addTextDisplayComponents(text)
        .addActionRowComponents(buttons);
}

function buildShopV2() {
    const text = new TextDisplayBuilder()
        .setContent('# 🛒 Shop\nShop UI will be implemented here. This is where fishing rods and bait can be purchased.');
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary)
    );
    return new ContainerBuilder()
        .addTextDisplayComponents(text)
        .addActionRowComponents(buttons);
}

function buildLocationV2() {
    const text = new TextDisplayBuilder()
        .setContent('# 📍 Location\nLocation UI will be implemented here.');
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary)
    );
    return new ContainerBuilder()
        .addTextDisplayComponents(text)
        .addActionRowComponents(buttons);
}

function buildFishingNowV2() {
    const text = new TextDisplayBuilder()
        .setContent('# 🎣 Fishing now\nFishing minigame will start from here.');
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary)
    );
    return new ContainerBuilder()
        .addTextDisplayComponents(text)
        .addActionRowComponents(buttons);
}

function buildEquipmentV2(profile = {}, inventory = []) {
    const bucketSize = profile.bucket?.maxSpace || 5;
    const bucketCount = Array.isArray(profile.bucket?.currentItems) ? profile.bucket.currentItems.length : 0;

    const rodId = profile.equipment?.currentRod || 'hand';
    const rodName = resolveItemName(rodId, 'Bare Hand');

    const baitId = profile.equipment?.currentBait || 'none';
    const baitName = resolveItemName(baitId, 'None');

    const isBareHand = rodId.toLowerCase() === 'hand' || rodName.toLowerCase().includes('hand');
    const durabilityCurrent = isBareHand ? '∞' : String(profile.equipment?.durability ?? 0);
    const durabilityMax = isBareHand ? '∞' : '100';

    const durabilityLine = formatStatLine(durabilityCurrent, durabilityMax, '', 10);

    const text1 = new TextDisplayBuilder()
        .setContent('# 🪝 Equipment\n> Pick yourself a tool and some bait to bring with you.\n> If you have none, that\'s alright! Your bare hand will suffice.\n> You can always check out the /shop view to buy more equipment.');

    let rodInfo = '';
    if (isBareHand) {
        rodInfo = '• Free fishing rod\n• Never worry about durability\n• Only use finger bait (ofc lol)';
    } else {
        rodInfo = `🎣 **Fishing Rod: ${rodName}**\n**Durability:**\n${durabilityLine}\n\n**Stats:**\n• No stats currently`;
    }
    const text2 = new TextDisplayBuilder().setContent(rodInfo);



    const currentRod = profile.equipment?.currentRod || 'hand';
    const currentBait = profile.equipment?.currentBait || 'worm';

    const rodSelect = new StringSelectMenuBuilder()
        .setCustomId('fish_equipment_select_rod')
        .setPlaceholder('Choose a fishing rod')
        .setOptions(getFishingRodOptions(currentRod, inventory));

    const baitSelect = new StringSelectMenuBuilder()
        .setCustomId('fish_equipment_select_bait')
        .setPlaceholder('Choose bait')
        .setOptions(getBaitOptions(currentBait))
        .setDisabled(String(currentRod).toLowerCase() === 'hand');

    const row1 = new ActionRowBuilder().addComponents(rodSelect);
    const row2 = new ActionRowBuilder().addComponents(baitSelect);
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_equipment_shop')
            .setLabel('Open shop')
            .setStyle(ButtonStyle.Success)
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(text1)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(row1)
        .addTextDisplayComponents(text2)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(row2)
        .addActionRowComponents(row3);
}

module.exports = {
    buildMainV2,
    buildBucketV2,
    buildSkillV2,
    buildShopV2,
    buildLocationV2,
    buildFishingNowV2,
    buildEquipmentV2,
};
