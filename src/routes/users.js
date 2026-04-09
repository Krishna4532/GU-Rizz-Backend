// src/routes/users.js — complete replacement
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/userController');
const { protect, optionalAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { body } = require('express-validator');
const validate = require('../middleware/validate');

router.use(apiLimiter);

// ── PUBLIC (optional auth for isFollowing flag) ───────────
router.get('/explore',            optionalAuth, ctrl.explore);
router.get('/trending',           optionalAuth, ctrl.getTrending);   // ← NEW
router.get('/profile/:username',  optionalAuth, ctrl.getProfile);
router.get('/:userId/followers',  optionalAuth, ctrl.getFollowers);
router.get('/:userId/following',  optionalAuth, ctrl.getFollowing);

// ── PROTECTED ─────────────────────────────────────────────
router.use(protect);

router.get('/suggested',           ctrl.getSuggested);
router.put('/profile',             ctrl.updateProfile);
router.post('/avatar',             ctrl.uploadAvatar);
router.post('/cover',              ctrl.uploadCover);          // ← NEW: cover photo
router.post('/fcm-token',          ctrl.saveFcmToken);         // ← NEW: Firebase push
router.delete('/account',          ctrl.deleteAccount);        // ← NEW: account nuke
router.post('/heartbeat',          ctrl.heartbeat);
router.post('/follow/:userId',     ctrl.toggleFollow);
router.post('/block/:userId',      ctrl.blockUser);
router.post('/report/:userId',     ctrl.reportUser);
router.put('/settings', [
  body('whoCanMessage').optional().isIn(['everyone','followers','nobody']),
  body('whoCanFollow').optional().isIn(['everyone','nobody']),
], validate, ctrl.updateSettings);

module.exports = router;
