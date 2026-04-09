// src/models/Story.js
// Instagram-style stories that auto-expire after 24 hours.
// MongoDB TTL index deletes documents automatically server-side.

const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mediaURL:  { type: String, required: true },
  mediaId:   { type: String, required: true },   // Cloudinary public_id for deletion
  isVideo:   { type: Boolean, default: false },
  caption:   { type: String, maxlength: 200, default: '' },
  viewers:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  expiresAt: { type: Date, required: true },     // createdAt + 24h, set on create
}, {
  timestamps: true,
});

// TTL index: MongoDB deletes doc automatically once expiresAt is reached
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Story', storySchema);
