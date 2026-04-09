const cron = require('node-cron');
const User = require('../models/User');
const { invalidateCache } = require('../services/leaderboardService');
const { GiftCatalog } = require('../models/Gift');

const GIFT_CATALOG_SEED = [
  { id: 'rose',      emoji: '🌹', name: 'Red Rose',       cost: 50,  description: 'A classic love symbol' },
  { id: 'bouquet',   emoji: '💐', name: 'Bouquet',         cost: 120, description: 'Full bouquet of fresh flowers' },
  { id: 'choco',     emoji: '🍫', name: 'Chocolates',      cost: 80,  description: 'Sweet Cadbury box' },
  { id: 'ring',      emoji: '💍', name: 'Gold Ring',       cost: 500, description: 'A sparkly virtual ring' },
  { id: 'necklace',  emoji: '📿', name: 'Necklace',        cost: 350, description: 'Beautiful pearl necklace' },
  { id: 'bracelet',  emoji: '🪬', name: 'Bracelet',        cost: 200, description: 'Charm bracelet' },
  { id: 'teddy',     emoji: '🧸', name: 'Teddy Bear',      cost: 150, description: 'Soft and cuddly' },
  { id: 'crown',     emoji: '👑', name: 'Crown',           cost: 750, description: 'For royalty only' },
  { id: 'star',      emoji: '⭐', name: 'Shining Star',    cost: 100, description: 'You are my star' },
  { id: 'cake',      emoji: '🎂', name: 'Birthday Cake',   cost: 180, description: 'Celebrate together' },
  { id: 'heart',     emoji: '💝', name: 'Heart Locket',    cost: 300, description: 'A locket full of love' },
  { id: 'letter',    emoji: '💌', name: 'Love Letter',     cost: 60,  description: 'Words straight from the heart' },
];

/**
 * Seed gift catalog if empty (runs once on startup)
 */
const seedGiftCatalog = async () => {
  try {
    const count = await GiftCatalog.countDocuments();
    if (count === 0) {
      await GiftCatalog.insertMany(GIFT_CATALOG_SEED);
      console.log(`🎁 Gift catalog seeded (${GIFT_CATALOG_SEED.length} gifts)`);
    }
  } catch (err) {
    console.error('Gift catalog seed error:', err.message);
  }
};

/**
 * Refresh leaderboard cache every 10 minutes
 */
const startLeaderboardRefresh = () => {
  cron.schedule('*/10 * * * *', async () => {
    try {
      await invalidateCache();
      console.log('♻️  Leaderboard cache refreshed');
    } catch (err) {
      console.error('Leaderboard refresh error:', err.message);
    }
  });
};

/**
 * Update daily streaks at midnight
 */
const startStreakUpdater = () => {
  cron.schedule('0 0 * * *', async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Users active yesterday keep their streak; others reset
      await User.updateMany(
        { lastActiveDate: { $lt: yesterday } },
        { $set: { rizzStreak: 0 } }
      );
      await User.updateMany(
        { lastActiveDate: { $gte: yesterday, $lt: today } },
        { $inc: { rizzStreak: 1 } }
      );
      console.log('🔥 Streaks updated');
    } catch (err) {
      console.error('Streak updater error:', err.message);
    }
  });
};

const startAllCrons = async () => {
  await seedGiftCatalog();
  startLeaderboardRefresh();
  startStreakUpdater();
  console.log('⏰ Cron jobs started');
};

module.exports = { startAllCrons };
