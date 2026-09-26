# Discord.js Embed Guide

### Basic Embed Structure
Discord.js provides the `EmbedBuilder` class to create rich embeds for your bot messages:

```js
const { EmbedBuilder } = require('discord.js');

const basicEmbed = new EmbedBuilder()
  .setTitle('Title Here')
  .setDescription('Description text here')
  .setColor('#0099ff') // Hex color code
  .setTimestamp()
  .setFooter({ text: 'Footer text' });

message.channel.send({ embeds: [basicEmbed] });
```

### Common Embed Methods

**Set Author with User Info:**
```js
const embed = new EmbedBuilder()
  .setAuthor({
    name: message.author.username,
    iconURL: message.author.displayAvatarURL()
  });
```

**Add Fields:**
```js
const embed = new EmbedBuilder()
  .addFields(
    { name: 'Field 1', value: 'Value 1', inline: true },
    { name: 'Field 2', value: 'Value 2', inline: true },
    { name: 'Field 3', value: 'Value 3', inline: false }
  );
```

**Set Thumbnail and Image:**
```js
const embed = new EmbedBuilder()
  .setThumbnail('https://example.com/thumbnail.png')
  .setImage('https://example.com/image.png');
```

**Conditional Styling:**
```js
const successEmbed = new EmbedBuilder()
  .setColor('#00ff00') // Green for success
  .setDescription('Operation completed successfully!');

const errorEmbed = new EmbedBuilder()
  .setColor('#ff0000') // Red for errors
  .setDescription('An error occurred!');
```

### Advanced Embed Features

**Dynamic Fields from Database:**
```js
const userData = await dbManager.getUser(userId);
const embed = new EmbedBuilder()
  .setTitle('User Profile')
  .addFields(
    { name: 'Balance', value: `${userData.balance}${CURRENCY_EMOJI}`, inline: true },
    { name: 'Bank', value: `${userData.bank}${CURRENCY_EMOJI}`, inline: true },
    { name: 'Level', value: userData.level.toString(), inline: true }
  );
```

**Conditional Embed Creation:**
```js
function createStatusEmbed(status, message) {
  const colors = {
    success: '#00ff00',
    error: '#ff0000',
    warning: '#ffaa00',
    info: '#0099ff'
  };

  return new EmbedBuilder()
    .setColor(colors[status] || colors.info)
    .setDescription(message)
    .setTimestamp();
}

// Usage
const embed = createStatusEmbed('success', 'Money added successfully!');
```

### Interactive Components with Embeds

**Buttons with Embeds:**
```js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const row = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_button')
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('cancel_button')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

const embed = new EmbedBuilder()
  .setTitle('Confirmation Required')
  .setDescription('Please confirm your action');

message.channel.send({ embeds: [embed], components: [row] });
```

**Select Menus with Embeds:**
```js
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const menu = new ActionRowBuilder()
  .addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('category_select')
      .setPlaceholder('Select a category')
      .addOptions([
        { label: 'Economy', value: 'economy' },
        { label: 'Utilities', value: 'utilities' },
        { label: 'Fun', value: 'fun' }
      ])
  );

const embed = new EmbedBuilder()
  .setTitle('Category Selection')
  .setDescription('Choose a category to view commands');

message.channel.send({ embeds: [embed], components: [menu] });
```

### Database Integration with Embeds

**Displaying User Data:**
```js
async function showUserProfile(message, userId) {
  const userData = await dbManager.getUser(userId);
  const inventory = await rpgmanager.getInventory(userId);

  const embed = new EmbedBuilder()
    .setAuthor({
      name: message.author.username,
      iconURL: message.author.displayAvatarURL()
    })
    .setTitle('User Profile')
    .addFields(
      { name: 'Balance', value: `${userData.balance}${CURRENCY_EMOJI}`, inline: true },
      { name: 'Bank', value: `${userData.bank}${CURRENCY_EMOJI}`, inline: true },
      { name: 'Total Assets', value: `${Number(userData.balance) + Number(userData.bank)}${CURRENCY_EMOJI}`, inline: false },
      { name: 'Inventory Items', value: inventory.length.toString(), inline: true }
    )
    .setTimestamp();

  return embed;
}
```

**Pagination with Embeds:**
```js
async function showPaginatedList(message, items, pageSize = 5) {
  let currentPage = 0;
  const totalPages = Math.ceil(items.length / pageSize);

  const generateEmbed = (page) => {
    const start = page * pageSize;
    const end = start + pageSize;
    const pageItems = items.slice(start, end);

    return new EmbedBuilder()
      .setTitle(`Items List (Page ${page + 1}/${totalPages})`)
      .setDescription(pageItems.map((item, i) => 
        `${start + i + 1}. ${item.name} - ${item.description}`
      ).join('\n'))
      .setTimestamp();
  };

  const response = await message.channel.send({ embeds: [generateEmbed(currentPage)] });
  // Add pagination buttons and collector logic here
}
```