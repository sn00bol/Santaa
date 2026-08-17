const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const { getRandomFish, calculateExp } = require('./fishCore');
const fs = require('fs');
const path = require('path');
const fishUI = require('./fishUI');
const fishShop = require('./fishShop');
const fishBucket = require('./fishBucket');
const fishSkills = require('./fishSkills');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');
const rpgmanager = require('../../../database/rpgmanager');
const { checkCooldown, getCooldownDuration } = require('../../commands/Utils/Cooldown');
const { checkWantedRestrictions } = require('../../commands/Utils/WantedLevel');
const mapManager = require('./MapManager');

const fishCounts = new Map(); // userId -> { count, cooldownUntil }

function getFishLimitState(userId) {
    const existing = fishCounts.get(userId);
    if (existing) {
        return existing;
    }

    const state = { count: 0, cooldownUntil: 0 };
    fishCounts.set(userId, state);
    return state;
}

function resetFishLimit(userId) {
    fishCounts.delete(userId);
}

function checkFishLimit(userId, { markCatch = false } = {}) {
    const state = getFishLimitState(userId);
    const now = Date.now();

    if (state.cooldownUntil && now < state.cooldownUntil) {
        const remainingSeconds = Math.ceil((state.cooldownUntil - now) / 1000);
        const minute = Math.floor(remainingSeconds / 60);
        const second = remainingSeconds % 60;
        const cooldownText = minute > 0 ? `${minute}m ${second}s` : `${second}s`;

        return {
            allowed: false,
            message: `🎣 You're exhausted! Please wait **${cooldownText}** before fishing again.`
        };
    }

    if (state.cooldownUntil && now >= state.cooldownUntil) {
        state.cooldownUntil = 0;
        state.count = 0;
        fishCounts.set(userId, state);
    }

    if (state.count >= 5) {
        const duration = getCooldownDuration('fish_exhaustion');
        if (typeof duration === 'number' && duration > 0) {
            state.cooldownUntil = now + duration;
            fishCounts.set(userId, state);
            checkCooldown(userId, 'fish_exhaustion');

            const remainingSeconds = Math.ceil(duration / 1000);
            const minute = Math.floor(remainingSeconds / 60);
            const second = remainingSeconds % 60;
            const cooldownText = minute > 0 ? `${minute}m ${second}s` : `${second}s`;

            return {
                allowed: false,
                message: `🎣 You've reached the fishing limit. Please wait **${cooldownText}** before fishing again.`
            };
        }
    }

    if (markCatch) {
        state.count += 1;
        fishCounts.set(userId, state);
    }

    return { allowed: true, message: null };
}

module.exports = {
    name: 'fish',
    description: 'Start fishing for rare fish!',
    category: 'mie',
    usage: 'Zfish',
    resetFishLimit,
    checkFishLimit,
    async execute(message, args) {
        const userId = message.author.id;

        const limitStatus = checkFishLimit(userId);
        if (!limitStatus.allowed) {
            return message.reply(limitStatus.message);
        }

        const wantedCheck = await checkWantedRestrictions(userId, this.name, message.client, message);
        if (!wantedCheck.allowed) {
            if (!wantedCheck.handled && wantedCheck.message) message.reply(wantedCheck.message);
            return;
        }

        const stats = await rpgmanager.getStats(userId);
        const profile = stats.fishing_profile || {};
        const loadInventory = async () => await rpgmanager.getInventory(userId);

        if (!profile.initialItemsGranted) {
            const defaultItems = [
                { id: 'defaultRod', quantity: 1 },
                { id: 'defaultBucket', quantity: 1 },
                { id: 'YourHandLOL', quantity: 1 },
                { id: 'hand', quantity: 1 },
                { id: 'finger', quantity: 1 }
            ];

            for (const { id, quantity } of defaultItems) {
                const itemDef = allItemsCache.get(id);
                if (!itemDef) continue;
                for (let i = 0; i < quantity; i++) {
                    await rpgmanager.addItem(userId, itemDef.id, itemDef.name);
                }
            }

            const wormDef = allItemsCache.get('worm');
            if (wormDef) {
                for (let i = 0; i < 5; i++) {
                    await rpgmanager.addItem(userId, wormDef.id, wormDef.name);
                }
            }

            profile.initialItemsGranted = true;
            await rpgmanager.updateProgress(userId, { fishing_profile: profile });
        }

        const mainInventory = await loadInventory();
        let cachedInventory = mainInventory; // Cache inventory to reduce DB calls
        let inventoryCacheTime = Date.now();
        const CACHE_DURATION = 5000; // 5 seconds cache
        
        const getCachedInventory = async () => {
            const now = Date.now();
            if (now - inventoryCacheTime > CACHE_DURATION) {
                cachedInventory = await loadInventory();
                inventoryCacheTime = now;
            }
            return cachedInventory;
        };
        
        const container = fishUI.buildMain(profile, mainInventory);
        const mainMsg = await message.reply({ components: [container], flags: [MessageFlags.IsComponentsV2] });

        async function handleFishingResult(success) {
            endTugOfWar();
            const inventoryNow = await getCachedInventory();
            
            if (success) {
                const map = mapManager.getMap(profile.currentMap) || mapManager.getAllMaps()[0];
                const tier = map.tier;
                let winFish = false;
                let winItem = false;

                // Get current rod and skill levels
                const currentRod = profile.equipment?.currentRod || 'hand';
                const handLoversLevel = fishSkills.getSkillLevel(profile, 'hand_lovers');
                const bazookanistLevel = fishSkills.getSkillLevel(profile, 'bazookanist');
                const bucketsEnhancedLevel = fishSkills.getSkillLevel(profile, 'buckets_enhanced');
                const imStrongerLevel = fishSkills.getSkillLevel(profile, 'im_stronger');
                
                // Calculate skill effects
                // hand_lovers: +3% + level * 0.55% fish vs junk chance (hand only)
                const handLoversEffect = currentRod === 'hand' 
                    ? 0.03 + handLoversLevel * 0.0055 
                    : 0;
                
                // bazookanist/buckets_enhanced: reduce rarity penalty
                const bazookanistEffect = currentRod === 'kaboom' 
                    ? 0.5 + (bazookanistLevel - 1) * 0.25 
                    : 0;
                const bucketsEnhancedEffect = currentRod === 'bucketRod' 
                    ? 0.5 + (bucketsEnhancedLevel - 1) * 0.25 
                    : 0;
                
                // Apply skill effects to roll threshold
                // Base thresholds: tier <= 2 uses 0.6, tier > 2 uses 0.5
                // Skill effects reduce the junk chance (increase fish chance)
                const baseThreshold = tier <= 2 ? 0.6 : 0.5;
                const adjustedThreshold = baseThreshold - handLoversEffect - bazookanistEffect - bucketsEnhancedEffect;
                
                const roll = Math.random();
                const effectiveThreshold = Math.max(0, Math.min(1, adjustedThreshold));
                if (roll < effectiveThreshold) winFish = true; else winItem = true;

                if (winFish) {
                    const rodId = profile.equipment?.currentRod || 'hand';
                    const baitId = profile.equipment?.currentBait || 'finger';
                    const rod = require('./fishCore').ROD_STATS[rodId] || require('./fishCore').ROD_STATS.hand;
                    
                    const multiCatch = rod.multiCatch || 1;
                    const catchCount = typeof multiCatch === 'object' ? Math.floor(Math.random() * (multiCatch.max - multiCatch.min + 1)) + multiCatch.min : multiCatch;
                    
                    const caughtFishList = [];
                    for (let i = 0; i < catchCount; i++) {
                        const fish = getRandomFish(rodId, baitId);
                        if (fish) caughtFishList.push(fish);
                    }

                    if (caughtFishList.length === 0) return await handleFishingResult(false);
                    
                    let fishDisplay = '';
                    let bucketNotice = '';
                    for (const fish of caughtFishList) {
                        await rpgmanager.addItem(userId, fish.id, fish.name);
                        const bucketPlace = fishBucket.placeCaughtFish(profile, inventoryNow, fish);
                        if (bucketPlace && !bucketPlace.placed && bucketPlace.reason === 'full') {
                            bucketNotice = `\n> ⚠️ **${bucketPlace.bucketName}** is full! The overflow fish went to your general inventory (\`Zinventory\`) instead.`;
                        }
                        fishDisplay += `**${fish.name}** (${fish.rarityLabel})\n`;
                    }
                    await rpgmanager.updateProgress(userId, { fishing_profile: profile });
                    
                    await mainMsg.edit({
                        content: null,
                        embeds: [],
                        components: [
                            new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# 🎉 You caught ${caughtFishList.length} fish!\n${fishDisplay}${bucketNotice}\n\n${fishUI.buildResultEmbed(true, caughtFishList[0], profile, null, inventoryNow).data.fields[0].value}`)
                                )
                                .addActionRowComponents([fishUI.buildResultButtons()])
                        ],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                } else {
                    // Handle random item (Damage Item)
                    const rodId = profile.equipment?.currentRod || 'hand';
                    const rod = require('./fishCore').ROD_STATS[rodId] || require('./fishCore').ROD_STATS.hand;
                    
                    const multiCatch = rod.multiCatch || 1;
                    const catchCount = typeof multiCatch === 'object' ? Math.floor(Math.random() * (multiCatch.max - multiCatch.min + 1)) + multiCatch.min : multiCatch;

                    const caughtItemList = [];
                    for (let i = 0; i < catchCount; i++) {
                        const randomItem = await getRandomDamageItem();
                        if (randomItem) caughtItemList.push(randomItem);
                    }

                    let itemDisplay = '';
                    for (const item of caughtItemList) {
                        await rpgmanager.addItem(userId, item.id, `${item.name} (Damage Item)`);
                        itemDisplay += `**${item.name}**\n`;
                    }
                    
                    await mainMsg.edit({
                        content: null,
                        embeds: [],
                        components: [
                            new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# 🎣 You caught some junk!\n> You caught ${caughtItemList.length} junk item(s) instead of a fish!\n${itemDisplay}\n${fishUI.buildResultEmbed(false, null, profile, null, inventoryNow).data.fields[0].value}`)
                                )
                                .addActionRowComponents([fishUI.buildResultButtons()])
                        ],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                }
            } else {
                await mainMsg.edit({
                    content: null,
                    embeds: [],
                    components: [
                            new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# 🎣 Fish got away...\n> The fish had flee to the freedom... wanna try it again?\n\n${fishUI.buildResultEmbed(false, null, profile, null, inventoryNow).data.fields[0].value}`)
                                )
                                .addActionRowComponents([fishUI.buildResultButtons()])
                        ],
                        flags: [MessageFlags.IsComponentsV2]
                });
            }
        }

        async function getRandomDamageItem() {
            const itemPool = [];
            // Correct paths based on workspace structure
            const shopPaths = [
                path.join(__dirname, '..', '..', 'items', 'shopItems', 'gepora'),
                path.join(__dirname, '..', '..', 'items', 'shopItems', 'kimori'),
                path.join(__dirname, '..', '..', 'items', 'fish', 'fshop', 'fishingRod')
            ];

            for (const p of shopPaths) {
                if (fs.existsSync(p)) {
                    const files = fs.readdirSync(p).filter(f => f.endsWith('.js'));
                    for (const f of files) {
                        try {
                            const item = require(path.join(p, f));
                            
                            // Skip default items and bait
                            if (['hand', 'defaultRod', 'worm', 'jig', 'crank', 'finger'].includes(item.id)) continue;
                            
                            // We include items that have any special stats, durability, or capacity
                            // Or just any item from these folders to ensure we get "junk"
                            if (item.stats || item.durability || item.capacity || true) {
                                itemPool.push(item);
                            }
                        } catch (e) {}
                    }
                }
            }

            if (itemPool.length === 0) return null;
            return itemPool[Math.floor(Math.random() * itemPool.length)];
        }

        let shopState = null;
        let bucketState = { view: 'overview', bucketKey: null, page: 0, showFishSelect: false };
        let skillState = { view: 'main', branch: null, skillIndex: 0 };
        const collector = mainMsg.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 600000 // 10 minutes, reset on each interaction
        });

        // Tug of War State
        let tugOfWar = {
            active: false,
            position: 6,
            interval: null,
            timeout: null,
            mapImage: null,
            renderLock: false,
            tickLock: false,
            lastReelTime: 0,
            fishStrength: 0,
            tickCount: 0
        };

        const endTugOfWar = (result) => {
            tugOfWar.active = false;
            if (tugOfWar.interval) clearTimeout(tugOfWar.interval);
            if (tugOfWar.timeout) clearTimeout(tugOfWar.timeout);
            tugOfWar.interval = null;
            tugOfWar.timeout = null;
            tugOfWar.lastReelTime = 0;
            tugOfWar.fishStrength = 0;
            tugOfWar.tickCount = 0;
            return result;
        };

        const renderTugOfWar = async (overridePosition = null) => {
            if (!tugOfWar.active || tugOfWar.renderLock) return;
            tugOfWar.renderLock = true;
            try {
                const currentPosition = overridePosition ?? tugOfWar.position;
                await mainMsg.edit({
                    embeds: [],
                    components: [
                        new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(`# 🎣 Tug of War!\n> Reel in the fish before it escapes!\n\n${fishUI.buildTugOfWarEmbed(profile, currentPosition, tugOfWar.mapImage, tugOfWar.inventory, tugOfWar.fishStrength).data.description}\n\n${fishUI.buildWaitingEmbed(profile, tugOfWar.inventory).data.fields[0].value}`)
                            )
                            .addActionRowComponents([
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('fish_reel_in')
                                        .setLabel('🎣 REEL IN!')
                                        .setStyle(ButtonStyle.Success)
                                )
                            ])
                    ],
                    flags: [MessageFlags.IsComponentsV2]
                });
            } catch (e) {
                console.error('Error rendering tug-of-war state:', e);
            } finally {
                tugOfWar.renderLock = false;
            }
        };

        collector.on('collect', async i => {
            // Fix: Allow navigation buttons (prev/next) and branch select to work even when in branch view
            if (skillState.view === 'branch' && 
                !i.customId.startsWith('fish_skill') && 
                i.customId !== 'fish_equipment_back') {
                await i.deferUpdate();
                return;
            }
            collector.resetTimer();
            try {

            if (tugOfWar.active && i.customId === 'fish_reel_in') {
                if (tugOfWar.renderLock) {
                    await i.deferUpdate();
                    return;
                }

                const rodId = profile.equipment?.currentRod || 'hand';
                const baitId = profile.equipment?.currentBait || 'finger';
                const rodPower = require('./fishCore').ROD_STATS[rodId]?.reelPower || 3;
                const baitPower = require('./fishCore').BAIT_STATS[baitId]?.reelPower || 3;
                const imSmarterLevel = fishSkills.getSkillLevel(profile, 'im_smarter');

                // Reduced reel power for better balance - requires more clicks
                const totalReelPower = Number(Math.max(1.5, (rodPower + baitPower + imSmarterLevel * 0.15) * 0.4).toFixed(1));

                tugOfWar.position -= totalReelPower;
                tugOfWar.lastReelTime = Date.now(); // Update last reel time
                
                if (tugOfWar.position <= 0) {
                    await i.deferUpdate();
                    return await handleFishingResult(true);
                }

                await i.deferUpdate();
                await renderTugOfWar();
                return;
            }

            if (i.customId === 'fish_buckets') {
                bucketState = { view: 'overview', bucketKey: null, page: 0, showFishSelect: false };
                const inventory = await getCachedInventory();
                // Seed / migrate bucket containers and re-sync the profile mirrors.
                fishBucket.getOwnedBuckets(profile, inventory);
                await rpgmanager.updateProgress(userId, { fishing_profile: profile });

                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildBucket(profile, inventory, bucketState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            // ── Buckets sub-menu navigation & actions ─────────────────────
            if (i.customId === 'fish_bucket_back') {
                bucketState = { view: 'overview', bucketKey: null, page: 0, showFishSelect: false };
                const inventory = await loadInventory();
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildBucket(profile, inventory, bucketState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            // NavigateManager pagination bar (customIds: first/prev/next/last).
            // Overview -> page through the 5 free bucket slots; detail -> hop
            // between buckets.
            if (['first', 'prev', 'next', 'last'].includes(i.customId) && (bucketState.view === 'overview' || bucketState.view === 'detail')) {
                const inventory = await getCachedInventory();
                const ownedNow = fishBucket.getOwnedBuckets(profile, inventory);

                if (bucketState.view === 'overview') {
                    const maxPages = Math.max(1, Math.ceil(ownedNow.length / fishBucket.FREE_SLOT_COUNT));
                    const page = Math.min(Math.max(0, bucketState.page || 0), maxPages - 1);
                    let nextPage = page;
                    if (i.customId === 'first') nextPage = 0;
                    else if (i.customId === 'prev') nextPage = Math.max(0, page - 1);
                    else if (i.customId === 'next') nextPage = Math.min(maxPages - 1, page + 1);
                    else if (i.customId === 'last') nextPage = maxPages - 1;
                    bucketState.page = nextPage;
                } else {
                    const nav = fishBucket.getBucketNavigation(profile, inventory, bucketState.bucketKey);
                    let index = nav.index;
                    if (i.customId === 'first') index = 0;
                    else if (i.customId === 'prev') index = Math.max(0, index - 1);
                    else if (i.customId === 'next') index = Math.min(nav.total - 1, index + 1);
                    else if (i.customId === 'last') index = nav.total - 1;
                    const target = ownedNow[index];
                    if (target) bucketState.bucketKey = target.rowId;
                }

                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildBucket(profile, inventory, bucketState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_bucket_lock') {
                const inventory = await getCachedInventory();
                fishBucket.toggleBucketLock(profile, bucketState.bucketKey);
                await rpgmanager.updateProgress(userId, { fishing_profile: profile });
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildBucket(profile, inventory, bucketState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_bucket_select_fish_toggle') {
                const inventory = await getCachedInventory();
                bucketState.showFishSelect = !bucketState.showFishSelect;
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildBucket(profile, inventory, bucketState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_bucket_sell_all') {
                const inventory = await getCachedInventory();
                const scope = bucketState.view === 'detail' ? bucketState.bucketKey : 'all';
                const result = await fishBucket.sellAllFish(userId, profile, inventory, scope);

                // sellAllFish replaces container arrays, so re-sync the mirrors
                // (currentItems / maxSpace) before persisting.
                const freshInventory = await getCachedInventory();
                fishBucket.getOwnedBuckets(profile, freshInventory);
                await rpgmanager.updateProgress(userId, { fishing_profile: profile });

                if (!result.ok) {
                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildBucket(profile, freshInventory, bucketState)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                    await i.followUp({ content: result.message, ephemeral: true });
                    return;
                }

                const soldLines = result.sold.slice(0, 10).map(s => `**${s.name}** \`x${s.count}\` — ${CURRENCY_EMOJI}${s.earned.toLocaleString()}`).join('\n');
                const moreLine = result.sold.length > 10 ? `\n…and ${result.sold.length - 10} more type(s)` : '';
                const summary = result.soldCount > 0
                    ? `> **Sold ${result.soldCount} fish** for **${result.totalEarned.toLocaleString()}${CURRENCY_EMOJI}**!\n${soldLines}${moreLine}`
                    : '> Nothing was sold — the bucket(s) are empty or only hold unsellable fish.';

                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildBucket(profile, freshInventory, bucketState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                await i.followUp({ content: summary, ephemeral: true });
                return;
            }

            if (i.customId === 'fish_skill') {
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildSkill(profile, skillState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_skill_branch') {
                const selected = i.values[0];
                // 'main' means all skills view, otherwise switch to specific branch
                if (selected === 'main') {
                    skillState = { view: 'main', branch: null, skillIndex: 0 };
                } else {
                    skillState = { view: 'branch', branch: selected, skillIndex: 0 };
                }
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildSkill(profile, skillState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_skill_unlock_max') {
                let skillId = null;
                if (skillState.branch && fishSkills.SKILL_BRANCHES[skillState.branch]) {
                    const skills = fishSkills.SKILL_BRANCHES[skillState.branch].skills;
                    const idx = Math.max(0, Math.min(skillState.skillIndex || 0, skills.length - 1));
                    skillId = skills[idx].id;
                }

                if (skillId) {
                    const result = fishSkills.unlockSkillLevel(profile, skillId);
                    if (result.ok) {
                        await rpgmanager.updateProgress(userId, { fishing_profile: profile });
                        await i.update({
                            content: null,
                            embeds: [],
                            components: [fishUI.buildSkill(profile, skillState)],
                            flags: [MessageFlags.IsComponentsV2]
                        });
                    } else {
                        await i.followUp({ content: result.message, ephemeral: true });
                    }
                } else {
                    await i.followUp({ content: 'Skill not found.', ephemeral: true });
                }
                return;
            }

            if (i.customId === 'fish_skill_unlock_all') {
                let skillId = null;
                if (skillState.branch && fishSkills.SKILL_BRANCHES[skillState.branch]) {
                    const skills = fishSkills.SKILL_BRANCHES[skillState.branch].skills;
                    const idx = Math.max(0, Math.min(skillState.skillIndex || 0, skills.length - 1));
                    skillId = skills[idx].id;
                }

                if (skillId) {
                    const found = fishSkills.findSkill(skillId);
                    const skillDef = found.skill;
                    const currentLevel = fishSkills.getSkillLevel(profile, skillId);
                    const levelsToGain = skillDef.maxLevel - currentLevel;
                    const totalCost = levelsToGain * (skillDef.cost || 1);
                    const available = fishSkills.getAvailablePoints(profile);

                    if (available < totalCost) {
                        await i.followUp({ content: `Not enough skill points to max this skill! You need **${totalCost}** but have **${available}**.`, ephemeral: true });
                        return;
                    }

                    profile.skill = profile.skill || {};
                    profile.skill.levels = profile.skill.levels || {};
                    profile.skill.levels[skillId] = skillDef.maxLevel;

                    await rpgmanager.updateProgress(userId, { fishing_profile: profile });
                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildSkill(profile, skillState)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                } else {
                    await i.followUp({ content: 'Skill not found.', ephemeral: true });
                }
                return;
            }

            if (i.customId === 'fish_skill_reset') {
                // Reset all skills - refund all points
                fishSkills.resetSkills(profile);
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildSkill(profile, skillState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_skill_back') {
                skillState = { view: 'main', branch: null, skillIndex: 0 };
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildSkill(profile, skillState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_skill_prev') {
                // Navigate to previous skill in branch (loop)
                if (skillState.branch && fishSkills.SKILL_BRANCHES[skillState.branch]) {
                    const skills = fishSkills.SKILL_BRANCHES[skillState.branch].skills;
                    let newIndex = skillState.skillIndex - 1;
                    if (newIndex < 0) newIndex = skills.length - 1;
                    skillState = { ...skillState, skillIndex: newIndex };
                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildSkill(profile, skillState)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                }
                return;
            }

            if (i.customId === 'fish_skill_next') {
                // Navigate to next skill in branch (loop)
                if (skillState.branch && fishSkills.SKILL_BRANCHES[skillState.branch]) {
                    const skills = fishSkills.SKILL_BRANCHES[skillState.branch].skills;
                    let newIndex = skillState.skillIndex + 1;
                    if (newIndex >= skills.length) newIndex = 0;
                    skillState = { ...skillState, skillIndex: newIndex };
                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildSkill(profile, skillState)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                }
                return;
            }

            if (i.customId === 'fish_equipment') {
                const inventory = await getCachedInventory();
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildEquipment(profile, inventory)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_location') {
                const targetMapId = profile.currentMap || 'nomanssea';
                const map = mapManager.getMap(targetMapId) || mapManager.getAllMaps()[0];
                const imagePath = path.join(__dirname, '..', '..', '..', 'assets', 'fish', map.image);
                
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildLocation(profile, targetMapId)],
                    files: [{ attachment: imagePath, name: map.image }],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId.startsWith('fish_location_travel_')) {
                const targetMapId = i.customId.replace('fish_location_travel_', '');
                profile.currentMap = targetMapId;
                await rpgmanager.updateProgress(userId, { fishing_profile: profile });
                
                const inventory = await getCachedInventory();
                await i.update({
                    components: [fishUI.buildMain(profile, inventory)]
                });
                return;
            }

            if (i.customId === 'fish_now') {
                // Guard: redirect to Location if no map is set
                if (!profile.currentMap) {
                    const firstMap = mapManager.getAllMaps()[0];
                    const imagePath = path.join(__dirname, '..', '..', '..', 'assets', 'fish', firstMap.image);
                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildLocation(profile, firstMap.id)],
                        files: [{ attachment: imagePath, name: firstMap.image }],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                    return;
                }

                profile.equipment = profile.equipment || {};
                const currentRod = profile.equipment.currentRod || 'hand';
                const isBareHand = currentRod === 'hand';

                if (!isBareHand) {
                    const imStrongerLevel = fishSkills.getSkillLevel(profile, 'im_stronger');
                    const maxDurability = 100 + imStrongerLevel * 10;
                    const durability = typeof profile.equipment.durability === 'number'
                        ? profile.equipment.durability
                        : maxDurability;

                    if (durability <= 0) {
                        profile.equipment.currentRod = profile.fallbackRod || 'hand';
                        profile.equipment.currentBait = 'finger';
                        profile.equipment.durability = 0;
                        await rpgmanager.updateProgress(userId, { fishing_profile: profile });
                        const inventory = await getCachedInventory();

                        await i.update({
                            components: [fishUI.buildEquipment(profile, inventory, '⚠️ Your fishing rod is broken! Falling back to bare hand.')]
                        });
                        return;
                    }

                    profile.equipment.durability = durability - 1;

                    if (profile.equipment.durability <= 0) {
                        profile.equipment.currentRod = profile.fallbackRod || 'hand';
                        profile.equipment.currentBait = 'finger';
                        profile.equipment.durability = 0;
                        await rpgmanager.updateProgress(userId, { fishing_profile: profile });

                        const inventory = await getCachedInventory();
                        await i.update({
                            components: [fishUI.buildEquipment(profile, inventory, '💥 Your fishing rod just broke! Falling back to bare hand fishing.')]
                        });
                        return;
                    }

                    await rpgmanager.updateProgress(userId, { fishing_profile: profile });

                    if (currentRod === 'kaboom') {
                        const inventoryRows = await rpgmanager.getInventory(userId);
                        const kaboomEntry = inventoryRows.find(item => item.item_id === 'kaboom');
                        if (kaboomEntry) {
                            await rpgmanager.removeItem(kaboomEntry.id);
                        }

                        profile.equipment.currentRod = profile.fallbackRod || 'hand';
                        profile.equipment.currentBait = 'finger';
                        profile.equipment.durability = 0;
                        await rpgmanager.updateProgress(userId, { fishing_profile: profile });

                        const inventory = await getCachedInventory();
                        await i.update({
                            content: null,
                            embeds: [],
                            components: [fishUI.buildEquipment(profile, inventory, '💥 Dynamite Kaboom has been used up! Falling back to bare hand fishing.')],
                            flags: [MessageFlags.IsComponentsV2]
                        });
                        return;
                    }
                }

                const inventory = await getCachedInventory();
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildFishingNow(profile, inventory)],
                    flags: [MessageFlags.IsComponentsV2]
                });

                const waitTime = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
                setTimeout(async () => {
                    try {
                        const map = mapManager.getMap(profile.currentMap) || mapManager.getAllMaps()[0];
                        const imagePath = path.join(__dirname, '..', '..', '..', 'assets', 'fish', map.image);
                        
                        tugOfWar.active = true;
                        tugOfWar.position = 6;
                        tugOfWar.mapImage = map.image;
                        tugOfWar.inventory = inventory;
                        tugOfWar.lastReelTime = 0; // Track when user last clicked reel in
                        tugOfWar.fishStrength = 0; // Fish strength that increases over time
                        tugOfWar.tickCount = 0; // Track number of ticks for progressive difficulty

                        const tickTugOfWar = async () => {
                            if (!tugOfWar.active || tugOfWar.tickLock) return;
                            tugOfWar.tickLock = true;
                            try {
                                const rodId = profile.equipment?.currentRod || 'hand';
                                const baitId = profile.equipment?.currentBait || 'finger';
                                const rodPower = require('./fishCore').ROD_STATS[rodId]?.reelPower || 3;
                                const baitPower = require('./fishCore').BAIT_STATS[baitId]?.reelPower || 3;

                                // Progressive difficulty: fish gets stronger over time
                                tugOfWar.tickCount++;
                                const strengthIncrease = Math.min(0.8, tugOfWar.tickCount * 0.02); // Cap at 0.8 additional strength
                                tugOfWar.fishStrength = strengthIncrease;

                                // Calculate base drift with better scaling
                                const baseDrift = 0.08 + ((baitPower || 3) / 10) * 0.08;
                                const drift = Number(Math.min(0.25, baseDrift + tugOfWar.fishStrength).toFixed(2));
                                
                                // Smooth drift reduction based on recent user activity
                                const now = Date.now();
                                const timeSinceLastReel = now - tugOfWar.lastReelTime;
                                
                                // Calculate drift reduction factor (0.1 to 1.0)
                                let driftFactor = 1.0;
                                if (timeSinceLastReel < 500) {
                                    driftFactor = 0.1; // Very effective if clicking very fast
                                } else if (timeSinceLastReel < 1000) {
                                    driftFactor = 0.3; // Effective if clicking within 1 second
                                } else if (timeSinceLastReel < 2000) {
                                    driftFactor = 0.6; // Partially effective if clicking within 2 seconds
                                }
                                
                                const adjustedDrift = drift * driftFactor;
                                
                                // Apply drift with minimum threshold to ensure some movement
                                const finalDrift = Math.max(0.02, adjustedDrift);
                                tugOfWar.position += finalDrift;
                                
                                if (tugOfWar.position >= 12) {
                                    await handleFishingResult(false);
                                    return;
                                }

                                await renderTugOfWar();
                            } catch (e) {
                                console.error('Error in tug-of-war tick:', e);
                            } finally {
                                tugOfWar.tickLock = false;
                                if (tugOfWar.active) {
                                    tugOfWar.interval = setTimeout(tickTugOfWar, 500); // Faster tick for smoother gameplay
                                }
                            }
                        };

                        // Add initial delay for smooth start
                        tugOfWar.interval = setTimeout(tickTugOfWar, 1500);

                        // Time limit
                        tugOfWar.timeout = setTimeout(async () => {
                            if (tugOfWar.active) {
                                await handleFishingResult(false);
                            }
                        }, 15000);

                        await mainMsg.edit({
                            content: null,
                            embeds: [],
                            components: [
                                new ContainerBuilder()
                                    .addTextDisplayComponents(
                                        new TextDisplayBuilder()
                                        .setContent(`# 🎣 Tug of War!\n> Reel in the fish before it escapes!\n\n${fishUI.buildTugOfWarEmbed(profile, tugOfWar.position, tugOfWar.mapImage, tugOfWar.inventory, tugOfWar.fishStrength).data.description}`)
                                    )
                                    .addActionRowComponents([
                                        new ActionRowBuilder().addComponents(
                                            new ButtonBuilder()
                                                .setCustomId('fish_reel_in')
                                                .setLabel('🎣 REEL IN!')
                                                .setStyle(ButtonStyle.Success)
                                        )
                                    ])
                            ],
                            files: [{ attachment: imagePath, name: map.image }],
                            flags: [MessageFlags.IsComponentsV2]
                        });
                    } catch (e) {
                        console.error('Error transitioning to Tug of War:', e);
                    }
                }, waitTime);
                return;
            }

            if (i.isStringSelectMenu()) {
                if (i.customId === 'fish_location_select') {
                    const targetMapId = i.values[0];
                    const map = mapManager.getMap(targetMapId) || mapManager.getAllMaps()[0];
                    const imagePath = path.join(__dirname, '..', '..', '..', 'assets', 'fish', map.image);
                    
                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildLocation(profile, targetMapId)],
                        files: [{ attachment: imagePath, name: map.image }],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                    return;
                }
                if (i.customId === 'fish_equipment_select_rod') {
                    const selectedRod = i.values[0];
                    const inventory = await getCachedInventory();
                    const ownsRod = selectedRod === 'hand' || inventory.some(item => item.item_id === selectedRod);

                    if (!ownsRod) {
                        await i.update({
                            content: null,
                            embeds: [],
                            components: [fishUI.buildEquipment(profile, inventory, 'You dont own this item!')],
                            flags: [MessageFlags.IsComponentsV2]
                        });
                        return;
                    }

                    profile.equipment = profile.equipment || {};
                    profile.equipment.currentRod = selectedRod;
                    if (profile.equipment.currentRod === 'hand') {
                        profile.equipment.currentBait = 'finger';
                    }
                    await rpgmanager.updateProgress(userId, { fishing_profile: profile });

                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildEquipment(profile, inventory)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                    return;
                }

                if (i.customId === 'fish_equipment_select_bait') {
                    const selectedBait = i.values[0];
                    const inventory = await getCachedInventory();
                    const ownsBait = selectedBait === 'finger' || inventory.some(item => item.item_id === selectedBait);

                    if (!ownsBait) {
                        await i.update({
                            content: null,
                            embeds: [],
                            components: [fishUI.buildEquipment(profile, inventory, 'You do not own this bait.')],
                            flags: [MessageFlags.IsComponentsV2]
                        });
                        return;
                    }

                    profile.equipment = profile.equipment || {};
                    profile.equipment.currentBait = selectedBait;
                    await rpgmanager.updateProgress(userId, { fishing_profile: profile });

                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildEquipment(profile, inventory)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                    return;
                }

                if (i.customId === 'fish_bucket_select') {
                    const selected = i.values[0];
                    const inventory = await getCachedInventory();
                    if (selected === 'all') {
                        bucketState = { view: 'overview', bucketKey: null, page: 0, showFishSelect: false };
                    } else {
                        bucketState = { view: 'detail', bucketKey: selected, page: 0, showFishSelect: false };
                    }
                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildBucket(profile, inventory, bucketState)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                    return;
                }

                if (i.customId === 'fish_bucket_fish_select') {
                    const [key, indexStr] = i.values[0].split(':');
                    const fishIndex = Number(indexStr);
                    const inventory = await getCachedInventory();

                    const result = await fishBucket.sellFishFromBucket(userId, profile, inventory, key, fishIndex);
                    await rpgmanager.updateProgress(userId, { fishing_profile: profile });

                    if (!result.ok) {
                        await i.reply({ content: result.message, ephemeral: true });
                        return;
                    }

                    const freshInventory = await getCachedInventory();
                    await i.update({
                        content: null,
                        embeds: [],
                        components: [fishUI.buildBucket(profile, freshInventory, bucketState)],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                    await i.followUp({ content: `> Sold **${result.name}** for **${result.earned.toLocaleString()}${CURRENCY_EMOJI}**!`, ephemeral: true });
                    return;
                }
            }

            if (i.customId === 'fish_equipment_back') {
                const inventory = await getCachedInventory();
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildMain(profile, inventory)],
                    files: [],
                    attachments: [],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_shop' || i.customId === 'fish_equipment_shop') {
                shopState = await fishShop.createFishShopState(userId, 'fish', true);
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildShop(shopState)],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (shopState) {
                const result = await fishShop.handleFishShopInteraction(i, shopState, profile);
                if (result.handled) {
                    if (result.action === 'back') {
                        shopState = null;
                        const inventory = await getCachedInventory();
                        await i.update({
                            content: null,
                            embeds: [],
                            components: [fishUI.buildMain(profile, inventory)],
                            flags: [MessageFlags.IsComponentsV2]
                        });
                        return;
                    }

                    if (result.action === 'equipment') {
                        shopState = null;
                        const inventory = await getCachedInventory();
                        await i.update({
                            content: null,
                            embeds: [],
                            components: [fishUI.buildEquipment(profile, inventory)],
                            flags: [MessageFlags.IsComponentsV2]
                        });
                        return;
                    }

                    return;
                }
            }

            await i.deferUpdate();
            } catch (error) {
                // Never let an unexpected error leave the interaction
                // unacknowledged (Discord would report "didn't respond in time").
                console.error('Fish interaction error:', error);
                await i.deferUpdate().catch(() => { });
            }
        });
    }
};
