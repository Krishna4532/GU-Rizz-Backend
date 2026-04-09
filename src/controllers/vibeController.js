const Confession = require('../models/Confession');
const { GiftCatalog, GiftTransaction } = require('../models/Gift');
const User = require('../models/User');
const { awardRizz } = require('../services/rizzService');
const { getLeaderboard, getUserRank } = require('../services/leaderboardService');
const { createNotification } = require('../services/notificationService');
const { containsOffensiveContent, isSpam } = require('../utils/moderation');
const R = require('../utils/apiResponse');

// ═══════════════════════════════════════════════════════════
// CONFESSIONS
// ═══════════════════════════════════════════════════════════

exports.getConfessions = async (req, res) => {
  try {
    const page  = parseInt(req.query.page || '1');
    const limit = 10;
    const skip  = (page - 1) * limit;
    const myId  = req.user._id;

    const confessions = await Confession.find({ isHidden: false })
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
      .lean();

    // Never expose authorId — truly anonymous on frontend
    const enriched = confessions.map(c => ({
      _id: c._id,
      text: c.text,
      likesCount: c.likesCount,
      sharesCount: c.sharesCount,
      commentsCount: c.comments?.length || 0,
      comments: (c.comments || []).map(cm => ({ _id: cm._id, text: cm.text, createdAt: cm.createdAt })),
      liked: c.likedBy?.some(id => String(id) === String(myId)) || false,
      createdAt: c.createdAt,
    }));

    return R.success(res, { confessions: enriched, page, hasMore: confessions.length === limit });
  } catch (err) {
    return R.error(res, err.message);
  }
};

exports.createConfession = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return R.badRequest(res, 'Confession cannot be empty');
    if (text.length > 1000) return R.badRequest(res, 'Too long (max 1000 chars)');
    if (containsOffensiveContent(text) || isSpam(text)) {
      return R.badRequest(res, 'Content violates community guidelines');
    }
    const confession = await Confession.create({ authorId: req.user._id, text: text.trim() });
    // Return without authorId
    return R.created(res, {
      confession: { _id: confession._id, text: confession.text, likesCount: 0, comments: [], liked: false, createdAt: confession.createdAt }
    }, 'Confession posted anonymously 🤫');
  } catch (err) {
    return R.error(res, err.message);
  }
};

exports.likeConfession = async (req, res) => {
  try {
    const confession = await Confession.findById(req.params.confId);
    if (!confession || confession.isHidden) return R.notFound(res);
    const myId = req.user._id;
    const alreadyLiked = confession.likedBy.includes(myId);

    if (alreadyLiked) {
      await Confession.findByIdAndUpdate(req.params.confId, { $pull: { likedBy: myId }, $inc: { likesCount: -1 } });
      return R.success(res, { liked: false, likesCount: confession.likesCount - 1 });
    } else {
      await Confession.findByIdAndUpdate(req.params.confId, { $addToSet: { likedBy: myId }, $inc: { likesCount: 1 } });
      // Award rizz to author (anonymously)
      const io = req.app.get('io');
      await awardRizz(confession.authorId, 2, 'confession like', {
        type: 'confession_like', icon: '🤫', bgColor: 'rgba(168,85,247,0.15)',
        message: 'Your confession got a like',
      }, io);
      return R.success(res, { liked: true, likesCount: confession.likesCount + 1 });
    }
  } catch (err) {
    return R.error(res, err.message);
  }
};

exports.commentConfession = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return R.badRequest(res, 'Comment cannot be empty');
    if (containsOffensiveContent(text)) return R.badRequest(res, 'Content violates guidelines');

    const confession = await Confession.findByIdAndUpdate(
      req.params.confId,
      { $push: { comments: { userId: null, text: text.trim() } } }, // userId null = anonymous
      { new: true }
    );
    if (!confession) return R.notFound(res);

    const newComment = confession.comments[confession.comments.length - 1];
    const io = req.app.get('io');
    await awardRizz(confession.authorId, 5, 'confession comment', {
      type: 'confession_comment', icon: '💭', bgColor: 'rgba(168,85,247,0.15)',
      message: 'Someone commented on your confession',
    }, io);

    return R.created(res, {
      comment: { _id: newComment._id, text: newComment.text, createdAt: newComment.createdAt }
    });
  } catch (err) {
    return R.error(res, err.message);
  }
};

exports.shareConfession = async (req, res) => {
  try {
    const confession = await Confession.findByIdAndUpdate(
      req.params.confId, { $inc: { sharesCount: 1 } }, { new: true }
    );
    if (!confession) return R.notFound(res);
    const io = req.app.get('io');
    await awardRizz(confession.authorId, 10, 'confession share', {
      type: 'confession_like', icon: '🔁', bgColor: 'rgba(34,197,94,0.15)',
      message: 'Your confession was shared',
    }, io);
    return R.success(res, { sharesCount: confession.sharesCount });
  } catch (err) {
    return R.error(res, err.message);
  }
};

exports.reportConfession = async (req, res) => {
  try {
    const { reason } = req.body;
    const confession = await Confession.findByIdAndUpdate(
      req.params.confId,
      { $push: { reports: { userId: req.user._id, reason: reason || 'reported' } } },
      { new: true }
    );
    // Auto-hide if reports >= 5
    if (confession && confession.reports.length >= 5) {
      await Confession.findByIdAndUpdate(req.params.confId, { isHidden: true });
    }
    return R.success(res, {}, 'Reported. Thank you for keeping GU-Rizz safe 🛡️');
  } catch (err) {
    return R.error(res, err.message);
  }
};

exports.deleteOwnConfession = async (req, res) => {
  try {
    const confession = await Confession.findById(req.params.confId);
    if (!confession) return R.notFound(res);
    if (String(confession.authorId) !== String(req.user._id) && req.user.role === 'user') {
      return R.forbidden(res);
    }
    await confession.deleteOne();
    return R.success(res, {}, 'Confession deleted');
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ═══════════════════════════════════════════════════════════
// GIFTS
// ═══════════════════════════════════════════════════════════

exports.getGiftCatalog = async (req, res) => {
  try {
    const gifts = await GiftCatalog.find({ isActive: true }).sort({ cost: 1 }).lean();
    const myRizz = req.user.rizzPoints || 0;
    const enriched = gifts.map(g => ({ ...g, canAfford: myRizz >= g.cost }));
    return R.success(res, { gifts: enriched, myRizzPoints: myRizz });
  } catch (err) {
    return R.error(res, err.message);
  }
};

exports.sendGift = async (req, res) => {
  try {
    const { recipientId, giftId, message } = req.body;

    const [recipient, gift, sender] = await Promise.all([
      User.findById(recipientId),
      GiftCatalog.findOne({ id: giftId, isActive: true }),
      User.findById(req.user._id).select('rizzPoints name'),
    ]);

    if (!recipient) return R.notFound(res, 'Recipient not found');
    if (!gift) return R.notFound(res, 'Gift not found');
    if (String(recipientId) === String(req.user._id)) return R.badRequest(res, "Can't gift yourself");
    if (sender.rizzPoints < gift.cost) {
      return R.badRequest(res, `Not enough Rizz Points! Need ${gift.cost}, you have ${sender.rizzPoints}`);
    }

    // Debit sender, record transaction
    await User.findByIdAndUpdate(req.user._id, { $inc: { rizzPoints: -gift.cost } });
    await User.findByIdAndUpdate(recipientId, { $inc: { giftsReceivedCount: 1 } });

    const transaction = await GiftTransaction.create({
      senderId: req.user._id, recipientId,
      giftId: gift.id, giftEmoji: gift.emoji, giftName: gift.name,
      cost: gift.cost, message: message?.trim() || '',
    });

    // Notification to recipient
    const io = req.app.get('io');
    await createNotification({
      recipientId, actorId: req.user._id,
      kind: 'GIFT',
      message: `<strong>${req.user.name}</strong> sent you a ${gift.emoji} ${gift.name}!`,
      io,
    });

    const updatedSender = await User.findById(req.user._id).select('rizzPoints');
    return R.success(res, {
      transaction,
      newRizzPoints: updatedSender.rizzPoints,
    }, `${gift.emoji} ${gift.name} sent to ${recipient.name}! 💝`);
  } catch (err) {
    return R.error(res, err.message);
  }
};

exports.getReceivedGifts = async (req, res) => {
  try {
    const gifts = await GiftTransaction.find({ recipientId: req.params.userId })
      .populate('senderId', 'name username profileImageURL color')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return R.success(res, { gifts });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ═══════════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════════

exports.getLeaderboard = async (req, res) => {
  try {
    const period = req.query.period || 'alltime';
    const [board, myRank] = await Promise.all([
      getLeaderboard(period),
      getUserRank(req.user._id),
    ]);

    // Flag current user's entry
    const myId = String(req.user._id);
    const enriched = board.map(u => ({ ...u, isMe: String(u._id) === myId }));

    return R.success(res, { leaderboard: enriched, myRank, period });
  } catch (err) {
    return R.error(res, err.message);
  }
};
