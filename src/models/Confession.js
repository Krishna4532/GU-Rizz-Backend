const mongoose = require('mongoose');

const confessionCommentSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = anonymous
  text:      { type: String, required: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
});

const confessionSchema = new mongoose.Schema({
  authorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },  // stored server-side, never exposed
  text:       { type: String, required: true, maxlength: 1000 },
  likesCount: { type: Number, default: 0 },
  likedBy:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments:   [confessionCommentSchema],
  sharesCount:{ type: Number, default: 0 },
  isHidden:   { type: Boolean, default: false },   // auto-hidden if reports > 5
  reports:    [{ userId: mongoose.Schema.Types.ObjectId, reason: String, createdAt: { type: Date, default: Date.now } }],
}, { timestamps: true });

confessionSchema.index({ createdAt: -1 });
confessionSchema.index({ likesCount: -1 });

module.exports = mongoose.model('Confession', confessionSchema);
