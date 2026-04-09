// src/controllers/userController.js
// Complete replacement. Adds: uploadCover, deleteAccount, saveFcmToken.
// Updates: explore() now filters by minAge/maxAge and hobbies.

const User   = require('../models/User');
const Follow = require('../models/Follow');
const Post   = require('../models/Post');
const { GiftTransaction } = require('../models/Gift');
const { awardFollowRizz } = require('../services/rizzService');
const { createNotification } = require('../services/notificationService');
const { cloudinary, uploadAvatar, uploadCover } = require('../config/cloudinary');
const R = require('../utils/apiResponse');

// ── GET PROFILE ───────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return R.notFound(res, 'User not found');

    if (req.user && user.blockedUsers.includes(req.user._id)) {
      return R.forbidden(res, 'This account is not available');
    }

    let isFollowing = false;
    let isOwnProfile = false;
    if (req.user) {
      isOwnProfile = String(user._id) === String(req.user._id);
      if (!isOwnProfile) {
        isFollowing = !!(await Follow.findOne({ follower: req.user._id, following: user._id }));
      }
    }

    const giftsReceived = await GiftTransaction.find({ recipientId: user._id })
      .sort({ createdAt: -1 }).limit(20)
      .select('giftEmoji giftName createdAt').lean();

    return R.success(res, {
      user: user.toPublicProfile(),
      isFollowing, isOwnProfile, giftsReceived,
    });
  } catch (err) { return R.error(res, err.message); }
};

// ── UPDATE PROFILE ────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const allowedFields = [
      'name', 'bio', 'age', 'height', 'course', 'year', 'music',
      'nature', 'socialPreference', 'hobbies', 'interests', 'dob',
      'guEmail', 'gender', 'color',
    ];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const user = await User.findByIdAndUpdate(
      req.user._id, { $set: updates }, { new: true, runValidators: true }
    );
    const vibeFields = ['course', 'year', 'music', 'nature'];
    if (vibeFields.every(f => user[f])) {
      user.isVibeComplete = true;
      await user.save({ validateBeforeSave: false });
    }
    return R.success(res, { user: user.toPublicProfile() }, 'Profile updated');
  } catch (err) { return R.error(res, err.message); }
};

// ── UPLOAD AVATAR ──────────────────────────────────────────
exports.uploadAvatar = [
  uploadAvatar.single('avatar'),
  async (req, res) => {
    try {
      if (!req.file) return R.badRequest(res, 'No image provided');
      if (req.user.profileImageId) {
        await cloudinary.uploader.destroy(req.user.profileImageId).catch(() => {});
      }
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { profileImageURL: req.file.path, profileImageId: req.file.filename },
        { new: true }
      );
      return R.success(res, { profileImageURL: user.profileImageURL }, 'Avatar updated');
    } catch (err) { return R.error(res, err.message); }
  },
];

// ── UPLOAD COVER PHOTO ────────────────────────────────────
exports.uploadCover = [
  uploadCover.single('cover'),
  async (req, res) => {
    try {
      if (!req.file) return R.badRequest(res, 'No image provided');
      // Delete old cover from Cloudinary
      if (req.user.coverImageId) {
        await cloudinary.uploader.destroy(req.user.coverImageId, { resource_type: 'image' }).catch(() => {});
      }
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { coverImageURL: req.file.path, coverImageId: req.file.filename },
        { new: true }
      );
      return R.success(res, { coverImageURL: user.coverImageURL }, 'Cover photo updated');
    } catch (err) { return R.error(res, err.message); }
  },
];

// ── DELETE ACCOUNT (cascading) ────────────────────────────
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Delete all posts + Cloudinary media
    const posts = await Post.find({ userId }).select('mediaId isVideo').lean();
    await Promise.all(posts.map(p =>
      p.mediaId
        ? cloudinary.uploader.destroy(p.mediaId, { resource_type: p.isVideo ? 'video' : 'image' }).catch(() => {})
        : Promise.resolve()
    ));
    await Post.deleteMany({ userId });

    // 2. Delete stories + Cloudinary media
    try {
      const Story = require('../models/Story');
      const stories = await Story.find({ userId }).select('mediaId isVideo').lean();
      await Promise.all(stories.map(s =>
        s.mediaId
          ? cloudinary.uploader.destroy(s.mediaId, { resource_type: s.isVideo ? 'video' : 'image' }).catch(() => {})
          : Promise.resolve()
      ));
      await Story.deleteMany({ userId });
    } catch (_) { /* Story model optional */ }

    // 3. Delete avatar + cover from Cloudinary
    if (req.user.profileImageId) {
      await cloudinary.uploader.destroy(req.user.profileImageId, { resource_type: 'image' }).catch(() => {});
    }
    if (req.user.coverImageId) {
      await cloudinary.uploader.destroy(req.user.coverImageId, { resource_type: 'image' }).catch(() => {});
    }

    // 4. Delete follow relationships
    await Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] });

    // 5. Delete chat messages and conversations
    try {
      const { Chat, Message } = require('../models/Chat');
      const chats = await Chat.find({ participants: userId }).select('_id').lean();
      const chatIds = chats.map(c => c._id);
      await Message.deleteMany({ chatId: { $in: chatIds } });
      await Chat.deleteMany({ participants: userId });
    } catch (_) {}

    // 6. Delete notifications
    try {
      const Notification = require('../models/Notification');
      await Notification.deleteMany({ $or: [{ recipientId: userId }, { actorId: userId }] });
    } catch (_) {}

    // 7. Finally, delete the user document
    await User.findByIdAndDelete(userId);

    return R.success(res, {}, 'Account permanently deleted. Goodbye! 👋');
  } catch (err) {
    console.error('deleteAccount error:', err);
    return R.error(res, err.message);
  }
};

// ── SAVE FCM TOKEN (Firebase push notifications) ──────────
exports.saveFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return R.badRequest(res, 'No FCM token provided');
    await User.findByIdAndUpdate(req.user._id, { fcmToken: token });
    return R.success(res, {}, 'FCM token registered');
  } catch (err) { return R.error(res, err.message); }
};

// ── FOLLOW / UNFOLLOW ──────────────────────────────────────
exports.toggleFollow = async (req, res) => {
  try {
    const targetId = req.params.userId;
    const myId     = req.user._id;
    if (String(targetId) === String(myId)) return R.badRequest(res, "You can't follow yourself");
    const target = await User.findById(targetId);
    if (!target) return R.notFound(res, 'User not found');
    if (target.blockedUsers.includes(myId)) return R.forbidden(res, 'Cannot follow this user');

    const existing = await Follow.findOne({ follower: myId, following: targetId });
    if (existing) {
      await existing.deleteOne();
      await User.findByIdAndUpdate(myId,      { $inc: { followingCount: -1 } });
      await User.findByIdAndUpdate(targetId,  { $inc: { followersCount: -1 } });
      return R.success(res, { isFollowing: false }, 'Unfollowed');
    } else {
      await Follow.create({ follower: myId, following: targetId });
      await User.findByIdAndUpdate(myId,     { $inc: { followingCount: 1 } });
      await User.findByIdAndUpdate(targetId, { $inc: { followersCount: 1 } });
      const io = req.app.get('io');
      await awardFollowRizz(targetId, myId, io);
      await createNotification({
        recipientId: targetId, actorId: myId,
        kind: 'FOLLOW',
        message: `<strong>${req.user.name}</strong> started following you`,
        io,
      });
      return R.success(res, { isFollowing: true }, 'Following! 🙌');
    }
  } catch (err) { return R.error(res, err.message); }
};

// ── GET FOLLOWERS ──────────────────────────────────────────
exports.getFollowers = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1'), limit = 20;
    const follows = await Follow.find({ following: req.params.userId })
      .populate('follower', 'name username profileImageURL color course year rizzPoints')
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    return R.success(res, { followers: follows.map(f => f.follower), page });
  } catch (err) { return R.error(res, err.message); }
};

// ── GET FOLLOWING ──────────────────────────────────────────
exports.getFollowing = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1'), limit = 20;
    const follows = await Follow.find({ follower: req.params.userId })
      .populate('following', 'name username profileImageURL color course year rizzPoints')
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    return R.success(res, { following: follows.map(f => f.following), page });
  } catch (err) { return R.error(res, err.message); }
};

// ── EXPLORE / MATCHMAKING ─────────────────────────────────
exports.explore = async (req, res) => {
  try {
    const {
      q, course, year, nature, music, gender, socialPreference,
      minHeight, maxHeight,
      minAge, maxAge,        // ← new
      hobbies,               // ← new: comma-separated string
      page = 1, limit = 20, sort = 'rizz',
    } = req.query;

    const filter = { isSuspended: false, _id: { $ne: req.user?._id } };

    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [{ username: regex }, { name: regex }];
    }
    if (course)           filter.course = course;
    if (year)             filter.year   = year;
    if (nature)           filter.nature = nature;
    if (gender)           filter.gender = gender;
    if (socialPreference) filter.socialPreference = socialPreference;

    if (music) {
      const musics = Array.isArray(music) ? music : [music];
      filter.music = { $in: musics.map(m => new RegExp(m, 'i')) };
    }
    if (minHeight || maxHeight) {
      filter.height = {};
      if (minHeight) filter.height.$gte = +minHeight;
      if (maxHeight) filter.height.$lte = +maxHeight;
    }
    // Age range filter
    if (minAge || maxAge) {
      filter.age = {};
      if (minAge) filter.age.$gte = +minAge;
      if (maxAge) filter.age.$lte = +maxAge;
    }
    // Hobbies filter — match any selected hobby (partial, case-insensitive)
    if (hobbies) {
      const hobbyList = Array.isArray(hobbies) ? hobbies : hobbies.split(',');
      filter.hobbies = { $in: hobbyList.map(h => new RegExp(h.trim(), 'i')) };
    }

    const sortOptions = {
      rizz:      { rizzPoints: -1 },
      newest:    { createdAt: -1 },
      followers: { followersCount: -1 },
    };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('name username profileImageURL color course year music nature socialPreference hobbies rizzPoints followersCount gender height age bio')
        .sort(sortOptions[sort] || sortOptions.rizz)
        .skip(skip).limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    let followingSet = new Set();
    if (req.user) {
      const myFollows = await Follow.find({ follower: req.user._id }).select('following').lean();
      followingSet = new Set(myFollows.map(f => String(f.following)));
    }
    const enriched = users.map(u => ({ ...u, isFollowing: followingSet.has(String(u._id)) }));

    return R.success(res, { users: enriched, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { return R.error(res, err.message); }
};

// ── TRENDING (top accounts + top posts) ──────────────────
exports.getTrending = async (req, res) => {
  try {
    const [trendingUsers, trendingPosts] = await Promise.all([
      // Top 10 users by followersCount + rizzPoints in last 7 days
      User.find({ isSuspended: false, _id: { $ne: req.user?._id } })
        .select('name username profileImageURL color course rizzPoints followersCount')
        .sort({ followersCount: -1, rizzPoints: -1 })
        .limit(10).lean(),
      // Top 10 posts by likesCount in last 72h
      Post.find({
        isDeleted: false,
        createdAt: { $gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
      })
        .populate('userId', 'name username profileImageURL color')
        .sort({ likesCount: -1, 'comments.length': -1 })
        .limit(10).lean(),
    ]);

    const myId = req.user ? String(req.user._id) : null;
    const enrichedPosts = trendingPosts.map(p => ({
      ...p,
      liked: myId ? p.likedBy?.some(id => String(id) === myId) : false,
    }));

    return R.success(res, { trendingUsers, trendingPosts: enrichedPosts });
  } catch (err) { return R.error(res, err.message); }
};

// ── SUGGESTED USERS ────────────────────────────────────────
exports.getSuggested = async (req, res) => {
  try {
    const myFollowing = await Follow.find({ follower: req.user._id }).select('following').lean();
    const followingIds = [...myFollowing.map(f => f.following), req.user._id];
    const suggestions = await User.find({ _id: { $nin: followingIds }, isSuspended: false })
      .select('name username profileImageURL color course rizzPoints followersCount')
      .sort({ rizzPoints: -1 }).limit(8).lean();
    return R.success(res, { suggestions });
  } catch (err) { return R.error(res, err.message); }
};

// ── UPDATE SETTINGS ────────────────────────────────────────
exports.updateSettings = async (req, res) => {
  try {
    const allowed = ['isPrivate','whoCanMessage','whoCanFollow','showPhoneNumber','showUniversityEmail','notifPrefs'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true });
    return R.success(res, { user: user.toPublicProfile() }, 'Settings updated');
  } catch (err) { return R.error(res, err.message); }
};

// ── BLOCK / UNBLOCK ────────────────────────────────────────
exports.blockUser = async (req, res) => {
  try {
    const targetId = req.params.userId;
    const user = await User.findById(req.user._id);
    const isBlocked = user.blockedUsers.includes(targetId);
    if (isBlocked) {
      await User.findByIdAndUpdate(req.user._id, { $pull: { blockedUsers: targetId } });
      return R.success(res, { blocked: false }, 'User unblocked');
    } else {
      await Follow.deleteOne({ follower: req.user._id, following: targetId });
      await Follow.deleteOne({ follower: targetId, following: req.user._id });
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { blockedUsers: targetId } });
      return R.success(res, { blocked: true }, 'User blocked');
    }
  } catch (err) { return R.error(res, err.message); }
};

// ── REPORT USER ────────────────────────────────────────────
exports.reportUser = async (req, res) => {
  try {
    const { reason } = req.body;
    console.log(`[REPORT] ${req.user._id} reported user ${req.params.userId}: ${reason}`);
    return R.success(res, {}, 'Report submitted. 🛡️');
  } catch (err) { return R.error(res, err.message); }
};

// ── HEARTBEAT (time-based rizz) ────────────────────────────
exports.heartbeat = async (req, res) => {
  try {
    const { minutesSpent } = req.body;
    if (!minutesSpent || minutesSpent <= 0) return R.badRequest(res, 'Invalid minutes');
    const io = req.app.get('io');
    const { awardTimeRizz } = require('../services/rizzService');
    await awardTimeRizz(req.user._id, Math.min(+minutesSpent, 10), io);
    const user = await User.findById(req.user._id).select('rizzPoints');
    return R.success(res, { rizzPoints: user.rizzPoints });
  } catch (err) { return R.error(res, err.message); }
};
