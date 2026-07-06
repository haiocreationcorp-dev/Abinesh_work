// In-memory presence store: userId → { name, email, role, ip, lastSeen }
// Also tracks anonymous IPs from every request regardless of auth.
// Resets on server restart — intentional. No persistence needed for "who's online now."
const sessions = new Map();          // authenticated users
const ipHits   = new Map();          // ip → { lastSeen, requestCount }

const ACTIVE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

function getClientIP(req) {
  // Handle reverse proxies (Cloudflare, nginx) and direct connections
  return (
    req.headers['cf-connecting-ip'] ||        // Cloudflare
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  ).replace(/^::ffff:/, ''); // strip IPv4-mapped IPv6 prefix
}

// Called by the heartbeat endpoint to mark an authenticated user active
function touch(user, ip) {
  sessions.set(user.id, {
    name:     user.name  || user.email,
    email:    user.email,
    role:     user.role,
    ip:       ip || 'unknown',
    lastSeen: Date.now(),
  });
}

// Express middleware — records every request IP regardless of auth
function trackIP(req, _res, next) {
  const ip = getClientIP(req);
  const existing = ipHits.get(ip) || { requestCount: 0 };
  ipHits.set(ip, { lastSeen: Date.now(), requestCount: existing.requestCount + 1 });
  next();
}

function getActive() {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const active = [];
  for (const [id, s] of sessions) {
    if (s.lastSeen >= cutoff) active.push({ id, ...s });
    else sessions.delete(id);
  }
  return active;
}

function getActiveIPs() {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const result = [];
  for (const [ip, data] of ipHits) {
    if (data.lastSeen >= cutoff) result.push({ ip, ...data });
    else ipHits.delete(ip);
  }
  return result.sort((a, b) => b.lastSeen - a.lastSeen);
}

module.exports = { touch, trackIP, getClientIP, getActive, getActiveIPs };
