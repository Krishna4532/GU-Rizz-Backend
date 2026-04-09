const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendEmail = async ({ to, subject, html, text }) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to, subject, html, text,
  });
};

const sendVerificationEmail = async (user, token) => {
  const url = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: user.personalEmail,
    subject: '✅ Verify your GU-Rizz account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;background:#0d0d11;color:#f0f0f5;border-radius:16px;">
        <h1 style="font-size:24px;font-weight:800;background:linear-gradient(135deg,#fff,#e01830);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">GU-Rizz 🔥</h1>
        <p style="color:#8a8a9a;">Hey ${user.name.split(' ')[0]}, welcome aboard!</p>
        <p>Click the button below to verify your email and unlock your full GU-Rizz experience.</p>
        <a href="${url}" style="display:inline-block;margin:1.5rem 0;padding:14px 28px;background:#c0132a;color:#fff;border-radius:12px;text-decoration:none;font-weight:700;">Verify Email ⚡</a>
        <p style="font-size:12px;color:#4a4a5a;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
      </div>`,
  });
};

const sendPasswordResetEmail = async (user, token) => {
  const url = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: user.personalEmail,
    subject: '🔑 Reset your GU-Rizz password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;background:#0d0d11;color:#f0f0f5;border-radius:16px;">
        <h1 style="font-size:24px;font-weight:800;color:#e01830;">GU-Rizz 🔥</h1>
        <p>You requested a password reset. Click below — this link expires in 1 hour.</p>
        <a href="${url}" style="display:inline-block;margin:1.5rem 0;padding:14px 28px;background:#c0132a;color:#fff;border-radius:12px;text-decoration:none;font-weight:700;">Reset Password</a>
        <p style="font-size:12px;color:#4a4a5a;">If you didn't request this, your account is safe — just ignore this email.</p>
      </div>`,
  });
};

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail };
