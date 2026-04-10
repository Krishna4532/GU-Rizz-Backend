// src/controllers/authController.js
// Optimised: parallel uniqueness checks, lean queries, no redundant saves on login.
const crypto = require('crypto');
const User   = require('../models/User');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { generateOTP, generateToken, sendSmsOtp } = require('../utils/otp');
const R = require('../utils/apiResponse');
 
const cookieOptions = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};
 
const sendTokens = (res, user) => {
  const accessToken  = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  res.cookie('accessToken',  accessToken,  cookieOptions);
  res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
  return { accessToken, refreshToken };
};
 
// ── SIGNUP ────────────────────────────────────────────────
exports.signup = async (req, res) => {
  try {
    const { name, username, personalEmail, phoneNumber, password, guEmail, gender } = req.body;
 
    // OPTIMISATION: run both uniqueness checks in parallel (was 2 sequential queries)
    const [usernameExists, emailExists] = await Promise.all([
      User.findOne({ username: username.toLowerCase() }).select('_id').lean(),
      User.findOne({ personalEmail: personalEmail.toLowerCase() }).select('_id').lean(),
    ]);
    if (usernameExists) return R.badRequest(res, 'Username already taken');
    if (emailExists)   return R.badRequest(res, 'Email already registered');
 
    const user = await User.create({
      name: name.trim(),
      username: username.toLowerCase().trim(),
      personalEmail: personalEmail.toLowerCase().trim(),
      phoneNumber: phoneNumber || null,
      guEmail: guEmail || null,
      gender: gender || '',
      password,
      color: '#c0132a',
    });
 
    // Fire verification email without blocking the response
    const verifyToken = generateToken();
    user.emailVerifyToken   = crypto.createHash('sha256').update(verifyToken).digest('hex');
    user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    // Non-blocking save + email
    user.save({ validateBeforeSave: false }).then(() => {
      sendVerificationEmail(user, verifyToken).catch(e =>
        console.error('Verification email failed (non-fatal):', e.message)
      );
    }).catch(() => {});
 
    const tokens = sendTokens(res, user);
    return R.created(res, {
      user: user.toPublicProfile(),
      ...tokens,
      requiresVibeProfile: true,
    }, 'Account created! Please complete your Vibe Profile.');
  } catch (err) {
    console.error('signup error:', err);
    return R.error(res, err.message);
  }
};
 
// ── LOGIN ─────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
 
    // Single query with +password, no extra save for lastActiveDate on login
    const user = await User.findOne({
      $or: [
        { personalEmail: identifier.toLowerCase() },
        { username:      identifier.toLowerCase() },
      ],
    }).select('+password');
 
    if (!user || !(await user.comparePassword(password))) {
      return R.unauthorized(res, 'Invalid username/email or password');
    }
    if (user.isSuspended) {
      return R.forbidden(res, `Account suspended: ${user.suspendReason || 'Contact support'}`);
    }
 
    // OPTIMISATION: fire lastActiveDate update without blocking response
    User.findByIdAndUpdate(user._id, { lastActiveDate: new Date() }).catch(() => {});
 
    const tokens = sendTokens(res, user);
    return R.success(res, {
      user: user.toPublicProfile(),
      ...tokens,
      requiresVibeProfile: !user.isVibeComplete,
    }, 'Welcome back! 🔥');
  } catch (err) {
    console.error('login error:', err);
    return R.error(res, err.message);
  }
};
 
// ── VIBE PROFILE ─────────────────────────────────────────
exports.completeVibeProfile = async (req, res) => {
  try {
    const { age, dob, height, course, year, music, nature, socialPreference, hobbies, interests, bio, gender } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          age:              age ? +age : undefined,
          dob:              dob || undefined,
          height:           height ? +height : undefined,
          course:           course || undefined,
          year:             year || undefined,
          music:            music || undefined,
          nature:           nature || undefined,
          socialPreference: socialPreference || undefined,
          hobbies:          Array.isArray(hobbies) ? hobbies : (hobbies ? [hobbies] : []),
          interests:        Array.isArray(interests) ? interests : (interests ? [interests] : []),
          bio:              bio || '',
          gender:           gender || undefined,
          isVibeComplete:   true,
        },
      },
      { new: true, runValidators: true }
    );
    return R.success(res, { user: user.toPublicProfile() }, 'Vibe Profile complete! Time to spark 🔥');
  } catch (err) { return R.error(res, err.message); }
};
 
// ── LOGOUT ────────────────────────────────────────────────
exports.logout = async (req, res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  return R.success(res, {}, 'Logged out successfully');
};
 
// ── REFRESH TOKEN ─────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) return R.unauthorized(res, 'No refresh token');
    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.id).select('_id name username isSuspended isVibeComplete').lean();
    if (!user) return R.unauthorized(res, 'User not found');
    const tokens = sendTokens(res, user);
    return R.success(res, tokens, 'Token refreshed');
  } catch { return R.unauthorized(res, 'Invalid or expired refresh token'); }
};
 
// ── VERIFY EMAIL ──────────────────────────────────────────
exports.verifyEmail = async (req, res) => {
  try {
    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      emailVerifyToken:   hashed,
      emailVerifyExpires: { $gt: Date.now() },
    }).select('+emailVerifyToken +emailVerifyExpires');
    if (!user) return R.badRequest(res, 'Invalid or expired verification link');
    user.isEmailVerified  = true;
    user.emailVerifyToken  = undefined;
    user.emailVerifyExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return R.success(res, {}, 'Email verified! ✅');
  } catch (err) { return R.error(res, err.message); }
};
 
// ── RESEND VERIFY ─────────────────────────────────────────
exports.resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+emailVerifyToken +emailVerifyExpires');
    if (user.isEmailVerified) return R.badRequest(res, 'Email already verified');
    const token = generateToken();
    user.emailVerifyToken  = crypto.createHash('sha256').update(token).digest('hex');
    user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    await sendVerificationEmail(user, token);
    return R.success(res, {}, 'Verification email sent!');
  } catch (err) { return R.error(res, err.message); }
};
 
// ── SEND PHONE OTP ────────────────────────────────────────
exports.sendPhoneOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const otp = generateOTP();
    const user = await User.findById(req.user._id).select('+phoneOtp +phoneOtpExpires');
    user.phoneNumber     = phoneNumber;
    user.phoneOtp        = crypto.createHash('sha256').update(otp).digest('hex');
    user.phoneOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    await sendSmsOtp(phoneNumber, otp);
    return R.success(res, {}, 'OTP sent!');
  } catch (err) { return R.error(res, err.message); }
};
 
// ── VERIFY PHONE OTP ──────────────────────────────────────
exports.verifyPhoneOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const hashed = crypto.createHash('sha256').update(otp).digest('hex');
    const user = await User.findById(req.user._id).select('+phoneOtp +phoneOtpExpires');
    if (!user.phoneOtp || user.phoneOtpExpires < Date.now()) return R.badRequest(res, 'OTP expired');
    if (user.phoneOtp !== hashed) return R.badRequest(res, 'Invalid OTP');
    user.isPhoneVerified = true;
    user.phoneOtp        = undefined;
    user.phoneOtpExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return R.success(res, {}, 'Phone verified! ✅');
  } catch (err) { return R.error(res, err.message); }
};
 
// ── FORGOT PASSWORD ───────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ personalEmail: email.toLowerCase() });
    if (!user) return R.success(res, {}, 'If that email exists, a reset link has been sent.');
    const token = generateToken();
    user.passwordResetToken   = crypto.createHash('sha256').update(token).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    await sendPasswordResetEmail(user, token);
    return R.success(res, {}, 'If that email exists, a reset link has been sent.');
  } catch (err) { return R.error(res, err.message); }
};
 
// ── RESET PASSWORD ────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken:   hashed,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires');
    if (!user) return R.badRequest(res, 'Invalid or expired reset token');
    user.password             = req.body.password;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    const tokens = sendTokens(res, user);
    return R.success(res, tokens, 'Password reset successful!');
  } catch (err) { return R.error(res, err.message); }
};
 
// ── GET ME ────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    // req.user already loaded by protect middleware — no extra DB call needed
    return R.success(res, { user: req.user.toPublicProfile() });
  } catch (err) { return R.error(res, err.message); }
};
