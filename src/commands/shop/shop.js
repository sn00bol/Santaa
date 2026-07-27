const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
require('dotenv').config();
const { getMenuRow } = require('../Utils/NavigateManager');
const fs = require('fs');
const path = require('path');
const dbmanager = require('../../../database/dbmanager');
const rpgmanager = require('../../../database/rpgmanager');
const { CURRENCY_EMOJI } = require('../../commands/Utils/config');

module.exports = {
    name: 'shop',
    description: 'Shopping stuff at Gepora Online Store or Kimori\'s Food Shop',
    category: 'gnr',
    usage: 'Zshop',
    async execute(message, args) {
        // Main shop selection embed
        const mainEmbed = new EmbedBuilder()
            .setTitle('**Welcome to the Market!**')
            .setDescription('Please select which shop you want to visit.')

        // Buttons to select shop
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('shop_gepora')
                .setLabel('Gepora Online Store')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('shop_kimori')
                .setLabel('Kimori Food Shop')
                .setStyle(ButtonStyle.Secondary)
        );

        const response = await message.channel.send({ embeds: [mainEmbed], components: [row] });
        const collector = response.createMessageComponentCollector({ time: 60000 });

        const resolveShopItemsPath = (shopType) => {
            const candidates = [
                path.join(__dirname, '..', '..', 'items', 'shopItems', shopType),
                path.join(__dirname, 'shopUtils', shopType)
            ];
            return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
        };

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu!', ephemeral: true });

            if (i.isButton()) {
                if (i.customId.startsWith('buy_')) {
                    const itemId = i.customId.split('_')[1];
                    const item = response.shopItems?.get(itemId);
                    if (!item) return i.reply({ content: 'Item not found!', ephemeral: true });

                    const userDb = await dbmanager.getUser(i.user.id);
                    if (response.shopType === 'gepora') { // change this to your custom gepora shop folder in shoputils
                        if (userDb.bank < item.cost) {
                            return i.reply({ content: `You do not have enough ${CURRENCY_EMOJI} bank money to buy this!`, ephemeral: true });
                        }
                        await dbmanager.removeBank(i.user.id, item.cost);
                    } else if (response.shopType === 'kimori') { // change this to your custom food shop folder in shoputils
                        if (userDb.balance < item.cost) {
                            return i.reply({ content: `You do not have enough ${CURRENCY_EMOJI} money to buy this!`, ephemeral: true });
                        }
                        await dbmanager.removeMoney(i.user.id, item.cost);
                    }

                    await rpgmanager.addItem(i.user.id, item.id, item.name);
                    return i.reply({ content: `Successfully bought **${item.name}** for ${item.cost}  ${response.currencyEmoji}!`, ephemeral: true });
                }

                let shopType = '';
                let shopTitle = '';
                let shopDesc = '';
                let currencyName = '';
                let currencyEmoji = '';

                if (i.customId === 'shop_gepora') { // change this to your custom gepora shop folder in shoputils
                    shopType = 'gepora';
                    shopTitle = '**Gepora Online Store**';
                    shopDesc = `Welcome to Gepora Online Store! We sell a variety of items (except food). Uses ${CURRENCY_EMOJI} (bank) as currency.`;
                    currencyName = '🪙';
                    currencyEmoji = CURRENCY_EMOJI;
                } else if (i.customId === 'shop_kimori') {
                    shopType = 'kimori';
                    shopTitle = '**Kimori Food Shop**';
                    shopDesc = `Welcome to the Food shop! Uses ${CURRENCY_EMOJI} (your wallet) as currency.`;
                    currencyName = '🪙';
                    currencyEmoji = CURRENCY_EMOJI;
                } else {
                    return;
                }

                // Load items from items/shopItems/[shopType]
                const shopItemsPath = resolveShopItemsPath(shopType);
                let itemFiles = [];
                try {
                    itemFiles = fs.readdirSync(shopItemsPath).filter(file => file.endsWith('.js'));
                } catch (err) {
                    console.error(err);
                }

                const shopItems = new Map();
                const shopOptions = [
                    { label: 'Go Back', value: 'back', description: 'Return to main menu' }
                ];

                const shopItemEntries = [];
                for (const file of itemFiles) {
                    const item = require(path.join(shopItemsPath, file));
                    shopItems.set(item.id, item);
                    shopItemEntries.push(item);
                }

                const sortedShopItems = shopItemEntries
                    .sort((a, b) => {
                        const priceA = Number(a.cost) || 0;
                        const priceB = Number(b.cost) || 0;
                        if (priceA !== priceB) return priceA - priceB;
                        return String(a.name).localeCompare(String(b.name));
                    })
                    .map(item => ({
                        label: item.name,
                        value: item.id,
                        description: `Cost: ${item.cost} ${currencyName}`
                    }));

                shopOptions.push(...sortedShopItems);

                const shopEmbed = new EmbedBuilder()
                    .setTitle(shopTitle)
                    .setDescription(shopDesc);

                let menuRow;
                if (shopOptions.length > 1) {
                    // There are items
                    menuRow = getMenuRow('shop_slt', shopOptions);
                } else {
                    // No items, create a dummy disabled menu or just a "Go Back" option
                    const menu = new StringSelectMenuBuilder()
                        .setCustomId('shop_slt')
                        .setPlaceholder('No items available currently')
                        .addOptions(shopOptions);
                    menuRow = new ActionRowBuilder().addComponents(menu);
                }

                await i.update({ embeds: [shopEmbed], components: [menuRow] });

                // Attach shopType to message for the select menu to know what currency it is using
                response.shopType = shopType;
                response.shopItems = shopItems;
                response.currencyEmoji = currencyEmoji;
                response.shopEmbed = shopEmbed;
                response.menuRow = menuRow;
            }

            if (i.isStringSelectMenu()) {
                const selectedItemId = i.values[0];

                if (selectedItemId === 'back') {
                    // Go back to main shop selection
                    await i.update({ embeds: [mainEmbed], components: [row] });
                    return;
                }

                const item = response.shopItems?.get(selectedItemId);
                if (!item) {
                    return i.reply({ content: 'Item not found!', ephemeral: true });
                }

                // Item info embed
                const itemEmbed = new EmbedBuilder()
                    .setTitle(`🛒 ${item.name}`)
                    .setDescription(item.desc)
                    .addFields(
                        { name: 'Cost', value: `${item.cost} ${response.currencyEmoji}`, inline: true },
                        { name: 'ID', value: `\`${item.id}\``, inline: true }
                    )

                const buyRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`buy_${item.id}`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('💸')
                );

                await i.update({ embeds: [itemEmbed], components: [response.menuRow, buyRow] });
            }
        });

        collector.on('end', () => {
            // Disable components
            if (response.components) {
                const disabledComponents = response.components.map(actionRow => {
                    return new ActionRowBuilder().addComponents(
                        actionRow.components.map(component => {
                            if (component.type === ComponentType.Button) {
                                return ButtonBuilder.from(component).setDisabled(true);
                            } else if (component.type === ComponentType.StringSelect) {
                                return StringSelectMenuBuilder.from(component).setDisabled(true);
                            }
                            return component;
                        })
                    );
                });
                response.edit({ components: disabledComponents }).catch(() => { });
            }
        });
    },
};