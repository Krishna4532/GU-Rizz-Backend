const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 min

// General API limiter
const apiLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { success: false, message: 'Too many auth attempts. Please wait 15 minutes.' },
  skipSuccessfulRequests: true,
});

// OTP limiter
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 3,
  message: { success: false, message: 'Too many OTP requests. Please wait 10 minutes.' },
});

// Post creation limiter
const postLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 5,
  message: { success: false, message: 'Posting too fast. Slow down a little 😅' },
});

// Message limiter
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Sending messages too fast.' },
});

module.exports = { apiLimiter, authLimiter, otpLimiter, postLimiter, messageLimiter };
