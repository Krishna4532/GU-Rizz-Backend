const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/postController');
const { protect, optionalAuth } = require('../middleware/auth');
const { postLimiter, apiLimiter } = require('../middleware/rateLimit');
const { body } = require('express-validator');
const validate = require('../middleware/validate');

router.use(apiLimiter);

// ── PUBLIC ─────────────────────────────────────────────────
router.get('/:postId', optionalAuth, ctrl.getPost);

// ── PROTECTED ──────────────────────────────────────────────
router.use(protect);

router.get('/',                  ctrl.getFeed);                // GET /api/posts?type=recent|trending|following
router.get('/user/:userId',      ctrl.getUserPosts);
router.post('/',                 postLimiter, ctrl.createPost);
router.delete('/:postId',        ctrl.deletePost);
router.post('/:postId/like',     ctrl.toggleLike);
router.post('/:postId/comment',  [body('text').trim().notEmpty().withMessage('Comment required')], validate, ctrl.addComment);
router.delete('/:postId/comment/:commentId', ctrl.deleteComment);
router.post('/:postId/share',    ctrl.sharePost);
router.post('/:postId/report',   ctrl.reportPost);

module.exports = router;
