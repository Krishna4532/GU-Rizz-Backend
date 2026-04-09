const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/chatController');
const { protect } = require('../middleware/auth');
const { messageLimiter } = require('../middleware/rateLimit');
const { body } = require('express-validator');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/inbox',                      ctrl.getInbox);
router.get('/with/:userId',               ctrl.getOrCreateChat);   // get or create DM
router.get('/:chatId/messages',           ctrl.getMessages);
router.post('/:chatId/messages',          messageLimiter, [body('text').notEmpty()], validate, ctrl.sendMessage);
router.post('/:chatId/messages/media',    messageLimiter, ctrl.sendMediaMessage);
router.delete('/messages/:msgId',         ctrl.deleteMessage);

module.exports = router;
