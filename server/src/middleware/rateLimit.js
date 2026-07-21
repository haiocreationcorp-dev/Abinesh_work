// Minimal in-memory per-IP rate limiter — same "no persistence needed, resets on restart"
// pattern as presence.js's session/IP tracking. Not for high-traffic production use (no
// shared state across multiple server instances), but matches this app's current
// single-process deployment and avoids adding a new dependency for a small need.
const { getClientIP } = require('./presence');

// ipRateLimit(name, { windowMs, max }) — returns Express middleware that 429s once an IP
// exceeds `max` requests within `windowMs` for this named bucket. Each call site should
// pass its own `name` so different endpoints (e.g. forgot-password vs login) track
// independent limits even though they share this one module.
function ipRateLimit(name, { windowMs, max }) {
  const hits = new Map(); // ip → array of hit timestamps (ms)

  return (req, res, next) => {
    const ip = getClientIP(req);
    const now = Date.now();
    const cutoff = now - windowMs;

    const existing = (hits.get(ip) || []).filter((t) => t > cutoff);
    if (existing.length >= max) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    existing.push(now);
    hits.set(ip, existing);

    // Opportunistic cleanup so the map doesn't grow unbounded over a long-running process.
    if (hits.size > 5000) {
      for (const [key, times] of hits) {
        if (times.every((t) => t <= cutoff)) hits.delete(key);
      }
    }

    next();
  };
}

module.exports = { ipRateLimit };
