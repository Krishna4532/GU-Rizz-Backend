// src/controllers/storyController.js
// Full CRUD for 24h stories. Uses Cloudinary for media storage.

const Story    = require('../models/Story');
const User     = require('../models/User');
const Follow   = require('../models/Follow');
const { cloudinary, uploadStory } = require('../config/cloudinary');
const R = require('../utils/apiResponse');

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── CREATE STORY ──────────────────────────────────────────
exports.createStory = [
  uploadStory.single('media'),
  async (req, res) => {
    try {
      if (!req.file) return R.badRequest(res, 'Story requires a photo or video');

      const expiresAt = new Date(Date.now() + STORY_TTL_MS);
      const story = await Story.create({
        userId:   req.user._id,
        mediaURL: req.file.path,
        mediaId:  req.file.filename,
        isVideo:  req.file.mimetype?.startsWith('video/') || false,
        caption:  req.body.caption?.trim() || '',
        expiresAt,
      });

      // Increment user post count
      await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });

      const populated = await story.populate('userId', 'name username profileImageURL color');
      return R.created(res, { story: populated }, 'Story posted! Expires in 24h ⏳');
    } catch (err) { return R.error(res, err.message); }
  },
];

// ── GET STORIES FEED (followed users + own, active only) ──
exports.getStoriesFeed = async (req, res) => {
  try {
    const follows = await Follow.find({ follower: req.user._id }).select('following').lean();
    const userIds = [req.user._id, ...follows.map(f => f.following)];

    // Only return stories that haven't expired (belt-and-suspenders over TTL index)
    const cutoff = new Date(Date.now() - STORY_TTL_MS);
    const stories = await Story.find({
      userId:    { $in: userIds },
      createdAt: { $gte: cutoff },
    })
      .populate('userId', 'name username profileImageURL color')
      .sort({ createdAt: -1 })
      .lean();

    // Group by user for the stories row UI
    const byUser = {};
    stories.forEach(s => {
      const uid = String(s.userId._id || s.userId);
      if (!byUser[uid]) byUser[uid] = { user: s.userId, stories: [] };
      byUser[uid].stories.push(s);
    });

    return R.success(res, { stories, grouped: Object.values(byUser) });
  } catch (err) { return R.error(res, err.message); }
};

// ── MARK VIEWED ───────────────────────────────────────────
exports.markViewed = async (req, res) => {
  try {
    await Story.findByIdAndUpdate(req.params.storyId, {
      $addToSet: { viewers: req.user._id },
    });
    return R.success(res, {}, 'Marked as viewed');
  } catch (err) { return R.error(res, err.message); }
};

// ── DELETE STORY + CLOUDINARY ASSET ───────────────────────
exports.deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) return R.notFound(res, 'Story not found');
    if (String(story.userId) !== String(req.user._id) && req.user.role === 'user') {
      return R.forbidden(res);
    }
    // Delete from Cloudinary
    if (story.mediaId) {
      await cloudinary.uploader.destroy(story.mediaId, {
        resource_type: story.isVideo ? 'video' : 'image',
      }).catch(() => {});
    }
    await story.deleteOne();
    await User.findByIdAndUpdate(story.userId, { $inc: { postsCount: -1 } });
    return R.success(res, {}, 'Story deleted');
  } catch (err) { return R.error(res, err.message); }
};
