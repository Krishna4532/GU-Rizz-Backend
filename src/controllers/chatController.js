const { Chat, Message } = require('../models/Chat');
const User   = require('../models/User');
const { uploadChat } = require('../config/cloudinary');
const { createNotification } = require('../services/notificationService');
const R = require('../utils/apiResponse');

// ── GET or CREATE chat between two users ─────────────────
exports.getOrCreateChat = async (req, res) => {
  try {
    const { userId: otherUserId } = req.params;
    const myId = req.user._id;

    if (String(otherUserId) === String(myId)) return R.badRequest(res, "Can't chat with yourself");

    const other = await User.findById(otherUserId);
    if (!other) return R.notFound(res, 'User not found');

    // Check privacy: who can message
    if (other.whoCanMessage === 'nobody') return R.forbidden(res, 'This user is not accepting messages');
    if (other.blockedUsers.includes(myId)) return R.forbidden(res, 'Cannot message this user');

    let chat = await Chat.findOne({
      participants: { $all: [myId, otherUserId], $size: 2 },
    }).populate('participants', 'name username profileImageURL color');

    if (!chat) {
      chat = await Chat.create({ participants: [myId, otherUserId] });
      chat = await chat.populate('participants', 'name username profileImageURL color');
    }

    return R.success(res, { chat });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── GET USER'S INBOX ───────────────────────────────────────
exports.getInbox = async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .populate('participants', 'name username profileImageURL color')
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean();

    const myId = String(req.user._id);
    const enriched = chats.map(c => ({
      ...c,
      unread: c.unreadCounts?.[myId] || 0,
      // Other participant info
      other: c.participants.find(p => String(p._id) !== myId),
    }));

    return R.success(res, { chats: enriched });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── GET MESSAGES for a chat ────────────────────────────────
exports.getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const page  = parseInt(req.query.page || '1');
    const limit = 30;
    const skip  = (page - 1) * limit;

    // Verify user is a participant
    const chat = await Chat.findOne({ _id: chatId, participants: req.user._id });
    if (!chat) return R.forbidden(res, 'Not a participant');

    const messages = await Message.find({ chatId, isDeleted: false })
      .populate('senderId', 'name username profileImageURL color')
      .sort({ createdAt: -1 })  // newest first for pagination, reverse on frontend
      .skip(skip).limit(limit)
      .lean();

    // Mark messages as read
    await Message.updateMany(
      { chatId, senderId: { $ne: req.user._id }, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    // Reset unread count
    await Chat.findByIdAndUpdate(chatId, {
      $set: { [`unreadCounts.${String(req.user._id)}`]: 0 }
    });

    return R.success(res, { messages: messages.reverse(), page, hasMore: messages.length === limit });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── SEND MESSAGE (REST fallback — Socket.io is primary) ───
exports.sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text } = req.body;

    const chat = await Chat.findOne({ _id: chatId, participants: req.user._id });
    if (!chat) return R.forbidden(res, 'Not a participant');

    const msg = await Message.create({ chatId, senderId: req.user._id, text: text?.trim() || '' });
    const populated = await msg.populate('senderId', 'name username profileImageURL color');

    // Update chat last message + unread counts
    const otherId = chat.participants.find(p => String(p) !== String(req.user._id));
    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: text?.trim() || '📎 Media',
      lastSenderId: req.user._id,
      updatedAt: new Date(),
      $inc: { [`unreadCounts.${otherId}`]: 1 },
    });

    // Notification
    const io = req.app.get('io');
    await createNotification({
      recipientId: otherId, actorId: req.user._id,
      kind: 'MESSAGE', message: `<strong>${req.user.name}</strong>: ${text?.slice(0, 50) || 'Sent a message'}`,
      chatId, io,
    });

    return R.created(res, { message: populated });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── SEND MEDIA in chat ─────────────────────────────────────
exports.sendMediaMessage = [
  uploadChat.single('media'),
  async (req, res) => {
    try {
      const { chatId } = req.params;
      const chat = await Chat.findOne({ _id: chatId, participants: req.user._id });
      if (!chat) return R.forbidden(res, 'Not a participant');
      if (!req.file) return R.badRequest(res, 'No file provided');

      const mediaType = req.file.mimetype.startsWith('video/') ? 'video'
        : req.file.mimetype.startsWith('audio/') ? 'audio' : 'image';

      const msg = await Message.create({
        chatId, senderId: req.user._id,
        mediaURL: req.file.path, mediaType,
      });
      const populated = await msg.populate('senderId', 'name username profileImageURL color');

      const otherId = chat.participants.find(p => String(p) !== String(req.user._id));
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: `📎 ${mediaType}`,
        updatedAt: new Date(),
        $inc: { [`unreadCounts.${otherId}`]: 1 },
      });

      const io = req.app.get('io');
      if (io) {
        io.to(`chat:${chatId}`).emit('chat:message', populated.toObject());
      }

      return R.created(res, { message: populated });
    } catch (err) {
      return R.error(res, err.message);
    }
  },
];

// ── DELETE MESSAGE ─────────────────────────────────────────
exports.deleteMessage = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.msgId);
    if (!msg) return R.notFound(res);
    if (String(msg.senderId) !== String(req.user._id)) return R.forbidden(res);
    msg.isDeleted = true;
    msg.text = '';
    await msg.save();
    const io = req.app.get('io');
    if (io) io.to(`chat:${msg.chatId}`).emit('chat:message_deleted', { msgId: msg._id });
    return R.success(res, {}, 'Message deleted');
  } catch (err) {
    return R.error(res, err.message);
  }
};
