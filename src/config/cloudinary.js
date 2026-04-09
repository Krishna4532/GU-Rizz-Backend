// src/config/cloudinary.js
// Replace the existing file entirely.
// Adds: coverStorage, storyStorage, uploadCover, uploadStory exports.

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Post media (images + videos) ─────────────────────────
const postStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'gu-rizz/posts',
    resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm'],
    transformation: file.mimetype.startsWith('video/')
      ? [{ width: 1080, crop: 'limit' }]
      : [{ width: 1080, crop: 'limit', quality: 'auto:good' }],
  }),
});

// ── Avatar images ─────────────────────────────────────────
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'gu-rizz/avatars',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto:good' }],
  },
});

// ── Cover photo (1200×400 banner) ─────────────────────────
const coverStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'gu-rizz/covers',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 400, crop: 'fill', quality: 'auto:good' }],
  },
});

// ── Story media (photo or short video, 24h lifespan) ──────
const storyStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'gu-rizz/stories',
    resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm'],
    transformation: file.mimetype.startsWith('video/')
      ? [{ width: 720, crop: 'limit', duration: 30 }]   // cap stories at 30s
      : [{ width: 1080, crop: 'limit', quality: 'auto:good' }],
  }),
});

// ── Chat media ────────────────────────────────────────────
const chatStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'gu-rizz/chat',
    resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm', 'mp3', 'ogg', 'm4a'],
    transformation: file.mimetype.startsWith('image/')
      ? [{ width: 800, crop: 'limit', quality: 'auto:good' }]
      : [],
  }),
});

const uploadPost   = multer({ storage: postStorage,   limits: { fileSize: 100 * 1024 * 1024 } });
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 5   * 1024 * 1024 } });
const uploadCover  = multer({ storage: coverStorage,  limits: { fileSize: 10  * 1024 * 1024 } });
const uploadStory  = multer({ storage: storyStorage,  limits: { fileSize: 50  * 1024 * 1024 } });
const uploadChat   = multer({ storage: chatStorage,   limits: { fileSize: 50  * 1024 * 1024 } });

module.exports = { cloudinary, uploadPost, uploadAvatar, uploadCover, uploadStory, uploadChat };
