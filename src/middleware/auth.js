const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const { unauthorized, forbidden } = require('../utils/apiResponse');

// Verify JWT and attach user to req
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) return unauthorized(res, 'Authentication required');

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select('-password -emailVerifyToken -phoneOtp -passwordResetToken');

    if (!user) return unauthorized(res, 'User not found');
    if (user.isSuspended) return forbidden(res, 'Account suspended: ' + (user.suspendReason || 'Contact support'));

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    return unauthorized(res, 'Invalid token');
  }
};

// Require vibe profile completion for certain routes
const requireVibeProfile = (req, res, next) => {
  if (!req.user.isVibeComplete) {
    return res.status(403).json({
      success: false,
      message: 'Complete your Vibe Profile first',
      redirectTo: '/onboarding/vibe',
    });
  }
  next();
};

// Role-based access
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return forbidden(res, 'Insufficient permissions');
  }
  next();
};

// Optional auth — attaches user if token present, doesn't block if not
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }
    if (token) {
      const decoded = verifyAccessToken(token);
      req.user = await User.findById(decoded.id).select('-password');
    }
  } catch { /* ignore */ }
  next();
};

module.exports = { protect, requireVibeProfile, requireRole, optionalAuth };
