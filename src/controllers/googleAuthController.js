/**
 * Google OAuth Controller
 * POST /api/auth/google
 *
 * Receives a Google ID token from the frontend,
 * verifies it with Google, finds or creates a user,
 * and returns a GU-Rizz JWT.
 *
 * Setup:
 * 1. Go to console.cloud.google.com → APIs & Services → Credentials
 * 2. Create OAuth 2.0 Client ID (Web application)
 * 3. Add your frontend URL to "Authorized JavaScript origins"
 * 4. Copy the Client ID into your .env as GOOGLE_CLIENT_ID
 */

const { OAuth2Client } = require('google-auth-library');
const User   = require('../models/User');
const { signAccessToken, signRefreshToken } = require('../utils/jwt');
const R      = require('../utils/apiResponse');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const cookieOptions = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

exports.googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return R.badRequest(res, 'Google ID token required');

    // Verify the token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const { email, name, picture, sub: googleId } = payload;
    if (!email) return R.badRequest(res, 'Could not get email from Google');

    // Check if user already exists (by email or googleId)
    let user = await User.findOne({
      $or: [{ personalEmail: email.toLowerCase() }, { googleId }],
    });

    let isNewUser = false;

    if (!user) {
      // ── NEW USER via Google ───────────────────────────────
      // Step 1: Generate a unique username from their Google display name.
      // Strip non-alphanumeric chars, lowercase, cap at 18 chars,
      // then append a number if that username is already taken.
      const base = (name || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')   // replace spaces/special chars with _
        .replace(/_{2,}/g, '_')        // collapse multiple underscores
        .replace(/^_|_$/g, '')         // trim leading/trailing underscores
        .slice(0, 18) || 'user';       // fallback to 'user' if name is empty

      let username = base;
      let counter  = 1;
      // Keep trying username, username1, username2 ... until one is free
      while (await User.findOne({ username })) {
        username = base + counter++;
      }

      // Step 2: Create the user document.
      // NO password field — the conditional validator in User.js
      // skips the password requirement when googleId is present.
      user = await User.create({
        name:            name,
        username,
        personalEmail:   email.toLowerCase(),
        googleId,
        profileImageURL: picture || null,
        // password intentionally omitted — Google users authenticate via token only
        isEmailVerified: true,   // Google already verified this email
        color:           '#c0132a',
        rizzPoints:      0,
        isVibeComplete:  false,  // user fills profile in About section after signup
      });

      isNewUser = true;
    } else {
      // Existing user — update googleId and profile pic if missing
      const updates = {};
      if (!user.googleId)           updates.googleId          = googleId;
      if (!user.profileImageURL && picture) updates.profileImageURL = picture;
      if (!user.isEmailVerified)    updates.isEmailVerified   = true;
      if (Object.keys(updates).length) {
        await User.findByIdAndUpdate(user._id, { $set: updates });
        Object.assign(user, updates);
      }
    }

    if (user.isSuspended) {
      return R.forbidden(res, `Account suspended: ${user.suspendReason || 'Contact support'}`);
    }

    // Issue JWT
    const accessToken  = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);
    res.cookie('accessToken',  accessToken,  cookieOptions);
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });

    // Update last active
    await User.findByIdAndUpdate(user._id, { lastActiveDate: new Date() });

    return R.success(res, {
      user:     user.toPublicProfile(),
      accessToken,
      refreshToken,
      isNewUser,
      requiresVibeProfile: !user.isVibeComplete,
    }, isNewUser ? 'Welcome to GU-Rizz! 🔥' : 'Welcome back! 🔥');

  } catch (err) {
    console.error('Google auth error:', err.message);
    if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
      return R.unauthorized(res, 'Google sign-in expired. Please try again.');
    }
    return R.error(res, 'Google sign-in failed');
  }
};
