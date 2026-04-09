const { getUserNotifications, markAsRead } = require('../services/notificationService');
const R = require('../utils/apiResponse');

exports.getNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1');
    const data = await getUserNotifications(req.user._id, page);
    return R.success(res, data);
  } catch (err) {
    return R.error(res, err.message);
  }
};

exports.markRead = async (req, res) => {
  try {
    const { ids } = req.body; // array of notif ids, or empty = mark all
    await markAsRead(req.user._id, ids?.length ? ids : null);
    return R.success(res, {}, 'Marked as read');
  } catch (err) {
    return R.error(res, err.message);
  }
};
