const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/vibeController');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { body } = require('express-validator');
const validate = require('../middleware/validate');

router.use(protect, apiLimiter);

// ── CONFESSIONS ─────────────────────────────────────────
router.get('/confessions',                   ctrl.getConfessions);
router.post('/confessions',                  [body('text').trim().notEmpty().isLength({ max: 1000 })], validate, ctrl.createConfession);
router.post('/confessions/:confId/like',     ctrl.likeConfession);
router.post('/confessions/:confId/comment',  [body('text').trim().notEmpty()], validate, ctrl.commentConfession);
router.post('/confessions/:confId/share',    ctrl.shareConfession);
router.post('/confessions/:confId/report',   ctrl.reportConfession);
router.delete('/confessions/:confId',        ctrl.deleteOwnConfession);

// ── GIFTS ────────────────────────────────────────────────
router.get('/gifts',                         ctrl.getGiftCatalog);
router.post('/gifts/send',                   [
  body('recipientId').notEmpty(),
  body('giftId').notEmpty(),
], validate, ctrl.sendGift);
router.get('/gifts/received/:userId',        ctrl.getReceivedGifts);

// ── LEADERBOARD ──────────────────────────────────────────
router.get('/leaderboard',                   ctrl.getLeaderboard);  // ?period=alltime|daily|weekly|monthly

module.exports = router;
