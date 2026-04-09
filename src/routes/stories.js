// src/routes/stories.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/storyController');
const { protect } = require('../middleware/auth');
const { postLimiter, apiLimiter } = require('../middleware/rateLimit');

router.use(apiLimiter, protect);

router.get('/',                      ctrl.getStoriesFeed);          // GET  /api/stories
router.post('/',    postLimiter,      ctrl.createStory);             // POST /api/stories
router.post('/:storyId/view',         ctrl.markViewed);              // POST /api/stories/:id/view
router.delete('/:storyId',            ctrl.deleteStory);             // DELETE /api/stories/:id

module.exports = router;
