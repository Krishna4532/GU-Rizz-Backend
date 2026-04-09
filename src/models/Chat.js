const mongoose = require('mongoose');

// ── CHAT (conversation between 2 users) ──────────────────
const chatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  lastMessage:  { type: String, default: '' },
  lastSenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedAt:    { type: Date, default: Date.now },
  unreadCounts: {
    type: Map,
    of: Number,
    default: {},
  },
}, { timestamps: true });

chatSchema.index({ participants: 1 });
chatSchema.index({ updatedAt: -1 });

// ── MESSAGE ───────────────────────────────────────────────
const messageSchema = new mongoose.Schema({
  chatId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true, index: true },
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:       { type: String, default: '' },
  mediaURL:   { type: String, default: null },
  mediaType:  { type: String, enum: ['image', 'video', 'audio', null], default: null },
  isRead:     { type: Boolean, default: false },
  readAt:     { type: Date, default: null },
  isDeleted:  { type: Boolean, default: false },
}, { timestamps: true });

messageSchema.index({ chatId: 1, createdAt: 1 });

const Chat    = mongoose.model('Chat', chatSchema);
const Message = mongoose.model('Message', messageSchema);

module.exports = { Chat, Message };
