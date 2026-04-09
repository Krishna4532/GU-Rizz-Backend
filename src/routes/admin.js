const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const Post     = require('../models/Post');
const Confession = require('../models/Confession');
const { GiftCatalog } = require('../models/Gift');
const { protect, requireRole } = require('../middleware/auth');
const { invalidateCache } = require('../services/leaderboardService');
const R = require('../utils/apiResponse');

router.use(protect, requireRole('admin', 'moderator'));

// ── DASHBOARD STATS ────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [users, posts, confessions] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments({ isDeleted: false }),
      Confession.countDocuments({ isHidden: false }),
    ]);
    const today = new Date(); today.setHours(0,0,0,0);
    const dau = await User.countDocuments({ lastActiveDate: { $gte: today } });
    const newToday = await User.countDocuments({ createdAt: { $gte: today } });
    return R.success(res, { users, posts, confessions, dau, newToday });
  } catch (err) { return R.error(res, err.message); }
});

// ── USER MANAGEMENT ────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    const filter = q ? { $or: [{ name: new RegExp(q,'i') }, { username: new RegExp(q,'i') }] } : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(+limit).lean();
    const total = await User.countDocuments(filter);
    return R.success(res, { users, total });
  } catch (err) { return R.error(res, err.message); }
});

router.post('/users/:id/suspend', requireRole('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    await User.findByIdAndUpdate(req.params.id, {
      isSuspended: true, suspendedAt: new Date(), suspendReason: reason || 'Violated community guidelines',
    });
    return R.success(res, {}, 'User suspended');
  } catch (err) { return R.error(res, err.message); }
});

router.post('/users/:id/unsuspend', requireRole('admin'), async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isSuspended: false, suspendedAt: null, suspendReason: null });
    return R.success(res, {}, 'User unsuspended');
  } catch (err) { return R.error(res, err.message); }
});

// ── REPORTED POSTS ─────────────────────────────────────────
router.get('/reported-posts', async (req, res) => {
  try {
    const posts = await Post.find({ 'reports.0': { $exists: true }, isDeleted: false })
      .populate('userId', 'name username')
      .sort({ 'reports.length': -1 })
      .limit(50).lean();
    return R.success(res, { posts });
  } catch (err) { return R.error(res, err.message); }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, { isDeleted: true });
    return R.success(res, {}, 'Post removed');
  } catch (err) { return R.error(res, err.message); }
});

// ── REPORTED CONFESSIONS ───────────────────────────────────
router.get('/reported-confessions', async (req, res) => {
  try {
    const confs = await Confession.find({ 'reports.0': { $exists: true } })
      .sort({ 'reports.length': -1 }).limit(50).lean();
    return R.success(res, { confessions: confs });
  } catch (err) { return R.error(res, err.message); }
});

router.patch('/confessions/:id/hide', async (req, res) => {
  try {
    await Confession.findByIdAndUpdate(req.params.id, { isHidden: true });
    return R.success(res, {}, 'Confession hidden');
  } catch (err) { return R.error(res, err.message); }
});

// ── GIFT CATALOG MANAGEMENT ────────────────────────────────
router.get('/gifts',  async (req, res) => {
  try {
    const gifts = await GiftCatalog.find().lean();
    return R.success(res, { gifts });
  } catch (err) { return R.error(res, err.message); }
});

router.post('/gifts', requireRole('admin'), async (req, res) => {
  try {
    const gift = await GiftCatalog.create(req.body);
    return R.created(res, { gift });
  } catch (err) { return R.error(res, err.message); }
});

router.patch('/gifts/:id', requireRole('admin'), async (req, res) => {
  try {
    const gift = await GiftCatalog.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    return R.success(res, { gift });
  } catch (err) { return R.error(res, err.message); }
});

// ── CACHE CONTROL ──────────────────────────────────────────
router.post('/cache/clear-leaderboard', async (req, res) => {
  try {
    await invalidateCache();
    return R.success(res, {}, 'Leaderboard cache cleared');
  } catch (err) { return R.error(res, err.message); }
});

module.exports = router;
