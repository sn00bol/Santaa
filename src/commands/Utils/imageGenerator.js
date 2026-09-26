const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { CURRENCY_EMOJI } = require('./config');
const formatNumber = require('./formatNumber');

// Colors
const bgColor = '#1E1E2E';
const cardColor = '#313244';
const textColor = '#CDD6F4';
const subTextColor = '#A6ADC8';
const accentColor = '#89B4FA'; // Blue for EXP bar
const successColor = '#A6E3A1'; // Green for wins/attack
const dangerColor = '#F38BA8'; // Red for losses/defense

/**
 * Draw a rounded rectangle on a canvas context
 */
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  if (typeof radius === 'undefined') {
    radius = 5;
  }
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
  if (fill) {
    ctx.fill();
  }
  if (stroke) {
    ctx.stroke();
  }
}

async function loadUserAvatar(user, size = 256) {
  const avatarUrls = [];
  try {
    if (typeof user.avatarURL === 'function') {
      avatarUrls.push(user.avatarURL({ extension: 'webp', size }));
    }
  } catch (_) {}
  try {
    if (typeof user.displayAvatarURL === 'function') {
      avatarUrls.push(user.displayAvatarURL({ extension: 'png', size }));
    }
  } catch (_) {}
  if (user.defaultAvatarURL) avatarUrls.push(user.defaultAvatarURL);

  let lastError;
  for (const avatarUrl of [...new Set(avatarUrls.filter(Boolean))]) {
    try {
      return await loadImage(avatarUrl);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) console.warn('Unable to load user avatar; using placeholder:', lastError.message);
  return null;
}

/**
 * Generate a visual Level Card for a user
 * @param {Object} user Discord User object
 * @param {Object} stats Stats object containing level and exp
 * @param {String} displayName Preferred display name for the user
 * @param {Number} rank Global level rank
 * @returns {Buffer} Image Buffer
 */
async function generateLevelCard(user, stats, displayName = user.globalName || user.username, rank = null) {
  const canvas = createCanvas(1000, 320);
  const ctx = canvas.getContext('2d');

  const avatarImage = await loadUserAvatar(user);

  // Black wallpaper, avatar image, and gray overlay create a muted background.
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
    ctx.drawImage(
      avatarImage,
      (canvas.width - wallpaperWidth) / 2,
      (canvas.height - wallpaperHeight) / 2,
      wallpaperWidth,
      wallpaperHeight
    );
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(70, 70, 70, 0.78)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Gray foreground overlay keeps the wallpaper subdued behind the content.
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
    ctx.drawImage(
      avatarImage,
      avatarX + (avatarWidth - imageWidth) / 2,
      avatarY + (avatarHeight - imageHeight) / 2,
      imageWidth,
      imageHeight
    );
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

/**
 * Generate a visual Leaderboard
 * @param {String} title The title of the leaderboard
 * @param {Array} rows The formatted rows data (objects with { rank, name, value })
 * @param {Number} page Current page number (0-indexed)
 * @param {Number} totalPages Total pages available
 * @returns {Buffer} Image Buffer
 */
async function generateLeaderboardImage(title, rows, page, totalPages) {
  const canvasWidth = 800;
  // Dynamic height based on number of rows (title + 5 rows max usually + footer)
  const rowHeight = 70;
  const paddingY = 120;
  const canvasHeight = Math.max(300, (rows.length * rowHeight) + paddingY);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 20, true, false);

  // Title
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvasWidth / 2, 60);

  // Header separator
  ctx.fillStyle = cardColor;
  ctx.fillRect(50, 80, canvasWidth - 100, 3);

  // Reset align
  ctx.textAlign = 'left';

  // Draw Rows
  let startY = 100;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const yPos = startY + (i * rowHeight);

    // Row Background (alternating)
    if (i % 2 === 0) {
      ctx.fillStyle = cardColor;
      roundRect(ctx, 40, yPos, canvasWidth - 80, rowHeight - 10, 10, true, false);
    }

    // Rank Number
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`#${formatNumber(row.rank)}`, 60, yPos + 40);

    // Name
    ctx.fillStyle = textColor;
    ctx.font = '24px sans-serif';
    ctx.fillText(row.name, 150, yPos + 38);

    // Value
    ctx.fillStyle = successColor;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatNumber(row.value), canvasWidth - 60, yPos + 40);
    ctx.textAlign = 'left';
  }

  // Footer (Pagination)
  const footerY = canvasHeight - 20;
  ctx.fillStyle = subTextColor;
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Page ${formatNumber(page + 1)} of ${formatNumber(totalPages)}`, canvasWidth / 2, footerY);

  return canvas.toBuffer('image/png');
}

/**
 * Generate a Balance Card image
 * @param {String} displayName  The user's display name
 * @param {Object} user         Discord User object (for avatar)
 * @param {Object} data         { balance, bank, inventoryValue, totalAssets }
 * @returns {Buffer} Image Buffer
 */
async function generateBalanceCard(displayName, user, data) {
  const canvas = createCanvas(800, 320);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 20, true, false);

  // Avatar
  let avatarImage;
  try {
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
    avatarImage = await loadImage(avatarUrl);
  } catch (_) { }

  if (avatarImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(100, 100, 70, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImage, 30, 30, 140, 140);
    ctx.restore();
    // Border
    ctx.beginPath();
    ctx.arc(100, 100, 70, 0, Math.PI * 2, true);
    ctx.lineWidth = 4;
    ctx.strokeStyle = accentColor;
    ctx.stroke();
  } else {
    ctx.fillStyle = cardColor;
    ctx.beginPath();
    ctx.arc(100, 100, 70, 0, Math.PI * 2, true);
    ctx.fill();
  }

  // Name
  ctx.fillStyle = textColor;
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(displayName, 200, 70);

  // Separator
  ctx.fillStyle = cardColor;
  ctx.fillRect(200, 85, 560, 2);

  // Stat rows: label | value
  const stats = [
    { label: 'Wallet', value: `${formatNumber(data.balance)}${CURRENCY_EMOJI}`, color: accentColor },
    { label: 'Bank', value: `${formatNumber(data.bank)}${CURRENCY_EMOJI}`, color: successColor },
    { label: 'Inventory', value: `${formatNumber(data.inventoryValue)}${CURRENCY_EMOJI}`, color: '#CBA6F7' },
    { label: 'Net Worth', value: `${formatNumber(data.totalAssets)}${CURRENCY_EMOJI}`, color: '#F9E2AF' },
  ];

  const statStartY = 110;
  const statRowH = 48;
  stats.forEach((s, i) => {
    const y = statStartY + i * statRowH;
    // row bg
    if (i % 2 === 0) {
      ctx.fillStyle = cardColor;
      roundRect(ctx, 195, y - 5, 565, statRowH - 6, 8, true, false);
    }
    ctx.fillStyle = subTextColor;
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(s.label, 210, y + 28);

    ctx.fillStyle = s.color;
    ctx.font = 'bold 24px "Segoe UI Emoji", "Arial Unicode MS", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(s.value, 750, y + 28);
  });

  ctx.textAlign = 'left';
  return canvas.toBuffer('image/png');
}

module.exports = {
  generateLevelCard,
  generateLeaderboardImage,
  generateBalanceCard
};
