const Post   = require('../models/Post');
const User   = require('../models/User');
const Follow = require('../models/Follow');
const { cloudinary, uploadPost } = require('../config/cloudinary');
const { awardLikeRizz, awardCommentRizz, awardShareRizz } = require('../services/rizzService');
const { createNotification } = require('../services/notificationService');
const { containsOffensiveContent, isSpam } = require('../utils/moderation');
const R = require('../utils/apiResponse');

// ── CREATE POST ───────────────────────────────────────────
exports.createPost = [
  uploadPost.single('media'),
  async (req, res) => {
    try {
      const { caption } = req.body;
      if (!caption && !req.file) return R.badRequest(res, 'Post needs a caption or media');

      if (caption && (containsOffensiveContent(caption) || isSpam(caption))) {
        return R.badRequest(res, 'Post contains inappropriate content');
      }

      const postData = {
        userId:  req.user._id,
        caption: caption?.trim() || '',
      };

      if (req.file) {
        postData.mediaURL  = req.file.path;
        postData.mediaId   = req.file.filename;
        postData.isVideo   = req.file.mimetype?.startsWith('video/') || false;
      }

      const post = await Post.create(postData);
      await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });

      const populated = await post.populate('userId', 'name username profileImageURL color');

      // Push to followers via socket
      const io = req.app.get('io');
      if (io) {
        const follows = await Follow.find({ following: req.user._id }).select('follower').lean();
        follows.forEach(f => io.to(`user:${f.follower}`).emit('feed:new_post', populated.toObject()));
      }

      return R.created(res, { post: populated }, 'Post shared! 🔥');
    } catch (err) {
      return R.error(res, err.message);
    }
  },
];

// ── GET FEED (paginated, follower + public) ───────────────
exports.getFeed = async (req, res) => {
  try {
    const page  = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip  = (page - 1) * limit;
    const type  = req.query.type || 'recent'; // 'recent' | 'trending' | 'following'

    let userIds = [req.user._id];

    if (type === 'following' || type === 'recent') {
      const follows = await Follow.find({ follower: req.user._id }).select('following').lean();
      userIds = [req.user._id, ...follows.map(f => f.following)];
    }

    const filter = { isDeleted: false };
    if (type === 'following') filter.userId = { $in: userIds };
    // 'recent' and 'trending' use all posts

    const sortBy = type === 'trending'
      ? { likesCount: -1, createdAt: -1 }
      : { createdAt: -1 };

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate('userId', 'name username profileImageURL color course year')
        .sort(sortBy)
        .skip(skip).limit(limit)
        .lean(),
      Post.countDocuments(filter),
    ]);

    // Attach liked status for current user
    const myId = String(req.user._id);
    const enriched = posts.map(p => ({
      ...p,
      liked: p.likedBy?.some(id => String(id) === myId) || false,
      commentsCount: p.comments?.length || 0,
    }));

    return R.success(res, {
      posts: enriched, total, page,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + posts.length < total,
    });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── GET USER POSTS ─────────────────────────────────────────
exports.getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page || '1');
    const limit = 12;
    const skip = (page - 1) * limit;

    const posts = await Post.find({ userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
      .lean();

    const myId = String(req.user?._id || '');
    const enriched = posts.map(p => ({
      ...p,
      liked: p.likedBy?.some(id => String(id) === myId) || false,
    }));

    return R.success(res, { posts: enriched, page });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── GET SINGLE POST ────────────────────────────────────────
exports.getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId)
      .populate('userId', 'name username profileImageURL color')
      .populate('comments.userId', 'name username profileImageURL color')
      .lean();
    if (!post || post.isDeleted) return R.notFound(res);
    const myId = String(req.user?._id || '');
    return R.success(res, {
      post: { ...post, liked: post.likedBy?.some(id => String(id) === myId) || false }
    });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── LIKE / UNLIKE ──────────────────────────────────────────
exports.toggleLike = async (req, res) => {
  try {
    const { postId } = req.params;
    const myId = req.user._id;

    const post = await Post.findById(postId);
    if (!post || post.isDeleted) return R.notFound(res);

    const alreadyLiked = post.likedBy.includes(myId);
    const io = req.app.get('io');

    if (alreadyLiked) {
      await Post.findByIdAndUpdate(postId, {
        $pull: { likedBy: myId },
        $inc:  { likesCount: -1 },
      });
      return R.success(res, { liked: false, likesCount: post.likesCount - 1 });
    } else {
      await Post.findByIdAndUpdate(postId, {
        $addToSet: { likedBy: myId },
        $inc:      { likesCount: 1 },
      });

      // Award rizz to post author
      if (String(post.userId) !== String(myId)) {
        await awardLikeRizz(post.userId, myId, postId, io);
        await createNotification({
          recipientId: post.userId, actorId: myId,
          kind: 'LIKE', message: `<strong>${req.user.name}</strong> liked your post`,
          postId, io,
        });
      }

      // Real-time like count to all viewers of that post
      if (io) io.to(`post:${postId}`).emit('post:like_update', { postId, likesCount: post.likesCount + 1, liked: true });

      return R.success(res, { liked: true, likesCount: post.likesCount + 1 });
    }
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── ADD COMMENT ────────────────────────────────────────────
exports.addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    if (!text?.trim()) return R.badRequest(res, 'Comment cannot be empty');
    if (containsOffensiveContent(text)) return R.badRequest(res, 'Comment contains inappropriate content');

    const post = await Post.findByIdAndUpdate(
      postId,
      { $push: { comments: { userId: req.user._id, text: text.trim() } } },
      { new: true }
    ).populate('comments.userId', 'name username profileImageURL color');

    if (!post || post.isDeleted) return R.notFound(res);

    const newComment = post.comments[post.comments.length - 1];
    const io = req.app.get('io');

    if (String(post.userId) !== String(req.user._id)) {
      await awardCommentRizz(post.userId, req.user._id, postId, io);
      await createNotification({
        recipientId: post.userId, actorId: req.user._id,
        kind: 'COMMENT', message: `<strong>${req.user.name}</strong> commented on your post`,
        postId, io,
      });
    }

    if (io) {
      io.to(`post:${postId}`).emit('post:new_comment', { postId, comment: newComment });
    }

    return R.created(res, { comment: newComment, commentsCount: post.comments.length });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── DELETE COMMENT ─────────────────────────────────────────
exports.deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const post = await Post.findById(postId);
    if (!post) return R.notFound(res);
    const comment = post.comments.id(commentId);
    if (!comment) return R.notFound(res, 'Comment not found');
    // Only commenter or post author can delete
    if (String(comment.userId) !== String(req.user._id) && String(post.userId) !== String(req.user._id)) {
      return R.forbidden(res);
    }
    comment.deleteOne();
    await post.save();
    return R.success(res, {}, 'Comment deleted');
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── SHARE POST ─────────────────────────────────────────────
exports.sharePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findByIdAndUpdate(postId, { $inc: { sharesCount: 1 } }, { new: true });
    if (!post || post.isDeleted) return R.notFound(res);
    const io = req.app.get('io');
    if (String(post.userId) !== String(req.user._id)) {
      await awardShareRizz(post.userId, req.user._id, postId, io);
      await createNotification({
        recipientId: post.userId, actorId: req.user._id,
        kind: 'SHARE', message: `<strong>${req.user.name}</strong> shared your post`,
        postId, io,
      });
    }
    return R.success(res, { sharesCount: post.sharesCount });
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── DELETE POST ────────────────────────────────────────────
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return R.notFound(res);
    if (String(post.userId) !== String(req.user._id) && req.user.role === 'user') {
      return R.forbidden(res);
    }
    post.isDeleted = true;
    await post.save();
    if (post.mediaId) await cloudinary.uploader.destroy(post.mediaId, { resource_type: post.isVideo ? 'video' : 'image' }).catch(() => {});
    await User.findByIdAndUpdate(post.userId, { $inc: { postsCount: -1 } });
    return R.success(res, {}, 'Post deleted');
  } catch (err) {
    return R.error(res, err.message);
  }
};

// ── REPORT POST ────────────────────────────────────────────
exports.reportPost = async (req, res) => {
  try {
    const { reason } = req.body;
    await Post.findByIdAndUpdate(req.params.postId, {
      $push: { reports: { userId: req.user._id, reason: reason || 'No reason provided' } }
    });
    return R.success(res, {}, 'Post reported. Thank you. 🛡️');
  } catch (err) {
    return R.error(res, err.message);
  }
};
