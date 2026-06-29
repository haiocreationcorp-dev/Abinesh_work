// Locates a Postgres CLI tool (pg_dump, pg_restore, psql) — tries PATH first, then falls
// back to the common Windows install locations. Shared by the backup and restore scripts.
const fs = require('fs');

function findBin(name) {
  const candidates = [
    name,
    `C:\\Program Files\\PostgreSQL\\16\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\15\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\14\\bin\\${name}.exe`,
  ];
  for (const c of candidates) {
    if (c === name) return name; // let PATH resolve it; spawnSync fails clearly if missing
    if (fs.existsSync(c)) return c;
  }
  return name;
}

function parseDatabaseUrl(url) {
  const m = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error('Could not parse DATABASE_URL');
  const [, user, password, host, port, database] = m;
  return { user, password, host, port, database };
}

module.exports = { findBin, parseDatabaseUrl };
