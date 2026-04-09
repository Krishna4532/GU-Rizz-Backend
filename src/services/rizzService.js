const User = require('../models/User');
const Notification = require('../models/Notification');

// ── POINT VALUES (match frontend exactly) ────────────────
const RIZZ = {
  LIKE_RECEIVED:    2,
  COMMENT_RECEIVED: 5,
  SHARE_RECEIVED:   10,
  GOT_FOLLOWED:     25,
  TIME_PER_5_MIN:   1,
};

/**
 * Award rizz points to a user (server-side, atomic)
 * @param {string} userId - who receives the points
 * @param {number} points - how many points
 * @param {string} reason - for notification text
 * @param {object} notifMeta - { icon, bgColor, message, actorId }
 * @param {object} io - socket.io instance (optional, for real-time update)
 */
const awardRizz = async (userId, points, reason, notifMeta = null, io = null) => {
  if (points <= 0) return;

  // Atomic increment — prevents race conditions
  const updated = await User.findByIdAndUpdate(
    userId,
    { $inc: { rizzPoints: points } },
    { new: true, select: 'rizzPoints username name' }
  );
  if (!updated) return;

  // Check for streak milestone notifications
  await checkRizzMilestone(updated, io);

  // Create notification if metadata provided
  if (notifMeta) {
    const notif = await Notification.create({
      recipientId: userId,
      actorId:     notifMeta.actorId || null,
      type:        notifMeta.type || 'rizz_milestone',
      icon:        notifMeta.icon || '⚡',
      bgColor:     notifMeta.bgColor || 'rgba(192,19,42,0.15)',
      message:     notifMeta.message || `+${points} Rizz Points!`,
      postId:      notifMeta.postId || null,
    });

    // Real-time push via socket
    if (io) {
      io.to(`user:${userId}`).emit('notification:new', {
        ...notif.toObject(),
        points,
      });
      io.to(`user:${userId}`).emit('rizz:update', {
        rizzPoints: updated.rizzPoints,
      });
    }
  }

  return updated.rizzPoints;
};

// Award points when a post receives a like
const awardLikeRizz = async (postAuthorId, actorId, postId, io) =>
  awardRizz(
    postAuthorId, RIZZ.LIKE_RECEIVED,
    'like received',
    {
      actorId, postId, type: 'like',
      icon: '❤️', bgColor: 'rgba(236,72,153,0.15)',
      message: `Someone liked your post`,
    },
    io
  );

// Award points when a post receives a comment
const awardCommentRizz = async (postAuthorId, actorId, postId, io) =>
  awardRizz(
    postAuthorId, RIZZ.COMMENT_RECEIVED,
    'comment received',
    {
      actorId, postId, type: 'comment',
      icon: '💬', bgColor: 'rgba(59,130,246,0.15)',
      message: `Someone commented on your post`,
    },
    io
  );

// Award points when a post is shared
const awardShareRizz = async (postAuthorId, actorId, postId, io) =>
  awardRizz(
    postAuthorId, RIZZ.SHARE_RECEIVED,
    'share received',
    {
      actorId, postId, type: 'share',
      icon: '🔁', bgColor: 'rgba(34,197,94,0.15)',
      message: `Someone shared your post`,
    },
    io
  );

// Award points when a user gains a follower
const awardFollowRizz = async (followedUserId, followerUserId, io) =>
  awardRizz(
    followedUserId, RIZZ.GOT_FOLLOWED,
    'new follower',
    {
      actorId: followerUserId, type: 'follow',
      icon: '👤', bgColor: 'rgba(192,19,42,0.15)',
      message: `Someone started following you`,
    },
    io
  );

// Award passive time-based rizz (heartbeat from frontend)
const awardTimeRizz = async (userId, minutesSpent, io) => {
  const pointsToAward = Math.floor(minutesSpent / 5) * RIZZ.TIME_PER_5_MIN;
  if (pointsToAward <= 0) return;

  // Track total session minutes
  await User.findByIdAndUpdate(userId, {
    $inc: { sessionMinutes: minutesSpent, rizzPoints: pointsToAward },
    $set: { lastActiveDate: new Date() },
  });

  if (io) {
    const user = await User.findById(userId).select('rizzPoints');
    if (user) io.to(`user:${userId}`).emit('rizz:update', { rizzPoints: user.rizzPoints });
  }
};

// Check and notify on milestone points
const checkRizzMilestone = async (user, io) => {
  const milestones = [100, 500, 1000, 2500, 5000, 10000];
  const prev = user.rizzPoints - 1; // approximate
  for (const m of milestones) {
    if (prev < m && user.rizzPoints >= m) {
      const notif = await Notification.create({
        recipientId: user._id,
        type:        'rizz_milestone',
        icon:        '🏆',
        bgColor:     'rgba(245,200,66,0.15)',
        message:     `🎉 You hit ${m.toLocaleString()} Rizz Points!`,
      });
      if (io) {
        io.to(`user:${user._id}`).emit('notification:new', notif.toObject());
      }
    }
  }
};

module.exports = {
  RIZZ,
  awardRizz,
  awardLikeRizz,
  awardCommentRizz,
  awardShareRizz,
  awardFollowRizz,
  awardTimeRizz,
};
