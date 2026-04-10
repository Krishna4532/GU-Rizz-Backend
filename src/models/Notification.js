
Copy

// src/models/Notification.js
// Updated: adds actorUsername for deep-link routing without extra DB lookup.
const mongoose = require('mongoose');
 
const notificationSchema = new mongoose.Schema({
  recipientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorUsername: { type: String, default: null }, // ← NEW: stored at creation for instant deep-link
  type: {
    type: String,
    enum: [
      'like', 'comment', 'share', 'follow', 'gift',
      'confession_like', 'confession_comment', 'message',
      'rizz_milestone', 'system',
    ],
    required: true,
  },
  icon:    { type: String, default: '🔔' },
  bgColor: { type: String, default: 'rgba(192,19,42,0.15)' },
  message: { type: String, required: true },
  postId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null }, // for like/comment deep-link
  chatId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null }, // for message deep-link
  isRead:  { type: Boolean, default: false, index: true },
}, { timestamps: true });
 
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });
 
module.exports = mongoose.model('Notification', notificationSchema);
