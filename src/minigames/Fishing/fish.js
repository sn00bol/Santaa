// Dont ask why fish.js here cuz im accidentally forgot and when move it into minigame it cause bug so imma leave it here for short time

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getRandomFish, calculateExp } = require('./fishCore');
const fishUI = require('./fishUI');
const fishShop = require('./fishShop');
const { allItemsCache } = require('../../commands/Utils/StatsCalculator');
const rpgmanager = require('../../../database/rpgmanager');
const { checkCooldown, getCooldownDuration } = require('../../commands/Utils/Cooldown');
const { checkWantedRestrictions } = require('../../commands/Utils/WantedLevel');
const mapManager = require('./MapManager');
const path = require('path');

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

        const container = fishUI.buildMain(profile);
        const mainMsg = await message.reply({ components: [container], flags: [MessageFlags.IsComponentsV2] });

        let shopState = null;
        const collector = mainMsg.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 600000 // 10 minutes, reset on each interaction
        });

        collector.on('collect', async i => {
            collector.resetTimer(); // ISSUE-017: reset inactivity timer on every interaction

            if (i.customId === 'fish_buckets') {
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildBucket()],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_skill') {
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildSkill()],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }

            if (i.customId === 'fish_equipment') {
                const inventory = await loadInventory();
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
                
                await i.update({
                    components: [fishUI.buildMain(profile)]
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
                    const durability = typeof profile.equipment.durability === 'number'
                        ? profile.equipment.durability
                        : 100;

                    if (durability <= 0) {
                        profile.equipment.currentRod = profile.fallbackRod || 'hand';
                        profile.equipment.currentBait = 'finger';
                        profile.equipment.durability = 0;
                        await rpgmanager.updateProgress(userId, { fishing_profile: profile });
                        const inventory = await loadInventory();

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

                        const inventory = await loadInventory();
                        await i.update({
                            components: [fishUI.buildEquipment(profile, inventory, '💥 Your fishing rod just broke! Falling back to bare hand fishing.')]
                        });
                        return;
                    }

                    await rpgmanager.updateProgress(userId, { fishing_profile: profile });
                }

                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildFishingNow()],
                    flags: [MessageFlags.IsComponentsV2]
                });
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
                    const inventory = await loadInventory();
                    const ownsRod = selectedRod === 'hand' || inventory.some(item => item.item_id === selectedRod);

                    if (!ownsRod) {
                        await i.update({
                            content: null,
                            embeds: [],
                            components: [fishUI.buildEquipment(profile, inventory, 'You do not own this fishing rod.')],
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
                    const inventory = await loadInventory();
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
            }

            if (i.customId === 'fish_equipment_back') {
                await i.update({
                    content: null,
                    embeds: [],
                    components: [fishUI.buildMain(profile)],
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
                const result = await fishShop.handleFishShopInteraction(i, shopState);
                if (result.handled) {
                    if (result.action === 'back') {
                        shopState = null;
                        await i.update({
                            content: null,
                            embeds: [],
                            components: [fishUI.buildMain(profile)],
                            flags: [MessageFlags.IsComponentsV2]
                        });
                        return;
                    }

                    if (result.action === 'equipment') {
                        shopState = null;
                        const inventory = await loadInventory();
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
        });
    }
};
