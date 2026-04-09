const User = require('../models/User');
const { safeGet, safeSet, safeDel } = require('../config/redis');

const CACHE_TTL   = 600; // 10 minutes
const TOP_N       = 50;
const CACHE_KEYS  = {
  allTime:  'lb:alltime',
  daily:    'lb:daily',
  weekly:   'lb:weekly',
  monthly:  'lb:monthly',
};

/**
 * Build leaderboard query base projection
 */
const buildProjection = () => ({
  name: 1, username: 1, profileImageURL: 1, color: 1,
  course: 1, year: 1, rizzPoints: 1, followersCount: 1,
});

/**
 * Fetch all-time leaderboard (top N by rizzPoints)
 * Cached in Redis for CACHE_TTL seconds
 */
const getAllTimeLeaderboard = async () => {
  const cached = await safeGet(CACHE_KEYS.allTime);
  if (cached) return JSON.parse(cached);

  const users = await User.find({ isSuspended: false })
    .select(buildProjection())
    .sort({ rizzPoints: -1 })
    .limit(TOP_N)
    .lean();

  const result = users.map((u, i) => ({ ...u, rank: i + 1 }));
  await safeSet(CACHE_KEYS.allTime, JSON.stringify(result), CACHE_TTL);
  return result;
};

/**
 * Fetch leaderboard for a time period using createdAt-scoped aggregation
 * For daily/weekly/monthly — approximated via rizzPoints change
 * (Full time-series would require a separate PointsLog collection)
 */
const getLeaderboard = async (period = 'alltime') => {
  if (period === 'alltime') return getAllTimeLeaderboard();

  const cached = await safeGet(CACHE_KEYS[period]);
  if (cached) return JSON.parse(cached);

  // Date range for period
  const now = new Date();
  const from = new Date();
  if (period === 'daily')   from.setHours(0, 0, 0, 0);
  if (period === 'weekly')  from.setDate(now.getDate() - 7);
  if (period === 'monthly') from.setMonth(now.getMonth() - 1);

  // Find most recently active users, sorted by rizzPoints
  // (without a PointsLog, period leaderboards approximate via lastActiveDate)
  const users = await User.find({
    isSuspended: false,
    lastActiveDate: { $gte: from },
  })
    .select(buildProjection())
    .sort({ rizzPoints: -1 })
    .limit(TOP_N)
    .lean();

  const result = users.map((u, i) => ({ ...u, rank: i + 1 }));
  await safeSet(CACHE_KEYS[period], JSON.stringify(result), CACHE_TTL);
  return result;
};

/**
 * Get a single user's rank in the all-time leaderboard
 */
const getUserRank = async (userId) => {
  const count = await User.countDocuments({
    isSuspended: false,
    rizzPoints: { $gt: (await User.findById(userId).select('rizzPoints').lean())?.rizzPoints || 0 },
  });
  return count + 1;
};

/**
 * Invalidate all leaderboard caches (called after bulk rizz updates)
 */
const invalidateCache = async () => {
  for (const key of Object.values(CACHE_KEYS)) await safeDel(key);
};

module.exports = { getLeaderboard, getUserRank, invalidateCache };
