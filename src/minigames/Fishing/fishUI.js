const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const fishShop = require('./fishShop');
const mapManager = require('./MapManager');

function resolveItemName(itemId, fallback) {
    const item = allItemsCache.get(itemId);
    return item ? item.name : fallback || itemId || 'Unknown';
}

function getFishingRodOptions(currentRod, inventory = []) {
    const rodIds = ['hand', 'defaultRod', 'sharkRod', 'bucketRod', 'kaboom', 'niceGlove'];

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
                ? 'Always available (your hand)'
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

function getBaitOptions(currentBait, inventory = []) {
    const baitIds = ['worm', 'jig', 'crank', 'finger'];
    return baitIds.map(id => {
        const item = allItemsCache.get(id);
        const owned = id === 'finger' ? '∞' : inventory.filter(i => i.item_id === id).length;
        const description = id === 'finger'
            ? 'Always available (your finger)'
            : `Your owned: ${owned}`;

        return {
            label: item ? item.name : id,
            value: id,
            description: description,
            default: id === currentBait,
        };
    });
}

function buildMain(profile = {}, noticeMessage = null) {
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

    const locationLine = profile.currentMap
        ? `📍 ${mapManager.getMap(profile.currentMap)?.name || profile.currentMap}`
        : `⚠️ No Location selected — **Pick one first!**`;

    const text2 = new TextDisplayBuilder()
        .setContent(`**Current Equipment**\n${durabilityLine}\n\n**Bucket capacity:**\n${bucketLine}\n\n**Current Location:**\n${locationLine}`);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_buckets')
            .setLabel('View buckets')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_skill')
            .setLabel('Upgrade skills')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_shop')
            .setLabel('Visit shop')
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
            .setStyle(profile.currentMap ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!profile.currentMap)
    );

    const container = new ContainerBuilder()
        .addTextDisplayComponents(text1)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(text2);

    if (noticeMessage) {
        const noticeText = new TextDisplayBuilder().setContent(`> ${noticeMessage}`);
        container
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(noticeText);
    }

    return container
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



function buildBucket() {
    const text = new TextDisplayBuilder()
        .setContent('# 🎒 Buckets\nStill in construction, stay still');
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

function buildSkill() {
    const text = new TextDisplayBuilder()
        .setContent('# 🧠 Skill\nStill in construction, stay still');
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

function buildShop(shopState) {
    return fishShop.buildFishShopContainer(shopState);
}

function buildLocation(profile = {}, selectedMapId = null) {
    const historicalCatches = profile.historicalCatches || {};
    const currentMapId = profile.currentMap || 'nomanssea';
    const targetMapId = selectedMapId || currentMapId;

    const map = mapManager.getMap(targetMapId) || mapManager.getAllMaps()[0];
    const isUnlocked = mapManager.isMapUnlocked(map.id, historicalCatches);

    const titleText = new TextDisplayBuilder().setContent('# 📍 Choosing Location');

    const gallery = new MediaGalleryBuilder()
        .addItems(
            new MediaGalleryItemBuilder()
                .setURL(`attachment://${map.image}`)
                .setDescription(map.name)
        );

    let descriptionText = `**${map.name}** (Tier ${map.tier})\n> ${map.description}\n\n`;

    if (isUnlocked) {
        descriptionText += `**Rarity Rates:**\n`;
        const commonRate = map.rates.COMMON || 0;
        const uncommonRate = map.rates.UNCOMMON || 0;
        const rareRate = map.rates.RARE || 0;
        const epicRate = map.rates.EPIC || 0;
        const legendaryRate = map.rates.LEGENDARY || 0;
        const mythicRate = map.rates.MYTHIC || 0;

        descriptionText += `\`Common: ${commonRate}%\` | \`Uncommon: ${uncommonRate}%\`\n`;
        if (rareRate > 0 || epicRate > 0 || legendaryRate > 0 || mythicRate > 0) {
            descriptionText += `**Rare+:** \`Rare: ${rareRate}%\` `;
            if (epicRate > 0) descriptionText += `| \`Epic: ${epicRate}%\` `;
            if (legendaryRate > 0) descriptionText += `| \`Legendary: ${legendaryRate}%\` `;
            if (mythicRate > 0) descriptionText += `| \`Mythic: ${mythicRate}%\``;
            descriptionText += '\n';
        }
    } else {
        descriptionText += `🔒 **LOCKED**\n**Requirements to unlock:** ${mapManager.getMapUnlockRequirements(map)}\n`;
    }

    const detailsText = new TextDisplayBuilder().setContent(descriptionText);

    const allMaps = mapManager.getAllMaps();
    const mapOptions = allMaps.map(m => {
        const unlocked = mapManager.isMapUnlocked(m.id, historicalCatches);
        return {
            label: `${m.name} ${unlocked ? '' : '(Locked)'}`,
            value: m.id,
            description: `Tier ${m.tier}`,
            default: m.id === targetMapId
        };
    }).slice(0, 25);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('fish_location_select')
        .setPlaceholder('Select a location to travel')
        .addOptions(mapOptions);

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    const travelButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`fish_location_travel_${map.id}`)
            .setLabel(map.id === currentMapId ? 'Already here' : 'Travel')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!isUnlocked || map.id === currentMapId)
    );

    const navButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_now')
            .setLabel('Fishing now')
            .setStyle(ButtonStyle.Primary)
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(titleText)
        .addMediaGalleryComponents(gallery)
        .addActionRowComponents(selectRow)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(detailsText)
        .addActionRowComponents(travelButtonRow)
        .addActionRowComponents(navButtonRow);
}

function buildFishingNow() {
    const text = new TextDisplayBuilder()
        .setContent('# 🎣 Fishing now\nStill in construction, stay still');
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

function buildEquipment(profile = {}, inventory = [], infoMessage = null) {
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
        .setContent('# 🪝 Equipment\n> Select your favorite fishing rod and some bait you had brought in shopping');

    let rodInfo = '';
    if (isBareHand) {
        rodInfo = '• Free fishing rod\n• Never worry about durability\n• Only use finger bait (ofc lol)';
    } else {
        rodInfo = `**Durability:**\n${durabilityLine}\n\n**Stats:**\n• No stats currently`; // Currently these item dont have any stats lol
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
        .setOptions(getBaitOptions(currentBait, inventory))
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

    const builder = new ContainerBuilder()
        .addTextDisplayComponents(text1)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(row1);

    if (infoMessage) {
        const infoText = new TextDisplayBuilder().setContent(`> ${infoMessage}`);
        builder.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(infoText);
    }

    builder
        .addTextDisplayComponents(text2)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(row2)
        .addActionRowComponents(row3);

    return builder;
}

module.exports = {
    buildMain,
    buildBucket,
    buildSkill,
    buildShop,
    buildLocation,
    buildFishingNow,
    buildEquipment,
};
