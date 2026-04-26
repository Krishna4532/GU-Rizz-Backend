const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({

  // ── ACCOUNT ─────────────────────────────────────────────
  name:          { type: String, required: true, trim: true, maxlength: 80 },
  username:      {
    type: String, required: true, unique: true,
    trim: true, lowercase: true,
    minlength: 3, maxlength: 30,
    match: /^[a-z0-9_]+$/,
  },
  personalEmail: { type: String, required: true, unique: true, lowercase: true, trim: true },
  guEmail:       { type: String, default: null, lowercase: true, trim: true },
  phoneNumber:   { type: String, default: null, trim: true },
  password:      { type: String, required: true, minlength: 6, select: false },
  color:         { type: String, default: '#c0132a' },

  // ── GOOGLE OAUTH ─────────────────────────────────────────
  // Populated when user signs in via Google.
  // sparse: true means only non-null values are indexed (avoids unique constraint
  // errors for users who signed up with email and have googleId = null).
  googleId: { type: String, default: null, sparse: true },

  // ── VIBE PROFILE (completed from About/Profile section) ──
  age:              { type: Number, min: 16, max: 60 },
  dob:              { type: String, default: null },
  height:           { type: Number, min: 100, max: 250 },   // cm
  course:           { type: String, trim: true },
  year:             { type: String, trim: true },
  music:            { type: String, trim: true },
  nature:           { type: String, enum: ['Introvert','Extrovert','Ambivert',''], default: '' },
  socialPreference: { type: String, enum: ['Likes crowd','Likes being alone','Balanced',''], default: '' },
  hobbies:          [{ type: String, trim: true }],
  interests:        [{ type: String, trim: true }],
  bio:              { type: String, maxlength: 300, default: '' },
  gender:           {
    type: String,
    enum: ['Male','Female','Non-binary','Other','Prefer not to say',''],
    default: '',
  },

  // ── PROFILE IMAGES ───────────────────────────────────────
  profileImageURL: { type: String, default: null },
  profileImageId:  { type: String, default: null },    // Cloudinary public_id for deletion
  coverImageURL:   { type: String, default: null },
  coverImageId:    { type: String, default: null },    // Cloudinary public_id for deletion

  // ── VERIFICATION FLAGS ───────────────────────────────────
  isVibeComplete:  { type: Boolean, default: false },  // profile fully filled?
  isVerified:      { type: Boolean, default: false },  // GU email verified badge
  isEmailVerified: { type: Boolean, default: false },  // personal email verified
  isPhoneVerified: { type: Boolean, default: false },

  // ── GAMIFICATION ─────────────────────────────────────────
  rizzPoints:    { type: Number, default: 0, min: 0 },
  rizzStreak:    { type: Number, default: 0 },
  lastActiveDate:{ type: Date,   default: null },
  sessionMinutes:{ type: Number, default: 0 },

  // ── SOCIAL GRAPH COUNTS (denormalised for fast reads) ────
  followersCount:   { type: Number, default: 0 },
  followingCount:   { type: Number, default: 0 },
  postsCount:       { type: Number, default: 0 },
  giftsReceivedCount: { type: Number, default: 0 },

  // ── PRIVACY & SETTINGS ───────────────────────────────────
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

  // ── PUSH NOTIFICATIONS ───────────────────────────────────
  fcmToken: { type: String, default: null },   // Firebase Cloud Messaging token

  // ── OTP & VERIFICATION TOKENS (never returned in API) ────
  emailVerifyToken:     { type: String, select: false },
  emailVerifyExpires:   { type: Date,   select: false },
  phoneOtp:             { type: String, select: false },
  phoneOtpExpires:      { type: Date,   select: false },
  passwordResetToken:   { type: String, select: false },
  passwordResetExpires: { type: Date,   select: false },

  // ── ADMIN / MODERATION ───────────────────────────────────
  role:          { type: String, enum: ['user','moderator','admin'], default: 'user' },
  isSuspended:   { type: Boolean, default: false },
  suspendedAt:   { type: Date,    default: null },
  suspendReason: { type: String,  default: null },

}, {
  timestamps: true,
  toJSON:  { virtuals: true },
  toObject:{ virtuals: true },
});

// ── INDEXES ──────────────────────────────────────────────
userSchema.index({ username:      1 });
userSchema.index({ personalEmail: 1 });
userSchema.index({ googleId:      1 }, { sparse: true });   // Google OAuth lookup
userSchema.index({ rizzPoints:   -1 });
userSchema.index({ course: 1, year: 1 });
userSchema.index({ nature:        1 });
userSchema.index({ music:         1 });
userSchema.index({ createdAt:    -1 });

// ── PASSWORD HASHING (pre-save hook) ─────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── COMPARE PASSWORD ──────────────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── SAFE PUBLIC PROFILE ───────────────────────────────────
// Strips sensitive fields before sending to frontend
userSchema.methods.toPublicProfile = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerifyToken;
  delete obj.emailVerifyExpires;
  delete obj.phoneOtp;
  delete obj.phoneOtpExpires;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.blockedUsers;
  if (!obj.showPhoneNumber)     delete obj.phoneNumber;
  if (!obj.showUniversityEmail) delete obj.guEmail;
  return obj;
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
