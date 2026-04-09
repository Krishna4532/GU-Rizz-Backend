const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/',        ctrl.getNotifications);   // ?page=1
router.post('/read',   ctrl.markRead);           // body: { ids: [...] } or empty = mark all

module.exports = router;
