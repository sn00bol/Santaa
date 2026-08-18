const { EmbedBuilder } = require('discord.js');
const { allItemsCache } = require('../Utils/StatsCalculator');
const { CURRENCY_SYMBOL } = require('../Utils/config');
require('dotenv').config();

module.exports = {
    name: 'give',
    description: 'Give money or items to another user',
    category: ['eco', 'owner'],
    usage: 'Zgive `@user` `item/amount` [quantity]',
    async execute(message, args) {
        const { author, client } = message;
        const dbmanager = client.db;
        const rpgmanager = client.rpg;

        const isOwner = author.id === process.env.OWNER_ID;

        // 1. Check target user
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply(`Please mention a user to give money or items to. Example: '${this.usage}'`);
        }

        if (targetUser.id === author.id && !isOwner) {
            return message.reply("You cannot give money or items to yourself!");
        }

        if (targetUser.bot) {
            return message.reply("You cannot give money or items to a bot!");
        }

        // Filter out the user mention from the arguments to get item/amount
        const giveArgs = args.filter(arg => !/^<@!?\d+>$/.test(arg));
        if (giveArgs.length === 0) {
            return message.reply('Please specify an item or amount of money to give. Example: `Zgive @user <item/amount>`');
        }

        let isMoney = false;
        let isItem = false;
        let moneyAmount = 0;
        let itemData = null;
        let quantity = 1;

        // Helper to look up item by ID or Name (case-insensitive)
        const findItem = (query) => {
            const q = query.toLowerCase().trim();
            for (const [, item] of allItemsCache) {
                if (item.id?.toLowerCase() === q || item.name?.toLowerCase() === q) {
                    return item;
                }
            }
            return null;
        };

        // 1. Try parsing last argument as quantity (only if multiple args remain)
        if (giveArgs.length > 1) {
            const lastArg = giveArgs[giveArgs.length - 1];
            const parsedQty = parseInt(lastArg);
            if (!isNaN(parsedQty) && parsedQty > 0 && /^\d+$/.test(lastArg)) {
                const itemQuery = giveArgs.slice(0, -1).join(' ');
                const found = findItem(itemQuery);
                if (found) {
                    itemData = found;
                    quantity = parsedQty;
                    isItem = true;
                }
            }
        }

        // 2. Try parsing the whole remaining args as item (quantity = 1)
        if (!isItem) {
            const itemQuery = giveArgs.join(' ');
            const found = findItem(itemQuery);
            if (found) {
                itemData = found;
                quantity = 1;
                isItem = true;
            }
        }

        // 3. Try parsing the whole remaining args as money amount
        if (!isItem) {
            const moneyQuery = giveArgs.join(' ').toLowerCase().trim();
            const cleanedStr = moneyQuery.replace(/k/g, '000').replace(/,/g, '');
            const parsedAmount = parseInt(cleanedStr);
            if (!isNaN(parsedAmount) && parsedAmount > 0 && /^\d+$/.test(cleanedStr)) {
                moneyAmount = parsedAmount;
                isMoney = true;
            }
        }

        // If neither matched, report incorrect usage
        if (!isMoney && !isItem) {
            return message.reply(`Could not find item or parse amount: **"${giveArgs.join(' ')}"**.\nUsage: \`Zgive @user <amount/item name> [quantity]\``);
        }

        try {
            if (isMoney) {
                if (!isOwner) {
                    const senderData = await dbmanager.getUser(author.id);
                    if (senderData.balance < moneyAmount) {
                        return message.reply(`You do not have enough money to give. (Balance: **${senderData.balance.toLocaleString()}${CURRENCY_SYMBOL}**, Required: **${moneyAmount.toLocaleString()}${CURRENCY_SYMBOL}**)`);
                    }
                    // Deduct from sender
                    await dbmanager.removeMoney(author.id, moneyAmount);
                }

                // Add to target
                await dbmanager.addMoney(targetUser.id, moneyAmount);

                const embed = new EmbedBuilder()
                    .setTitle('💸 Money Transferred!')
                    .setDescription(`Successfully gave **${moneyAmount.toLocaleString()}${CURRENCY_SYMBOL}** to ${targetUser}.\n${isOwner ? '*(Spawned by Owner)*' : `Your remaining balance: **${(await dbmanager.getUser(author.id)).balance.toLocaleString()}${CURRENCY_SYMBOL}**`}`)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                return message.channel.send({ embeds: [embed] });
            }

            if (isItem) {
                if (!isOwner) {
                    const senderInventory = await rpgmanager.getInventory(author.id);
                    const matchingItems = senderInventory.filter(inv => inv.item_id === itemData.id);
                    if (matchingItems.length < quantity) {
                        return message.reply(`You do not have enough **${itemData.name}** to give. (You have: **x${matchingItems.length}**, Required: **x${quantity}**)`);
                    }

                    // Unequip item for sender if they are giving it away and it's currently equipped
                    const senderStats = await rpgmanager.getStats(author.id);
                    let equippedArr = [];
                    try { equippedArr = JSON.parse(senderStats.equipped_items || '[]'); } catch (e) { }
                    if (senderStats.equipped_item_id) equippedArr.push(senderStats.equipped_item_id);

                    if (equippedArr.includes(itemData.id)) {
                        await rpgmanager.unequipItem(author.id, itemData.id);
                    }

                    // Transfer items
                    const itemsToTransfer = matchingItems.slice(0, quantity);
                    for (const item of itemsToTransfer) {
                        await rpgmanager.transferItem(item.id, targetUser.id);
                    }
                } else {
                    // Owner spawns the items directly
                    for (let i = 0; i < quantity; i++) {
                        await rpgmanager.addItem(targetUser.id, itemData.id, itemData.name);
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle('🎁 Items Sent!')
                    .setDescription(`Successfully gave **x${quantity} ${itemData.name}** to ${targetUser}.\n${isOwner ? '*(owner using this cheat code to give)*' : ''}`)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                return message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error occurred in give command:', error);
            return message.reply('An error occurred while processing the transaction');
        }
    }
};
