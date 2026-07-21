const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// 6-digit numeric OTP, crypto-random (not Math.random) since this gates account access.
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

function verifyOtp(otp, hash) {
  return bcrypt.compare(otp, hash);
}

module.exports = { generateOtp, hashOtp, verifyOtp };
