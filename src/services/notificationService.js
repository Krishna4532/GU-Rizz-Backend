const Notification = require('../models/Notification');

const NOTIF_TYPES = {
  LIKE:              { icon: '❤️',  bg: 'rgba(236,72,153,0.15)', type: 'like' },
  COMMENT:           { icon: '💬',  bg: 'rgba(59,130,246,0.15)',  type: 'comment' },
  SHARE:             { icon: '🔁',  bg: 'rgba(34,197,94,0.15)',   type: 'share' },
  FOLLOW:            { icon: '👤',  bg: 'rgba(192,19,42,0.15)',   type: 'follow' },
  GIFT:              { icon: '🎁',  bg: 'rgba(192,19,42,0.15)',   type: 'gift' },
  CONFESSION_LIKE:   { icon: '🤫',  bg: 'rgba(168,85,247,0.15)', type: 'confession_like' },
  CONFESSION_COMMENT:{ icon: '💭',  bg: 'rgba(168,85,247,0.15)', type: 'confession_comment' },
  MESSAGE:           { icon: '💬',  bg: 'rgba(59,130,246,0.15)', type: 'message' },
  RIZZ_MILESTONE:    { icon: '🏆',  bg: 'rgba(245,200,66,0.15)', type: 'rizz_milestone' },
  SYSTEM:            { icon: '⚡',  bg: 'rgba(192,19,42,0.15)',   type: 'system' },
};

/**
 * Create a notification and push via socket.io
 */
const createNotification = async ({ recipientId, actorId, kind, message, postId, chatId, io }) => {
  if (String(recipientId) === String(actorId)) return; // don't notify yourself

  const meta = NOTIF_TYPES[kind] || NOTIF_TYPES.SYSTEM;

  const notif = await Notification.create({
    recipientId,
    actorId:  actorId || null,
    type:     meta.type,
    icon:     meta.icon,
    bgColor:  meta.bg,
    message,
    postId:   postId || null,
    chatId:   chatId || null,
  });

  // Real-time delivery via socket
  if (io) {
    const populated = await notif.populate('actorId', 'name username profileImageURL color');
    io.to(`user:${recipientId}`).emit('notification:new', populated.toObject());
  }

  return notif;
};

/**
 * Get paginated notifications for a user
 */
const getUserNotifications = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ recipientId: userId })
      .populate('actorId', 'name username profileImageURL color')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ recipientId: userId }),
    Notification.countDocuments({ recipientId: userId, isRead: false }),
  ]);
  return { notifications, total, unreadCount, page, totalPages: Math.ceil(total / limit) };
};

/**
 * Mark notifications as read
 */
const markAsRead = async (userId, notifIds = null) => {
  const query = { recipientId: userId };
  if (notifIds?.length) query._id = { $in: notifIds };
  await Notification.updateMany(query, { $set: { isRead: true } });
};

module.exports = { createNotification, getUserNotifications, markAsRead, NOTIF_TYPES };
