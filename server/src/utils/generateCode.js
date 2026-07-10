// Generates a human-friendly join code like "AB3X-7KQM", avoiding ambiguous chars (0/O, 1/I).
// Mirrors the institution invite-code pattern in server/src/routes/admin.js (kept separate
// on purpose — this is a new, independent use of the same shape, not a shared rename).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateJoinCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

module.exports = { generateJoinCode };
