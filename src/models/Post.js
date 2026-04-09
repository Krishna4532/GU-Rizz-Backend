const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:      { type: String, required: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const postSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  caption:     { type: String, maxlength: 2200, default: '' },
  mediaURL:    { type: String, default: null },
  mediaId:     { type: String, default: null },       // cloudinary public_id for deletion
  isVideo:     { type: Boolean, default: false },
  thumbnail:   { type: String, default: null },       // video thumbnail

  likesCount:  { type: Number, default: 0 },
  sharesCount: { type: Number, default: 0 },
  comments:    [commentSchema],

  // Denormalised set of userIds who liked (for O(1) liked check)
  likedBy:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  isDeleted:   { type: Boolean, default: false },
  reports:     [{ userId: mongoose.Schema.Types.ObjectId, reason: String, createdAt: { type: Date, default: Date.now } }],
}, {
  timestamps: true,
  toJSON:  { virtuals: true },
  toObject:{ virtuals: true },
});

postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ likesCount: -1 });

module.exports = mongoose.model('Post', postSchema);
