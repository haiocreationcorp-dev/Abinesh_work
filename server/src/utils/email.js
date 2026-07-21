const nodemailer = require('nodemailer');

// Lazily created — avoids crashing at require-time if SMTP env vars aren't set yet
// (e.g. during Phase 1, before the user has filled in real SMTP credentials).
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

// sendEmail({ to, subject, html }) — the one place auth code calls out to actually send
// mail, so the provider (SMTP today) can be swapped later without touching callers.
// When SMTP isn't configured yet, it falls back to logging the message to the server
// console instead of throwing, so the recovery flow can be exercised end-to-end before
// real SMTP credentials are in place. Never do this fallback in production.
async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured — set SMTP_HOST/SMTP_USER/SMTP_PASS in .env');
    }
    console.log('\n──────── EMAIL (SMTP not configured — dev console fallback) ────────');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    ${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);
    console.log('───────────────────────────────────────────────────────────────────\n');
    return;
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || 'BharathComic <no-reply@bharathcomic.local>',
    to,
    subject,
    html,
  });
}

module.exports = { sendEmail };
