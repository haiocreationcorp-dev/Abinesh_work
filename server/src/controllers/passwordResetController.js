const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { generateOtp, hashOtp, verifyOtp } = require('../utils/otp');
const { sendEmail } = require('../utils/email');
const { validatePassword } = require('../utils/validators');
const { getClientIP } = require('../middleware/presence');

// Roles that recover via email OTP. Students recover through their teacher (Phase 3);
// plain USER accounts are individual signups without institutional recovery — they get
// the same generic response so email existence/role can't be probed.
const OTP_ELIGIBLE_ROLES = new Set(['ADMIN', 'INSTITUTION_CHIEF', 'TEACHER']);

const OTP_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const MAX_OTP_ATTEMPTS = 5;
const RESET_TICKET_TTL = '10m';     // short-lived post-OTP ticket
const GENERIC_MSG = 'If an eligible account exists for that email, a reset code has been sent.';

// POST /api/auth/forgot-password — { email }
// Always returns the same generic success (no user enumeration). Only actually sends an
// OTP when the email maps to an OTP-eligible role.
const forgotPassword = async (req, res) => {
  // Match the email exactly as stored (existing login/register are case-sensitive; some
  // accounts are stored mixed-case, so lowercasing here would fail to find them).
  const email = String(req.body.email || '').trim();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && OTP_ELIGIBLE_ROLES.has(user.role) && !user.disabled) {
    const otp = generateOtp();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        otpHash: await hashOtp(otp),
        purpose: 'LOGIN_RESET',
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    await sendEmail({
      to: user.email,
      subject: 'Your BharathComic password reset code',
      html: `<p>Hi ${user.name || 'there'},</p>
             <p>Your BharathComic password reset code is:</p>
             <p style="font-size:24px;font-weight:bold;letter-spacing:3px">${otp}</p>
             <p>This code expires in 5 minutes. If you didn't request it, you can ignore this email.</p>`,
    });
  }

  res.json({ message: GENERIC_MSG });
};

// POST /api/auth/verify-reset-otp — { email, otp }
// On success returns a short-lived reset ticket (not the OTP) for the final step.
const verifyResetOtp = async (req, res) => {
  const email = String(req.body.email || '').trim();
  const otp = String(req.body.otp || '').trim();
  if (!email || !otp) return res.status(400).json({ error: 'Email and code are required' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: 'Invalid or expired code' });

  const token = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, purpose: 'LOGIN_RESET', usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!token) return res.status(400).json({ error: 'Invalid or expired code' });

  if (token.attemptCount >= MAX_OTP_ATTEMPTS) {
    // Burn the token so a new one must be requested
    await prisma.passwordResetToken.update({ where: { id: token.id }, data: { expiresAt: new Date() } });
    return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
  }

  const ok = await verifyOtp(otp, token.otpHash);
  if (!ok) {
    const attemptCount = token.attemptCount + 1;
    await prisma.passwordResetToken.update({ where: { id: token.id }, data: { attemptCount } });
    if (attemptCount >= MAX_OTP_ATTEMPTS) {
      await prisma.passwordResetToken.update({ where: { id: token.id }, data: { expiresAt: new Date() } });
      return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    }
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  // Purpose-scoped ticket — can only be used by resetPassword, ties to this exact token.
  const resetTicket = jwt.sign(
    { sub: user.id, tokenId: token.id, purpose: 'PW_RESET' },
    process.env.JWT_SECRET,
    { expiresIn: RESET_TICKET_TTL }
  );
  res.json({ resetTicket });
};

// POST /api/auth/reset-password — { resetTicket, newPassword }
const resetPassword = async (req, res) => {
  const { resetTicket, newPassword } = req.body;
  if (!resetTicket || !newPassword) return res.status(400).json({ error: 'Reset ticket and new password are required' });

  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });

  let payload;
  try {
    payload = jwt.verify(resetTicket, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'Reset session expired. Start over.' });
  }
  if (payload.purpose !== 'PW_RESET') return res.status(400).json({ error: 'Invalid reset session' });

  const token = await prisma.passwordResetToken.findUnique({ where: { id: payload.tokenId } });
  if (!token || token.usedAt || token.userId !== payload.sub || token.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Reset session expired. Start over.' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return res.status(400).json({ error: 'Invalid reset session' });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10), passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetAudit.create({
      data: {
        userId: user.id,
        performedBy: user.id,
        performedByRole: user.role,
        method: 'EMAIL_OTP',
        ipAddress: getClientIP(req),
      },
    }),
  ]);

  await sendEmail({
    to: user.email,
    subject: 'Your BharathComic password was changed',
    html: `<p>Hi ${user.name || 'there'},</p>
           <p>Your BharathComic password was just changed. If this wasn't you, contact your administrator immediately.</p>`,
  });

  res.json({ message: 'Password updated. You can now sign in with your new password.' });
};

// POST /api/auth/force-change-password — authenticated. Used right after a temp-password
// login (mustChangePassword: true) — requires the current (temp) password + a new one, same
// validation rules as the email-OTP flow. Also marks the outstanding StudentPasswordReset
// row used (if any) — that row is what makes mustChangePassword re-derivable on every
// /api/auth/me call, so it must actually be cleared here, not at login time.
const forceChangePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });

  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const pendingReset = await prisma.studentPasswordReset.findFirst({
    where: { studentId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
  });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10), passwordChangedAt: new Date() },
    }),
    ...(pendingReset ? [prisma.studentPasswordReset.update({ where: { id: pendingReset.id }, data: { usedAt: new Date() } })] : []),
    prisma.passwordResetAudit.create({
      data: {
        userId: user.id,
        performedBy: user.id,
        performedByRole: user.role,
        method: 'SELF_CHANGE', // student setting their own password right after a forced temp-password login
        ipAddress: getClientIP(req),
      },
    }),
  ]);

  res.json({ message: 'Password updated.' });
};

module.exports = { forgotPassword, verifyResetOtp, resetPassword, forceChangePassword };
