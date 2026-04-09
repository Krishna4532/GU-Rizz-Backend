const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const { body } = require('express-validator');

// ── PUBLIC ────────────────────────────────────────────────
router.post('/signup', authLimiter, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('username').trim().notEmpty().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Username: 3-30 chars, letters/numbers/underscore only'),
  body('personalEmail').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password: min 6 characters'),
], validate, ctrl.signup);

router.post('/login', authLimiter, [
  body('identifier').notEmpty().withMessage('Username or email required'),
  body('password').notEmpty().withMessage('Password required'),
], validate, ctrl.login);

router.post('/refresh-token', ctrl.refreshToken);
router.get('/verify-email/:token', ctrl.verifyEmail);
router.post('/forgot-password', authLimiter, [body('email').isEmail()], validate, ctrl.forgotPassword);
router.post('/reset-password/:token', [body('password').isLength({ min: 6 })], validate, ctrl.resetPassword);

// ── PROTECTED ─────────────────────────────────────────────
router.use(protect);

router.post('/logout',          ctrl.logout);
router.get('/me',               ctrl.getMe);
router.post('/complete-vibe',   ctrl.completeVibeProfile);
router.post('/resend-verify',   ctrl.resendVerification);
router.post('/send-otp',        otpLimiter, ctrl.sendPhoneOtp);
router.post('/verify-otp',      ctrl.verifyPhoneOtp);

module.exports = router;
