// backend/src/models/User.js
// Drop-in replacement — adds coverImageURL/Id + fcmToken fields.
// All other fields (phoneNumber, gender, hobbies, socialPreference) were
// already present in the original schema.

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // ── ACCOUNT ──────────────────────────────────────────
  name:           { type: String, required: true, trim: true, maxlength: 80 },
  username:       { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 30, match: /^[a-z0-9_]+$/ },
  personalEmail:  { type: String, required: true, unique: true, lowercase: true, trim: true },
  guEmail:        { type: String, default: null, lowercase: true, trim: true },
  phoneNumber:    { type: String, required: true, trim: true },   // now MANDATORY
  password:       { type: String, required: true, minlength: 6, select: false },
  color:          { type: String, default: '#c0132a' },

  // ── VIBE PROFILE ─────────────────────────────────────
  age:              { type: Number, min: 16, max: 60 },
  dob:              { type: String, default: null },
  height:           { type: Number, min: 100, max: 250 },
  course:           { type: String, trim: true },
  year:             { type: String, trim: true },
  music:            { type: String, trim: true },
  nature:           { type: String, enum: ['Introvert','Extrovert','Ambivert',''], default: '' },
  socialPreference: { type: String, enum: ['Likes crowd','Likes being alone','Balanced',''], default: '' },
  hobbies:          [{ type: String, trim: true }],
  interests:        [{ type: String, trim: true }],
  bio:              { type: String, maxlength: 300, default: '' },
  gender:           { type: String, enum: ['Male','Female','Non-binary','Other','Prefer not to say',''], default: '' },

  // ── PROFILE IMAGES ────────────────────────────────────
  profileImageURL: { type: String, default: null },
  profileImageId:  { type: String, default: null },
  coverImageURL:   { type: String, default: null },   // ← NEW
  coverImageId:    { type: String, default: null },   // ← NEW (Cloudinary public_id)

  isVibeComplete:  { type: Boolean, default: false },
  isVerified:      { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },

  // ── GAMIFICATION ──────────────────────────────────────
  rizzPoints:     { type: Number, default: 0, min: 0 },
  rizzStreak:     { type: Number, default: 0 },
  lastActiveDate: { type: Date, default: null },
  sessionMinutes: { type: Number, default: 0 },

  // ── SOCIAL GRAPH ──────────────────────────────────────
  followersCount:     { type: Number, default: 0 },
  followingCount:     { type: Number, default: 0 },
  postsCount:         { type: Number, default: 0 },
  giftsReceivedCount: { type: Number, default: 0 },

  // ── PUSH NOTIFICATIONS (Firebase FCM) ─────────────────
  fcmToken:  { type: String, default: null, select: false },  // ← NEW

  // ── PRIVACY & SETTINGS ────────────────────────────────
  isPrivate:           { type: Boolean, default: false },
  whoCanMessage:       { type: String, enum: ['everyone','followers','nobody'], default: 'everyone' },
  whoCanFollow:        { type: String, enum: ['everyone','nobody'], default: 'everyone' },
  showPhoneNumber:     { type: Boolean, default: false },
  showUniversityEmail: { type: Boolean, default: false },
  blockedUsers:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  mutedUsers:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  notifPrefs: {
    follows:    { type: Boolean, default: true },
    likes:      { type: Boolean, default: true },
    comments:   { type: Boolean, default: true },
    gifts:      { type: Boolean, default: true },
    messages:   { type: Boolean, default: true },
    rizzPoints: { type: Boolean, default: true },
  },

  // ── OTP & VERIFICATION TOKENS ─────────────────────────
  emailVerifyToken:     { type: String, select: false },
  emailVerifyExpires:   { type: Date,   select: false },
  phoneOtp:             { type: String, select: false },
  phoneOtpExpires:      { type: Date,   select: false },
  passwordResetToken:   { type: String, select: false },
  passwordResetExpires: { type: Date,   select: false },

  // ── ADMIN ─────────────────────────────────────────────
  role:          { type: String, enum: ['user','moderator','admin'], default: 'user' },
  isSuspended:   { type: Boolean, default: false },
  suspendedAt:   { type: Date, default: null },
  suspendReason: { type: String, default: null },
}, {
  timestamps: true,
  toJSON:  { virtuals: true },
  toObject:{ virtuals: true },
});

// ── INDEXES ──────────────────────────────────────────────
userSchema.index({ username: 1 });
userSchema.index({ personalEmail: 1 });
userSchema.index({ rizzPoints: -1 });
userSchema.index({ course: 1, year: 1 });
userSchema.index({ nature: 1 });
userSchema.index({ music: 1 });
userSchema.index({ gender: 1 });
userSchema.index({ age: 1 });
userSchema.index({ hobbies: 1 });
userSchema.index({ socialPreference: 1 });
userSchema.index({ createdAt: -1 });

// ── PASSWORD HASH ─────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── SAFE PUBLIC PROFILE ───────────────────────────────────
userSchema.methods.toPublicProfile = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerifyToken;
  delete obj.phoneOtp;
  delete obj.passwordResetToken;
  delete obj.fcmToken;
  delete obj.blockedUsers;
  if (!obj.showPhoneNumber)     delete obj.phoneNumber;
  if (!obj.showUniversityEmail) delete obj.guEmail;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
