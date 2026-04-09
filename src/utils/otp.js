const crypto = require('crypto');

// Generate a 6-digit numeric OTP
const generateOTP = () =>
  String(Math.floor(100000 + Math.random() * 900000));

// Generate secure random token for email verify / password reset
const generateToken = () => crypto.randomBytes(32).toString('hex');

// Send OTP via Twilio (gracefully skips if Twilio not configured)
const sendSmsOtp = async (phoneNumber, otp) => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('⚠️  Twilio not configured — OTP:', otp, '(dev only)');
    return;
  }
  const twilio = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  await twilio.messages.create({
    body: `Your GU-Rizz verification code is: ${otp}. Valid for 10 minutes. 🔥`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to:   phoneNumber,
  });
};

module.exports = { generateOTP, generateToken, sendSmsOtp };
