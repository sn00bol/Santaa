const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getTotalStats } = require('../Utils/StatsCalculator');
const formatNumber = require('../Utils/formatNumber');
const rpgmanager = require('../../../database/rpgmanager');

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

async function loadUserAvatar(user, size = 256) {
  const avatarUrls = [];
  try {
    if (typeof user.avatarURL === 'function') avatarUrls.push(user.avatarURL({ extension: 'webp', size }));
  } catch { }
  try {
    if (typeof user.displayAvatarURL === 'function') avatarUrls.push(user.displayAvatarURL({ extension: 'png', size }));
  } catch { }
  if (user.defaultAvatarURL) avatarUrls.push(user.defaultAvatarURL);

  for (const avatarUrl of [...new Set(avatarUrls.filter(Boolean))]) {
    try {
      return await loadImage(avatarUrl);
    } catch (error) {
      console.warn('Unable to load user avatar; using placeholder:', error.message);
    }
  }
  return null;
}

async function generateLevelCard(user, stats, displayName = user.globalName || user.username, rank = null) {
  const canvas = createCanvas(1000, 320);
  const ctx = canvas.getContext('2d');
  const avatarImage = await loadUserAvatar(user);

  ctx.fillStyle = '#050505';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 22, true, false);
  if (avatarImage) {
    const scale = Math.max(canvas.width / avatarImage.width, canvas.height / avatarImage.height);
    const wallpaperWidth = avatarImage.width * scale;
    const wallpaperHeight = avatarImage.height * scale;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 22, true, false);
    ctx.clip();
    ctx.globalAlpha = 0.42;
    ctx.drawImage(avatarImage, (canvas.width - wallpaperWidth) / 2, (canvas.height - wallpaperHeight) / 2, wallpaperWidth, wallpaperHeight);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(70, 70, 70, 0.78)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(38, 38, 38, 0.88)';
  roundRect(ctx, 18, 18, canvas.width - 36, canvas.height - 36, 18, true, false);

  const avatarX = 42;
  const avatarY = 40;
  const avatarWidth = 232;
  const avatarHeight = 240;
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, avatarX, avatarY, avatarWidth, avatarHeight, 12, true, false);
  ctx.clip();
  if (avatarImage) {
    const scale = Math.max(avatarWidth / avatarImage.width, avatarHeight / avatarImage.height);
    const imageWidth = avatarImage.width * scale;
    const imageHeight = avatarImage.height * scale;
    ctx.drawImage(avatarImage, avatarX + (avatarWidth - imageWidth) / 2, avatarY + (avatarHeight - imageHeight) / 2, imageWidth, imageHeight);
  } else {
    ctx.fillStyle = '#555555';
    ctx.fillRect(avatarX, avatarY, avatarWidth, avatarHeight);
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(220, 220, 220, 0.55)';
  ctx.lineWidth = 2;
  roundRect(ctx, avatarX, avatarY, avatarWidth, avatarHeight, 12, false, true);

  const contentX = 310;
  const contentWidth = 640;
  const level = Math.max(1, Number(stats.level) || 1);
  const currentExp = Math.max(0, Number(stats.exp) || 0);
  const expRequired = level * 100;
  const progress = Math.min(currentExp / expRequired, 1);
  const rankText = rank == null ? '—' : `#${formatNumber(rank)}`;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#F2F2F2';
  let nameFontSize = 56;
  ctx.font = `bold ${nameFontSize}px sans-serif`;
  while (ctx.measureText(displayName).width > contentWidth && nameFontSize > 24) {
    nameFontSize -= 1;
    ctx.font = `bold ${nameFontSize}px sans-serif`;
  }
  ctx.fillText(displayName, contentX, 98, contentWidth);

  ctx.fillStyle = '#BDBDBD';
  ctx.font = '28px sans-serif';
  ctx.fillText('A random person has appeared!', contentX, 139);

  const levelLabelX = contentX;
  const levelLabelY = 264;
  ctx.fillStyle = '#D0D0D0';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText('LVL', levelLabelX, levelLabelY);

  const levelNumberX = levelLabelX + ctx.measureText('LVL').width + 12;
  const barX = 510;
  const availableLevelWidth = barX - levelNumberX - 14;
  let levelFontSize = 62;
  ctx.fillStyle = '#F2F2F2';
  ctx.font = `bold ${levelFontSize}px sans-serif`;
  while (ctx.measureText(formatNumber(level)).width > availableLevelWidth && levelFontSize > 24) {
    levelFontSize -= 1;
    ctx.font = `bold ${levelFontSize}px sans-serif`;
  }
  ctx.fillText(formatNumber(level), levelNumberX, levelLabelY);

  const barY = 225;
  const barWidth = 440;
  const barHeight = 30;
  ctx.fillStyle = '#D0D0D0';
  ctx.font = '19px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Rank: ${rankText}`, barX, 204);
  ctx.textAlign = 'right';
  ctx.fillText(`EXP: ${formatNumber(currentExp)}/${formatNumber(expRequired)}`, barX + barWidth, 204);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#111111';
  roundRect(ctx, barX, barY, barWidth, barHeight, 12, true, false);
  ctx.strokeStyle = '#8D8D8D';
  ctx.lineWidth = 2;
  roundRect(ctx, barX, barY, barWidth, barHeight, 12, false, true);
  if (progress > 0) {
    ctx.fillStyle = '#E0E0E0';
    roundRect(ctx, barX, barY, Math.max(progress * barWidth, barHeight), barHeight, 12, true, false);
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  name: 'level',
  deferReply: true,
  aliases: ['lvl'],
  description: 'Check your or another user\'s level',
  category: 'utl',
  usage: 'Zlevel `@user`',
  args: [
    { name: 'target', description: 'The user whose level to view', type: 'user', required: false },
  ],
  async execute(message, args) {
    const targetUser = message.mentions.users.first() || message.author;
    const targetMember = message.mentions.members?.find(member => member.id === targetUser.id)
      || (message.member?.id === targetUser.id ? message.member : null)
      || (message.guild ? await message.guild.members.fetch(targetUser.id).catch(() => null) : null);
    const stats = await getTotalStats(targetUser.id);
    const rank = await rpgmanager.getLevelRank(targetUser.id);
    const displayName = targetMember?.displayName || targetUser.globalName || targetUser.username;

    try {
      const imageBuffer = await generateLevelCard(targetUser, stats, displayName, rank);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'level.png' });
      return message.reply({ files: [attachment] });
    } catch (error) {
      console.error('Error generating level card:', error);
      return message.reply('Failed to generate level card.');
    }
  },
};

module.exports.generateLevelCard = generateLevelCard;
