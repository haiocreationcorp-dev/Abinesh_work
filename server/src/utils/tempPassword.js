// Generates a teacher-facing temporary password for a student account, e.g. "A8KDX92P".
// Plain alphanumeric only (no hyphen or other symbols) — same unambiguous-character
// alphabet as generateJoinCode.js (excludes 0/O, 1/I), kept as a separate function since
// this one is a password (compared via bcrypt, never stored in plaintext), not a lookup code.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateTempPassword() {
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

module.exports = { generateTempPassword };
