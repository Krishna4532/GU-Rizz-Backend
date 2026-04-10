
// src/services/notificationService.js
// Updated: stores actorUsername so the frontend can do deep-link routing
// without an extra DB lookup on notification click.
const Notification = require('../models/Notification');
 
const NOTIF_TYPES = {
  LIKE:              { icon: '❤️',  bg: 'rgba(236,72,153,0.15)', type: 'like' },
  COMMENT:           { icon: '💬',  bg: 'rgba(59,130,246,0.15)', type: 'comment' },
  SHARE:             { icon: '🔁',  bg: 'rgba(34,197,94,0.15)',  type: 'share' },
  FOLLOW:            { icon: '👤',  bg: 'rgba(192,19,42,0.15)',  type: 'follow' },
  GIFT:              { icon: '🎁',  bg: 'rgba(192,19,42,0.15)',  type: 'gift' },
  CONFESSION_LIKE:   { icon: '🤫',  bg: 'rgba(168,85,247,0.15)', type: 'confession_like' },
  CONFESSION_COMMENT:{ icon: '💭',  bg: 'rgba(168,85,247,0.15)', type: 'confession_comment' },
  MESSAGE:           { icon: '💬',  bg: 'rgba(59,130,246,0.15)', type: 'message' },
  RIZZ_MILESTONE:    { icon: '🏆',  bg: 'rgba(245,200,66,0.15)', type: 'rizz_milestone' },
  SYSTEM:            { icon: '⚡',  bg: 'rgba(192,19,42,0.15)',  type: 'system' },
};
 
/**
 * Create a notification and push via socket.io
 * @param {object} opts
 * @param {string} opts.recipientId
 * @param {string} opts.actorId
 * @param {string} opts.actorUsername  - username of the actor (stored for deep-link)
 * @param {string} opts.kind           - key in NOTIF_TYPES
 * @param {string} opts.message
 * @param {string} [opts.postId]       - for like/comment → opens that post
 * @param {string} [opts.chatId]       - for message → opens that chat
 * @param {object} [opts.io]           - socket.io instance
 */
const createNotification = async ({
  recipientId, actorId, actorUsername, kind, message, postId, chatId, io,
}) => {
  if (String(recipientId) === String(actorId)) return; // never notify yourself
 
  const meta = NOTIF_TYPES[kind] || NOTIF_TYPES.SYSTEM;
 
  const notif = await Notification.create({
    recipientId,
    actorId:       actorId       || null,
    actorUsername: actorUsername || null,
    type:          meta.type,
    icon:          meta.icon,
    bgColor:       meta.bg,
    message,
    postId:  postId  || null,
    chatId:  chatId  || null,
  });
 
  // Real-time delivery via socket
  if (io) {
    const populated = await notif.populate('actorId', 'name username profileImageURL color');
    io.to(`user:${recipientId}`).emit('notification:new', populated.toObject());
  }
 
  return notif;
};
 
/**
 * Paginated notifications — includes postId + actorUsername for deep-link routing
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
 
const markAsRead = async (userId, notifIds = null) => {
  const query = { recipientId: userId };
  if (notifIds?.length) query._id = { $in: notifIds };
  await Notification.updateMany(query, { $set: { isRead: true } });
};
 
module.exports = { createNotification, getUserNotifications, markAsRead, NOTIF_TYPES };
