const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const rpgmanager = require('../../../database/rpgmanager');
const dbmanager = require('../../../database/dbmanager');
const { allItemsCache } = require('../Utils/StatsCalculator');

async function sellItemsCore(userId, itemsToSell) {
    let totalEarned = 0;
    const soldItems = [];
    const inventory = await rpgmanager.getInventory(userId);
    let inventoryMap = {}; 
    inventory.forEach(inv => {
        if (!inventoryMap[inv.item_id]) inventoryMap[inv.item_id] = [];
        inventoryMap[inv.item_id].push(inv);
    });

    const userStats = await rpgmanager.getStats(userId);
    let equippedArr = [];
    try { equippedArr = JSON.parse(userStats.equipped_items || '[]'); } catch (e) { }

    let equippedChanged = false;
    for (const { itemData, quantity } of itemsToSell) {
        if (!itemData.is_sellable || (itemData.sell ?? 0) <= 0) continue;
        
        const matchingItems = inventoryMap[itemData.id] || [];
        if (matchingItems.length < quantity) continue;
        
        const isEquipped = equippedArr.includes(itemData.id);
        if (isEquipped) {
            await rpgmanager.unequipItem(userId, itemData.id);
            equippedArr = equippedArr.filter(id => id !== itemData.id);
            equippedChanged = true;
        }

        const toRemove = matchingItems.slice(0, quantity);
        for (const inv of toRemove) await rpgmanager.removeItem(inv.id);
        
        inventoryMap[itemData.id] = matchingItems.slice(quantity);

        const earned = itemData.sell * quantity;
        totalEarned += earned;
        soldItems.push({ itemId: itemData.id, name: itemData.name, quantity, earned });
    }

    if (totalEarned > 0) {
        await dbmanager.addMoney(userId, totalEarned, { trackEarning: true });

        const totalItemsSold = soldItems.reduce((acc, item) => acc + item.quantity, 0);
        const stats = await rpgmanager.getStats(userId);
        const newItemsSold = (stats.items_sold || 0) + totalItemsSold;
        await rpgmanager.updateProgress(userId, { items_sold: newItemsSold });
        stats.items_sold = newItemsSold;
        const achievementChecker = require('../../minigames/achievement/achievementChecker');
        achievementChecker.checkEconomy(userId, stats, 'sell').catch(console.error);
    }

    return { totalEarned, soldItems, equippedChanged };
}

async function executeSellMultiple(userId, itemsToSell, replyFn) {
    const result = await sellItemsCore(userId, itemsToSell);
    if (result.soldItems.length === 0) {
        return replyFn({ content: "No items could be sold." });
    }

    const soldLines = result.soldItems.map(item => `**${item.name}** \`x${item.quantity}\` ($${item.earned.toLocaleString()})`);
    const userDb = await dbmanager.getUser(userId);

    const embed = new EmbedBuilder()
        .setTitle('Bulk Sale Successful!')
        .setColor(0x57F287)
        .setDescription(soldLines.join('\n'))
        .addFields(
            { name: 'Total Earned', value: `**$${result.totalEarned.toLocaleString()}**`, inline: true },
            { name: 'Your Balance', value: `$${userDb.balance.toLocaleString()}`, inline: true }
        )
        .setTimestamp();

    await replyFn({ embeds: [embed] });
    return true;
}

/**
 * @param {string}   userId    Discord user ID
 * @param {object}   itemData  Item definition from allItemsCache
 * @param {number}   quantity  Number of items to sell
 * @param {Function} replyFn   Async fn(content | { embeds }) to send a response
 * @returns {boolean}          true if sale completed, false on error
 */
async function executeSell(userId, itemData, quantity, replyFn) {
    // Guard: is_sellable
    if (!itemData.is_sellable) {
        await replyFn(`**${itemData.name}** is unsellable!`);
        return false;
    }

    // Guard: sell price
    const unitPrice = itemData.sell ?? 0;
    if (unitPrice <= 0) {
        await replyFn(`**${itemData.name}** is worthless, can't sell it.`);
        return false;
    }

    // Get inventory and find matching stack
    const inventory = await rpgmanager.getInventory(userId);
    const matchingItems = inventory.filter(inv => inv.item_id === itemData.id);

    if (matchingItems.length === 0) {
        await replyFn(`You don't have **${itemData.name}** in your inventory.`);
        return false;
    }

    if (matchingItems.length < quantity) {
        await replyFn(`You only have **${matchingItems.length}x ${itemData.name}**, not enough to sell **${quantity}**.`);
        return false;
    }

    const result = await sellItemsCore(userId, [{ itemData, quantity }]);
    if (result.soldItems.length === 0) {
        await replyFn("Failed to sell item.");
        return false;
    }

    // Build result embed
    const userDb = await dbmanager.getUser(userId);

    const embed = new EmbedBuilder()
        .setTitle('Successfully sold an item!')
        .setColor(0x57F287)
        .addFields(
            { name: 'Item', value: `**${itemData.name}** x${quantity}`, inline: true },
            { name: 'Unit Price', value: `$${unitPrice.toLocaleString()}`, inline: true },
            { name: 'Total Earned', value: `**$${result.totalEarned.toLocaleString()}**`, inline: true },
            { name: 'Your Balance', value: `$${userDb.balance.toLocaleString()}`, inline: false },
        )
        .setFooter({ text: result.equippedChanged ? 'Item was unequipped before selling.' : `Remaining in inventory: ${matchingItems.length - quantity}x ${itemData.name}` })
        .setTimestamp();

    await replyFn({ embeds: [embed] });
    return true;
}

module.exports = {
    name: 'sell',
    description: 'Sell items from your inventory for money',
    category: 'eco',
    usage: 'Zsell `item name or id` `quantity` (or Zsell `all` to sell all sellable items)',

    executeSell, // re-exported for use by inventory.js sell button
    executeSellMultiple, // export bulk sell
    sellItemsCore, // export core sell logic

    async execute(message, args) {
        if (!args || args.length === 0) {
            return message.reply('Usage: `Zsell `item name or id` `quantity` or `Zsell all`');
        }

        const isSellAll = args[0].toLowerCase() === 'all';
        if (isSellAll) {
            const inventory = await rpgmanager.getInventory(message.author.id);
            const counts = {};
            inventory.forEach(inv => {
                if (!counts[inv.item_id]) counts[inv.item_id] = 1;
                else counts[inv.item_id]++;
            });
            
            const sellableItems = [];
            for (const itemId of Object.keys(counts)) {
                const itemData = allItemsCache.get(itemId);
                if (itemData && itemData.is_sellable && (itemData.sell ?? 0) > 0) {
                    sellableItems.push({ itemData, quantity: counts[itemId] });
                }
            }

            if (sellableItems.length === 0) {
                return message.reply("You have no sellable items in your inventory.");
            }

            const options = sellableItems.slice(0, 25).map((sellable) => ({
                label: sellable.itemData.name,
                value: sellable.itemData.id,
                description: `Quantity: ${sellable.quantity} (Total Value: $${sellable.itemData.sell * sellable.quantity})`
            }));

            const selectRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('sell_all_exclude')
                    .setPlaceholder('Select items to EXCLUDE from selling')
                    .setMinValues(0)
                    .setMaxValues(options.length)
                    .addOptions(options)
            );

            const btnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_sell_all').setLabel('Confirm Sell All').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_sell_all').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );

            const embed = new EmbedBuilder()
                .setTitle('Sell All')
                .setDescription(`You are about to sell all your sellable items.\nIf you want to **keep** certain items, select them in the menu below to exclude them from being sold.`)
                .setColor('Yellow');

            const response = await message.channel.send({ embeds: [embed], components: [selectRow, btnRow] });
            const collector = response.createMessageComponentCollector({ time: 60000 });
            
            let excludedIds = [];

            collector.on('collect', async (i) => {
                if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu!', ephemeral: true });

                if (i.isStringSelectMenu() && i.customId === 'sell_all_exclude') {
                    excludedIds = i.values;
                    const updatedOptions = options.map(opt => ({
                        ...opt,
                        default: excludedIds.includes(opt.value)
                    }));
                    const updatedSelectRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('sell_all_exclude')
                            .setPlaceholder('Select items to EXCLUDE from selling')
                            .setMinValues(0)
                            .setMaxValues(options.length)
                            .addOptions(updatedOptions)
                    );
                    await i.update({ components: [updatedSelectRow, btnRow] });
                } else if (i.isButton()) {
                    if (i.customId === 'cancel_sell_all') {
                        collector.stop('cancelled');
                        return i.update({ content: 'Sale cancelled.', embeds: [], components: [] });
                    } else if (i.customId === 'confirm_sell_all') {
                        collector.stop('confirmed');
                        await i.deferUpdate();
                        
                        const itemsToSell = sellableItems.filter(s => !excludedIds.includes(s.itemData.id));
                        if (itemsToSell.length === 0) {
                            return i.editReply({ content: 'No items left to sell after exclusions.', embeds: [], components: [] });
                        }
                        await executeSellMultiple(message.author.id, itemsToSell, (payload) => i.editReply(typeof payload === 'string' ? { content: payload, embeds: [], components: [] } : { ...payload, components: [] }));
                    }
                }
            });

            collector.on('end', (_, reason) => {
                if (reason === 'time') {
                    response.edit({ content: 'Sell session timed out.', embeds: [], components: [] }).catch(() => {});
                }
            });

            return;
        }

        // Parse quantity — last arg if it's a number, else default 1
        let quantity = 1;
        let itemQuery;

        const lastArg = args[args.length - 1];
        if (!isNaN(lastArg) && parseInt(lastArg) > 0) {
            quantity = parseInt(lastArg);
            itemQuery = args.slice(0, -1).join(' ').toLowerCase().trim();
        } else {
            itemQuery = args.join(' ').toLowerCase().trim();
        }

        if (!itemQuery) {
            return message.reply('Usage: `Zsell <item name or id> <quantity>`');
        }

        // Find item definition by name or id (case-insensitive)
        let itemData = null;
        for (const [, item] of allItemsCache) {
            if (item.id?.toLowerCase() === itemQuery || item.name?.toLowerCase() === itemQuery) {
                itemData = item;
                break;
            }
        }

        if (!itemData) {
            return message.reply(`Item **"${itemQuery}"** not found. Check the name and try again.`);
        }

        await executeSell(message.author.id, itemData, quantity, (content) => message.reply(content));
    }
};
