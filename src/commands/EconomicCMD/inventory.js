const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const rpgmanager = require('../../../database/rpgmanager');
const dbmanager = require('../../../database/dbmanager');
const { getPaginationRow, applySelectMenuDefaults } = require('../Utils/NavigateManager');
const { getTotalStats, allItemsCache } = require('../Utils/StatsCalculator');
const { executeSell } = require('./sell');
const { isVisibleItem } = require('../Utils/itemVisibility');

module.exports = {
    name: 'inventory',
    aliases: ['inv', 'bag'],
    description: 'Checking your inventory and profile stats',
    category: 'eco',
    usage: 'Zinventory `@user`',
    async execute(message, args) {
        let inventoryItems = await rpgmanager.getInventory(message.author.id);
        const allItems = allItemsCache;

        const itemsPerPage = 5;
        let totalPages = Math.max(1, Math.ceil(inventoryItems.length / itemsPerPage));
        let currentPage = 0;
        let selectedInventoryIds = [];

        const generateEmbedAndComponents = async (page) => {
            const userStats = await getTotalStats(message.author.id);
            inventoryItems = (await rpgmanager.getInventory(message.author.id)).filter(invItem => {
                const itemDef = allItems.get(invItem.item_id);
                if (!itemDef) return true;
                
                // Hide specific items
                const fishingItems = ['hand', 'defaultRod', 'sharkRod', 'bucketRod', 'kaboom', 'niceGlove', 'worm', 'jig', 'crank', 'finger', 'defaultBucket'];
                if (fishingItems.includes(invItem.item_id)) return false;

                return isVisibleItem(itemDef);
            });
            totalPages = Math.max(1, Math.ceil(inventoryItems.length / itemsPerPage));

            // Group items by item_id and item_name (to separate Damage Items)
            const groupedItems = [];
            const counts = {};
            inventoryItems.forEach(item => {
                const groupKey = `${item.item_id}_${item.item_name}`;
                if (!counts[groupKey]) {
                    counts[groupKey] = { ...item, count: 1 };
                    groupedItems.push(counts[groupKey]);
                } else {
                    counts[groupKey].count++;
                }
            });

            totalPages = Math.max(1, Math.ceil(groupedItems.length / itemsPerPage));

            // Stat Display
            let desc = `❤️ **Health:** \`${userStats.health} / ${userStats.maxHealth}\`\n`;
            desc += `⚡ **Stamina:** \`${userStats.stamina} / ${userStats.maxStamina}\`\n`;
            desc += `⚔️ **Attack:** \`${userStats.totalAttack}\`\n`;
            desc += `🛡️ **Equipped:** \`${userStats.equippedItemName || 'None'}\`\n`;

            const stats = await rpgmanager.getStats(message.author.id);
            const wantedLevel = Math.floor((stats.wanted_level || 0) / 5);
            const stars = wantedLevel > 0 ? '⭐'.repeat(wantedLevel) : '0';
            desc += `🌟 **Wanted Level:** ${stars}\n\n`;

            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            const start = page * itemsPerPage;
            const currentItems = groupedItems.slice(start, start + itemsPerPage);

            if (groupedItems.length === 0) {
                desc += "*Your inventory is empty!*";
            } else {
                desc += "**Your Items:**\n\n" + currentItems.map((item, index) => {
                    return `**${start + index + 1}.** ${item.item_name} \`(x${item.count})\``;
                }).join('\n');
            }


            const embed = new EmbedBuilder()
                .setTitle(`${message.author.username}'s Profile & Inventory`)
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setDescription(desc)
                .setFooter({ text: `Page ${page + 1} of ${totalPages} | Total items: ${inventoryItems.length}` });

            const components = [];

            if (groupedItems.length > 0) {
                // Add Item Select Menu
                let selectOptions = currentItems.map((item, index) => ({
                    label: `${start + index + 1}. ${item.item_name}`,
                    value: `${item.item_id}_${item.item_name}`, // Use combined key to distinguish Damage Items
                    description: `Quantity: x${item.count}`
                }));
                selectOptions = applySelectMenuDefaults(selectOptions, selectedInventoryIds);

                const maxSelect = Math.min(3, currentItems.length);
                const selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('inv_select')
                        .setPlaceholder(`Select up to ${maxSelect} items...`)
                        .setMinValues(1)
                        .setMaxValues(maxSelect)
                        .addOptions(selectOptions)
                );
                components.push(selectRow);
            }


            // Add Interaction Buttons if items are selected
            if (selectedInventoryIds.length > 0) {
                // Verify all selected items still exist in inventory
                const selectedInvItems = groupedItems.filter(i => selectedInventoryIds.includes(`${i.item_id}_${i.item_name}`));
                
                if (selectedInvItems.length > 0) {
                    const btnRow = new ActionRowBuilder();
                    
                    if (selectedInvItems.length === 1) {
                        // Single item logic (Use / Equip / Unequip / Sell)
                        const selectedInvItem = selectedInvItems[0];
                        const itemData = allItems.get(selectedInvItem.item_id);
                        
                        if (itemData) {
                            const primaryType = Array.isArray(itemData.type) ? itemData.type[0] : itemData.type;
                            if (primaryType === 'consumable') {
                                btnRow.addComponents(new ButtonBuilder().setCustomId('inv_use').setLabel('Use').setStyle(ButtonStyle.Success));
                            } else if (primaryType === 'equippable') {
                                const equippedArr = userStats.equippedItemsArr || [];
                                const isEquipped = equippedArr.includes(selectedInvItem.item_id);
                                if (isEquipped) {
                                    btnRow.addComponents(new ButtonBuilder()
                                        .setCustomId('inv_unequip')
                                        .setLabel('Unequip')
                                        .setStyle(ButtonStyle.Secondary));
                                } else {
                                    btnRow.addComponents(new ButtonBuilder()
                                        .setCustomId('inv_equip')
                                        .setLabel('Equip')
                                        .setStyle(ButtonStyle.Primary));
                                }
                            }
                            if (itemData.is_sellable === true) {
                                btnRow.addComponents(new ButtonBuilder().setCustomId('inv_sell').setLabel('Sell').setStyle(ButtonStyle.Danger));
                            }
                        }
                    } else {
                        // Multiple item logic (Only Sell allowed if all are sellable)
                        let allSellable = true;
                        for (const invItem of selectedInvItems) {
                            const iData = allItems.get(invItem.item_id);
                            if (!iData || !iData.is_sellable) {
                                allSellable = false;
                                break;
                            }
                        }
                        
                        if (allSellable) {
                            btnRow.addComponents(new ButtonBuilder().setCustomId('inv_sell').setLabel(`Sell ${selectedInvItems.length} Items`).setStyle(ButtonStyle.Danger));
                        }
                    }

                    if (btnRow.components.length > 0) components.push(btnRow);
                } else {
                    selectedInventoryIds = []; // Items might have been consumed
                }
            }


            if (totalPages > 1) {
                components.push(getPaginationRow(page, totalPages));
            }

            return { embeds: [embed], components };
        };

        const response = await message.channel.send(await generateEmbedAndComponents(currentPage));

        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu!', ephemeral: true });

            if (i.isStringSelectMenu() && i.customId === 'inv_select') {
                selectedInventoryIds = i.values;
                await i.update(await generateEmbedAndComponents(currentPage));
                return;
            }

            if (i.isButton()) {
                if (['prev', 'next', 'first', 'last'].includes(i.customId)) {
                    switch (i.customId) {
                        case 'prev': currentPage--; break;
                        case 'next': currentPage++; break;
                        case 'first': currentPage = 0; break;
                        case 'last': currentPage = totalPages - 1; break;
                    }
                    selectedInventoryIds = []; // reset selection on page change
                    await i.update(await generateEmbedAndComponents(currentPage));
                    return;
                }

                if (i.customId === 'inv_sell') {
                    if (selectedInventoryIds.length === 0) return i.reply({ content: 'Select an item first!', ephemeral: true });
                    
                    await i.deferReply({ ephemeral: true });

                    if (selectedInventoryIds.length === 1) {
                        const itemData = allItems.get(selectedInventoryIds[0]);
                        if (!itemData) return i.editReply({ content: 'Invalid item data!' });
                        await executeSell(
                            i.user.id,
                            itemData,
                            1,
                            (content) => i.editReply(typeof content === 'string' ? { content } : content)
                        );
                    } else {
                        const { executeSellMultiple } = require('./sell');
                        const itemsToSell = selectedInventoryIds.map(id => ({ itemData: allItems.get(id), quantity: 1 })).filter(x => x.itemData);
                        await executeSellMultiple(
                            i.user.id,
                            itemsToSell,
                            (content) => i.editReply(typeof content === 'string' ? { content } : content)
                        );
                    }

                    selectedInventoryIds = [];
                    await response.edit(await generateEmbedAndComponents(currentPage));
                    return;
                }

                // ── Use / Equip / Unequip buttons ──
                if (i.customId === 'inv_use' || i.customId === 'inv_equip' || i.customId === 'inv_unequip') {
                    if (selectedInventoryIds.length !== 1) return i.reply({ content: 'Select exactly one item!', ephemeral: true });
                    
                    const selectedKey = selectedInventoryIds[0];
                    const [selectedInventoryId, selectedItemName] = selectedKey.split('_');
                    const rawInventory = await rpgmanager.getInventory(i.user.id);
                    const itemInstance = rawInventory.find(item => item.item_id.toString() === selectedInventoryId && item.item_name === selectedItemName);

                    if (!itemInstance) return i.reply({ content: 'Item not found in inventory!', ephemeral: true });

                    const itemData = allItems.get(selectedInventoryId);
                    if (!itemData) return i.reply({ content: 'Invalid item data!', ephemeral: true });

                    let userStats = await rpgmanager.getStats(i.user.id);

                    // Resolve primary type (supports both string and array)
                    const primaryType = Array.isArray(itemData.type) ? itemData.type[0] : itemData.type;

                    if (i.customId === 'inv_use' && primaryType === 'consumable') {
                        const fullStats = await getTotalStats(i.user.id);

                        let newHealth = userStats.health;
                        let newStamina = userStats.stamina;

                        if (itemData.effects.health) newHealth = Math.min(fullStats.maxHealth, newHealth + itemData.effects.health);
                        if (itemData.effects.stamina) newStamina = Math.min(fullStats.maxStamina, newStamina + itemData.effects.stamina);

                        await rpgmanager.updateStats(i.user.id, newHealth, newStamina);
                        await rpgmanager.removeItem(itemInstance.id);

                        selectedInventoryIds = [];
                        await i.reply({ content: `You used **${itemData.name}**!`, ephemeral: true });
                    } else if (i.customId === 'inv_equip' && primaryType === 'equippable') {
                        const res = await rpgmanager.equipItem(i.user.id, itemData.id);
                        if (res && res.changed === false && res.reason === 'limit') {
                            return i.reply({ content: 'You can only equip up to 3 items. Unequip one first.', ephemeral: true });
                        }
                        await i.reply({ content: `You equipped **${itemData.name}**!`, ephemeral: true });
                    } else if (i.customId === 'inv_unequip' && primaryType === 'equippable') {
                        const res = await rpgmanager.unequipItem(i.user.id, itemData.id);
                        if (res && res.changed) {
                            await i.reply({ content: `You unequipped **${itemData.name}**!`, ephemeral: true });
                        } else {
                            await i.reply({ content: `Item was not equipped.`, ephemeral: true });
                        }
                    }

                    await response.edit(await generateEmbedAndComponents(currentPage));
                }

            }
        });

        collector.on('end', () => {
            if (response.components) {
                const disabledComponents = response.components.map(actionRow => {
                    return new ActionRowBuilder().addComponents(
                        actionRow.components.map(component => {
                            if (component.type === ComponentType.Button) {
                                return ButtonBuilder.from(component).setDisabled(true);
                            }
                            if (component.type === ComponentType.StringSelect) {
                                return StringSelectMenuBuilder.from(component).setDisabled(true);
                            }
                            return component;
                        })
                    );
                });
                response.edit({ components: disabledComponents }).catch(() => { });
            }
        });
    }
};
