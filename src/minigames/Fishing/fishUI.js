const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder } = require('discord.js');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');
const { getPaginationRow } = require('../../commands/Utils/NavigateManager');
const { FISH_RARITY_EMOJI, RARITY_CONFIG: FISH_RARITY_CONFIG } = require('./fishCore');
const fishShop = require('./fishShop');
const fishBucket = require('./fishBucket');
const mapManager = require('./MapManager');
const fishSkills = require('./fishSkills');

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

function buildMain(profile = {}, inventory = null, noticeMessage = null) {
    // Defensive: older callers may pass a notice string in the 2nd slot.
    if (typeof inventory === 'string' && noticeMessage === null) {
        noticeMessage = inventory;
        inventory = null;
    }

    const bucketSummary = resolveBucketSummary(profile, inventory);
    const bucketSize = bucketSummary.capacity || 1;
    const bucketCount = bucketSummary.filled;
    const bucketLabel = bucketSummary.owned > 1 ? `(${bucketSummary.owned} buckets)` : '';
    const rodName = resolveItemName(profile.equipment?.currentRod, 'Bare Hand');

    const isBareHand = String(profile.equipment?.currentRod || '').toLowerCase() === 'hand' || rodName.toLowerCase().includes('hand');
    const durabilityCurrent = isBareHand ? '∞' : String(profile.equipment?.durability ?? 0);
    const durabilityMax = isBareHand ? '∞' : '100';

    const durabilityLine = formatStatLine(durabilityCurrent, durabilityMax, rodName, 10);
    const bucketLine = formatStatLine(String(bucketCount), String(bucketSize), bucketLabel, 10);

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



function bucketSellValue(items = []) {
    return items.reduce((sum, entry) => sum + ((allItemsCache.get(entry.id)?.sell) || 0), 0);
}

// Bucket stats shown across the fishing menus: aggregate across ALL real owned
// buckets when an inventory snapshot is available, otherwise the legacy
// single-bucket values from the profile.
function resolveBucketSummary(profile, inventory) {
    if (Array.isArray(inventory) && inventory.length > 0) {
        return fishBucket.getBucketSummary(profile, inventory);
    }
    const bucket = (profile && profile.bucket) || {};
    return {
        filled: Array.isArray(bucket.currentItems) ? bucket.currentItems.length : 0,
        capacity: Number(bucket.maxSpace) || 1,
        owned: 1,
    };
}

function buildBucketCompactLine(bucket) {
    const value = bucketSellValue(bucket.items);
    const badges = [];
    if (bucket.locked) badges.push('🔒');
    if (bucket.isActive) badges.push('**(Active)**');
    return `**${bucket.name}**${badges.length ? ' ' + badges.join(' ') : ''}\n• ${bucket.items.length} / ${bucket.capacity} Fish (${value.toLocaleString()} ${CURRENCY_EMOJI})`;
}

function safeSlice(text, maxLen) {
    let sliced = String(text).slice(0, maxLen);
    // Avoid cutting a surrogate pair in half (emoji at the boundary).
    while (sliced.length > 0 && sliced.charCodeAt(sliced.length - 1) >= 0xD800 && sliced.charCodeAt(sliced.length - 1) <= 0xDBFF) {
        sliced = sliced.slice(0, -1);
    }
    return sliced;
}

function buildBucketDetailText(bucket) {
    if (!bucket) return '*No bucket selected.*';
    const value = bucketSellValue(bucket.items);
    const head = `• ${bucket.items.length} / ${bucket.capacity} Fish (${value.toLocaleString()} ${CURRENCY_EMOJI})`;
    if (bucket.items.length === 0) return `${head}\n\n*No fish in this bucket yet.*`;
    const fishLines = bucket.items.map((entry, index) => {
        const def = allItemsCache.get(entry.id);
        const name = (def && def.name) || entry.name || entry.id;
        const sellValue = (def && def.sell) || 0;
        return `**${index + 1}.** ${name} — ${Number(sellValue).toLocaleString()} ${CURRENCY_EMOJI}`;
    });
    return `${head}\n\n${fishLines.slice(0, 25).join('\n')}${fishLines.length > 25 ? `\n…and ${fishLines.length - 25} more.` : ''}`;
}

function buildBucket(profile = {}, inventory = [], state = null) {
    const view = state && state.view === 'detail' ? 'detail' : 'overview';
    const owned = fishBucket.getOwnedBuckets(profile, inventory);

    let headerContent;
    if (view === 'overview') {
        const totals = fishBucket.getBucketTotals(owned);
        const capLine = formatStatLine(String(totals.filled), String(totals.capacity) || '1', '', 12);
        headerContent = `# 🎒 Viewing current buckets\n\n**Own buckets:** ${owned.length}\n**Buckets capacity:**\n${capLine}`;
    } else {
        const bucket = owned.find(b => String(b.rowId) === String(state && state.bucketKey)) || owned[0] || null;
        if (bucket) {
            const badges = [];
            if (bucket.locked) badges.push('🔒');
            if (bucket.isActive) badges.push('**(Active)**');
            const capLine = formatStatLine(String(bucket.items.length), String(bucket.capacity), '', 12);
            headerContent = `## ${bucket.name}${badges.length ? ' ' + badges.join(' ') : ''}\n**Own buckets:** ${owned.length}\n**Buckets capacity:**\n${capLine}`;
        } else {
            headerContent = `# 🎒 Buckets\n> Viewing current buckets\n\n**Own buckets:** 0\n**Buckets capacity:**\n${formatStatLine('0', '1', '', 12)}`;
        }
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent));

    if (owned.length === 0) {
        container.addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('*You do not own any buckets yet! Visit the fishing shop to buy one.*'));
    } else if (view === 'overview') {
        const freeCount = fishBucket.FREE_SLOT_COUNT;
        const maxPages = Math.max(1, Math.ceil(owned.length / freeCount));
        const page = Math.min(Math.max(0, Number(state && state.page) || 0), maxPages - 1);
        const slot6Unlocked = fishSkills.getSkillLevel(profile, 'slot_6') >= 1;
        const slot7Unlocked = fishSkills.getSkillLevel(profile, 'slot_7') >= 1;
        const slotLines = [];
        for (let i = 0; i < freeCount; i++) {
            const bucket = owned[page * freeCount + i];
            slotLines.push(bucket ? buildBucketCompactLine(bucket) : '❌ ***No slot***');
        }

        // Removed unused lockedSlots variable that was causing ReferenceError: i is not defined
        let displayLocked1 = slot6Unlocked ? '' : '🔒 ***Locked slot***';
        let displayLocked2 = slot7Unlocked ? '' : '🔒 ***Locked slot***';

        let body = slotLines.join('\n\n');

        if (freeCount <= 5) {
            if (!slot6Unlocked) displayLocked1 = '🔒 ***Locked slot***';
            if (!slot7Unlocked) displayLocked2 = '🔒 ***Locked slot***';
        }
        const pageNote = maxPages > 1 ? `\n\n_Arrows: page ${page + 1}/${maxPages} (${owned.length} buckets)_` : '';
        body = `${body}${pageNote}`;
        if (body.length > 1900) body = safeSlice(body, 1900);
        container.addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

        if (maxPages > 1) {
            container.addActionRowComponents(getPaginationRow(page, maxPages));
        }
    } else {
        const bucket = owned.find(b => String(b.rowId) === String(state && state.bucketKey)) || owned[0] || null;
        container.addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(bucket ? buildBucketDetailText(bucket) : '*No bucket selected.*'));
    }

    if (view === 'overview') {
        const menuOptions = [
            { label: 'All buckets', value: 'all', description: 'View every owned bucket', default: true },
            ...owned.map(bucket => {
                const option = {
                    label: `${bucket.name} (${bucket.items.length}/${bucket.capacity})`,
                    value: bucket.rowId,
                    default: false,
                };
                option.description = bucket.locked ? '🔒 Locked' : (bucket.isActive ? 'Active bucket' : 'Bucket');
                return option;
            }),
        ].slice(0, 25);

        container.addSeparatorComponents(new SeparatorBuilder())
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('fish_bucket_select')
                        .setPlaceholder('Select a bucket to view')
                        .addOptions(menuOptions)
                )
            );
    }

    if (view === 'detail' && state && state.showFishSelect) {
        const bucket = owned.find(b => String(b.rowId) === String(state && state.bucketKey)) || owned[0] || null;
        if (bucket && bucket.items.length > 0) {
            const fishOptions = bucket.items.map((entry, index) => {
                const def = allItemsCache.get(entry.id);
                const option = {
                    label: `${index + 1}. ${(def && def.name) || entry.name || entry.id}`,
                    value: `${bucket.rowId}:${index}`,
                };
                if (def && typeof def.sell === 'number') option.description = `${def.sell} ${CURRENCY_EMOJI}`;
                return option;
            });
            container.addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('fish_bucket_fish_select')
                        .setPlaceholder('Select a fish to sell')
                        .addOptions(fishOptions)
                )
            );
        } else {
            container.addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('> *This bucket has no fish to sell.*'));
        }
    }

    let buttonsRow;
    if (view === 'overview') {
        buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('fish_equipment_back').setLabel('Go back').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('fish_shop').setLabel('Visit shop').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('fish_bucket_sell_all').setLabel('Sell all fish').setStyle(ButtonStyle.Danger)
        );
    } else {
        const bucket = owned.find(b => String(b.rowId) === String(state && state.bucketKey)) || owned[0] || null;
        const locked = Boolean(bucket && bucket.locked);
        const isEmpty = Boolean(!bucket || bucket.items.length === 0);
        buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('fish_bucket_back').setLabel('Go back').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('fish_bucket_sell_all').setLabel('Sell all fish').setStyle(ButtonStyle.Danger).setDisabled(locked),
            new ButtonBuilder().setCustomId('fish_bucket_select_fish_toggle').setLabel(state && state.showFishSelect ? 'Hide fish list' : 'Select fish').setStyle(ButtonStyle.Primary).setDisabled(locked || isEmpty),
            new ButtonBuilder().setCustomId('fish_bucket_lock').setLabel(locked ? '🔓 Unlock' : '🔒 Lock').setStyle(locked ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(buttonsRow);

    // ── Bucket navigation (detail only) via the shared NavigateManager bar.
    // Disabled automatically when the player only owns 1 bucket.
    if (view === 'detail') {
        const nav = fishBucket.getBucketNavigation(profile, inventory, state && state.bucketKey);
        container.addSeparatorComponents(new SeparatorBuilder())
            .addActionRowComponents(getPaginationRow(nav.index, nav.total));
    }
    return container;
}

function buildSkill(profile = {}, skillState = null) {
    const state = skillState || { view: 'main', branch: null, skillIndex: 0 };
    const availablePoints = fishSkills.getAvailablePoints(profile);
    const xp = Number(profile.xp) || 0;
    const nextSpXp = (Math.floor(xp / 100) + 1) * 100;
    const expText = `EXP: **${xp} / ${nextSpXp}** to next Skill Point`;

    // ── Branch select menu (shared between main and branch views) ────────
    const branchOptions = [
        { label: '📋 All skills', value: 'main', description: 'Overview of all skill branches', default: state.view === 'main' },
        ...Object.entries(fishSkills.SKILL_BRANCHES).map(([key, branch]) => ({
            label: `${branch.emoji} ${branch.label}`,
            value: key,
            default: state.view === 'branch' && state.branch === key,
        })),
    ];

    const branchSelectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('fish_skill_branch')
            .setPlaceholder('Select a skill branch')
            .addOptions(branchOptions)
    );

    if (state.view !== 'branch' || !fishSkills.SKILL_BRANCHES[state.branch]) {
        // ── MAIN MENU ──────────────────────────────────────────────────────
        
        // 1. Header Text Component
        const headerText = `# 🧠 Upgrading skills\nSkill Point: **${availablePoints}**\n${expText}`;

        // 2. Body List Component
        let listText = '';
        for (const [, branch] of Object.entries(fishSkills.SKILL_BRANCHES)) {
            // Tên Nhánh (Header)
            listText += `### ${branch.emoji ? branch.emoji + ' ' : ''}${branch.label}\n`;
            
            // Liệt kê các Skill trong nhánh
            for (const skill of branch.skills) {
                // buildBranchBar đã tự chứa thanh tiến trình và số cấp độ (VD: "░░░░░░░░░░ 0/6")
                const skillBar = fishSkills.buildBranchBar(profile, { skills: [skill] }, 10);
                
                // Đã bỏ phần ${currentLevel}/${maxLevel} thừa ở đây
                listText += `[${skillBar}] **${skill.name}**\n`;
            }
            listText += `\n`;
        }

        // 3. Action Buttons Row (Go back & Reset Points)
        const actionButtonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('fish_equipment_back')
                .setLabel('Go back')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('fish_skill_reset')
                .setLabel('Reset Points')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(fishSkills.getSpentPoints(profile) === 0)
        );

        // Trả về Container ghép lại bằng SeparatorBuilder
        return new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(listText.trim()))
            .addSeparatorComponents(new SeparatorBuilder())
            .addActionRowComponents(actionButtonsRow)
            .addSeparatorComponents(new SeparatorBuilder())
            .addActionRowComponents(branchSelectRow);
    }

    // ── BRANCH DETAIL VIEW ────────────────────────────────────────────────
    const branch = fishSkills.SKILL_BRANCHES[state.branch];
    const skills = branch.skills;
    const idx = Math.max(0, Math.min(state.skillIndex || 0, skills.length - 1));
    const skill = skills[idx];

    const currentLevel = fishSkills.getSkillLevel(profile, skill.id);
    const isMaxed = currentLevel >= skill.maxLevel;
    const levelList = fishSkills.buildLevelList(profile, skill);

    // Check prereq
    let prereqWarning = '';
    if (skill.prereq && fishSkills.getSkillLevel(profile, skill.prereq) < 1) {
        const prereqFound = fishSkills.findSkill(skill.prereq);
        const prereqName = prereqFound ? prereqFound.skill.name : skill.prereq;
        prereqWarning = `\n> ⚠️ Requires **${prereqName}** first.`;
    }

    const rodNote = skill.rodRequired ? `\n> 🎣 Only activates when using **${skill.rodRequired}**.` : '';

    // Extract only the general description (without specific numbers)
    const generalDesc = skill.desc.split('.').slice(0, 1).join('.') + '.';
    const skillHeader = `## ${skill.name}\n> ${generalDesc}${rodNote}${prereqWarning}`;
    const skillBody = `**Skill Point:** ${availablePoints} | ${expText}\n\n${levelList}`;

    // Prev/next buttons
    const levelsToMax = skill.maxLevel - currentLevel;
    const totalCostToMax = levelsToMax * (skill.cost || 1);
    const canUnlockAll = !isMaxed && availablePoints >= totalCostToMax;

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_skill_prev')
            .setEmoji('1502935282272436306')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_skill_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_skill_unlock_max')
            .setLabel(isMaxed ? '✅ Maxed' : `Unlock ${fishSkills.ROMAN[currentLevel] || 'Next'}`)
            .setStyle(isMaxed ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(isMaxed || availablePoints < (skill.cost || 1)),
        new ButtonBuilder()
            .setCustomId('fish_skill_unlock_all')
            .setLabel('Unlock All')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!canUnlockAll),
        new ButtonBuilder()
            .setCustomId('fish_skill_next')
            .setEmoji('1502935300677046412')
            .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(skillHeader))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(skillBody))
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(actionRow)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(branchSelectRow);
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

    // Xây dựng chuỗi thông tin Map & Rates
    let descriptionText = `> ${map.description}\n\n`;

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

    // Nút Travel sẽ làm accessory
    const travelButton = new ButtonBuilder()
        .setCustomId(`fish_location_travel_${map.id}`)
        .setLabel(map.id === currentMapId ? 'Already here' : 'Travel')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!isUnlocked || map.id === currentMapId);

    // Tạo Section ghép chung Text và Nút Travel (accessory)
    const mapSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(descriptionText))
        .setButtonAccessory(travelButton);

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
        .addSectionComponents(mapSection)
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(navButtonRow);
}

function buildFishingNow(profile = {}, inventory = null) {
    const bucketSummary = resolveBucketSummary(profile, inventory);
    const bucketSize = bucketSummary.capacity || 1;
    const bucketCount = bucketSummary.filled;
    const bucketLabel = bucketSummary.owned > 1 ? `(${bucketSummary.owned} buckets)` : '';
    const rodName = resolveItemName(profile.equipment?.currentRod, 'Bare Hand');
    const isBareHand = String(profile.equipment?.currentRod || '').toLowerCase() === 'hand' || rodName.toLowerCase().includes('hand');
    const durabilityCurrent = isBareHand ? '∞' : String(profile.equipment?.durability ?? 0);
    const durabilityMax = isBareHand ? '∞' : '100';

    const durabilityLine = formatStatLine(durabilityCurrent, durabilityMax, rodName, 10);
    const bucketLine = formatStatLine(String(bucketCount), String(bucketSize), bucketLabel, 10);

    const text = new TextDisplayBuilder()
        .setContent('# 🎣 Fishing now\n> Get ready! The fish are biting. Keep your eyes on the line and reel them in as soon as you feel a tug!');

    const statsText = new TextDisplayBuilder()
        .setContent(`**Current Status**\n${durabilityLine}\n${bucketLine}`);

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fish_equipment_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary)
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(text)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(statsText)
        .addActionRowComponents(buttons);
}

function buildWaitingEmbed(profile, inventory = null) {
    const bucketSummary = resolveBucketSummary(profile, inventory);
    const bucketSize = bucketSummary.capacity || 5;
    const bucketCount = bucketSummary.filled;
    const bucketLine = formatStatLine(String(bucketCount), String(bucketSize), '', 10);

    const rodName = resolveItemName(profile.equipment?.currentRod, 'Bare Hand');
    const isBareHand = String(profile.equipment?.currentRod || '').toLowerCase() === 'hand' || rodName.toLowerCase().includes('hand');
    const durabilityCurrent = isBareHand ? '∞' : String(profile.equipment?.durability ?? 0);
    const durabilityMax = isBareHand ? '∞' : '100';

    const durabilityLine = formatStatLine(durabilityCurrent, durabilityMax, rodName, 10);

    return new EmbedBuilder()
        .setTitle('Waiting for a bite... 🌊')
        .setDescription('Be ready to reel it in!')
        .addFields(
            { name: 'Bucket Space', value: bucketLine },
            { name: 'Durability', value: durabilityLine }
        )
        .setColor('#3498db');
}

function buildTugOfWarEmbed(profile, position, mapImage, inventory = null, fishStrength = 0, fishRarity = 'COMMON', behavior = 'steady') {
    const bucketSummary = resolveBucketSummary(profile, inventory);
    const bucketSize = bucketSummary.capacity || 5;
    const bucketCount = bucketSummary.filled;
    const bucketLine = formatStatLine(String(bucketCount), String(bucketSize), '', 10);

    const rarityKey = String(fishRarity).toUpperCase();
    const fishEmoji = FISH_RARITY_EMOJI[rarityKey] || '🐟';
    const rarityLabel = (FISH_RARITY_CONFIG[rarityKey] && FISH_RARITY_CONFIG[rarityKey].label) || 'Unknown';

    const barLength = 12;
    const bar = new Array(barLength).fill('█');
    const fishIndex = Math.max(0, Math.min(barLength - 1, Math.floor(position ?? 0)));
    bar[fishIndex] = fishEmoji;
    const barString = `🎣[${bar.join('')}]🌊`;

    // Strength: fill left-to-right, more █ = stronger fish
    const filled = Math.min(10, Math.round(fishStrength * 10));
    const strengthBar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const strengthLevel =
        fishStrength < 0.2 ? 'Weak' :
        fishStrength < 0.4 ? 'Normal' :
        fishStrength < 0.6 ? 'Strong' :
        fishStrength < 0.8 ? 'Very Strong' : '💥 FEROCIOUS';

    // Behavior indicator
    const behaviorLabel =
        behavior === 'burst'   ? '⚡ Burst Swimmer' :
        behavior === 'erratic' ? '🌀 Erratic'       : '〰️ Steady';

    return new EmbedBuilder()
        .setTitle('🎣 Tug of War!')
        .setDescription(
            `Reel in the fish before it escapes!\n\n${barString}\n\n` +
            `**On the line:** ${fishEmoji} **${rarityLabel}** fish\n` +
            `**Strength:** ${strengthLevel} \`${strengthBar}\`\n` +
            `**Behavior:** ${behaviorLabel}`
        )
        .setImage(`attachment://${mapImage}`)
        .addFields({ name: 'Bucket Space', value: bucketLine })
        .setColor('#e67e22');
}

function buildResultEmbed(success, fish, profile, failMessage = null, inventory = null) {
    const bucketSummary = resolveBucketSummary(profile, inventory);
    const bucketSize = bucketSummary.capacity || 5;
    const bucketCount = bucketSummary.filled;
    const bucketLine = formatStatLine(String(bucketCount), String(bucketSize), '', 10);

    if (success) {
        return new EmbedBuilder()
            .setTitle('🎉 You caught a fish!')
            .setDescription(`**${fish.name}**\n${fish.rarityLabel || 'Common'}\n${fish.description || 'A fine catch!'}`)
            .setImage(fish.image || null)
            .addFields({ name: 'Bucket Space', value: bucketLine })
            .setColor('#2ecc71');
    } else {
        return new EmbedBuilder()
            .setTitle('🎣 Fish got away...')
            .setDescription(failMessage || 'The fish had flee to the freedom... wanna try it again?')
            .addFields({ name: 'Bucket Space', value: bucketLine })
            .setColor('#e74c3c');
    }
}

function buildResultButtons(canRelease = false) {
    const buttons = [
        new ButtonBuilder()
            .setCustomId('fish_equipment_back')
            .setLabel('Go back')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_shop')
            .setLabel('Open shop')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('fish_now')
            .setLabel('Fish again')
            .setStyle(ButtonStyle.Success),
    ];

    if (canRelease) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId('fish_release')
                .setLabel('Release')
                .setStyle(ButtonStyle.Primary)
        );
    }

    return new ActionRowBuilder().addComponents(buttons);
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
    const ownedRod = inventory.some(item => String(item.item_id) === String(rodId));
    const rodItem = allItemsCache.get(rodId);

    if (!ownedRod) {
        rodInfo = `**Durability:**\n${durabilityLine}\n\n**Stats:**\n• No stats currently`;
    } else {
        const rodStatsText = rodItem ? (rodItem.stat || rodItem.stats || '• No stats currently') : '• No stats currently';
        rodInfo = `**Durability:**\n${durabilityLine}\n\n**Stats:**\n${rodStatsText}`;
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
    buildWaitingEmbed,
    buildTugOfWarEmbed,
    buildResultEmbed,
    buildResultButtons,
    buildEquipment,
};
