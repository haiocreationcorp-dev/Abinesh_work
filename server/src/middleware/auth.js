const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Password-change session invalidation: a reset bumps User.passwordChangedAt, so any
  // token minted before that (older `pwc` claim) is rejected. This is a deliberate,
  // narrow one-field DB read per request — not the full per-request user refetch that
  // CLAUDE.md defers. Tokens issued before this feature existed have no `pwc` claim
  // (undefined); treat those as still valid to avoid logging everyone out on deploy.
  try {
    if (payload.pwc !== undefined) {
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { passwordChangedAt: true },
      });
      if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
      if (user.passwordChangedAt && new Date(user.passwordChangedAt).getTime() > payload.pwc) {
        return res.status(401).json({ error: 'Session expired. Please sign in again.' });
      }
    }
  } catch {
    return res.status(500).json({ error: 'Auth check failed' });
  }

  req.user = payload;
  next();
};

module.exports = auth;
