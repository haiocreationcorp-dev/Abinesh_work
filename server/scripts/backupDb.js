// Dumps the full Postgres database (schema + data) to server/backups/db/ using pg_dump's
// custom format, so a single `pg_restore` call can fully rebuild the database after any
// accidental data loss. Keeps the most recent KEEP_COUNT dumps and prunes older ones.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findBin, parseDatabaseUrl } = require('./pgBin');

const KEEP_COUNT = 14;
const BACKUP_DIR = path.join(__dirname, '../backups/db');

function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const { user, password, host, port, database } = parseDatabaseUrl(process.env.DATABASE_URL);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(BACKUP_DIR, `${database}_${stamp}.dump`);

  const pgDump = findBin('pg_dump');
  const result = spawnSync(
    pgDump,
    ['-h', host, '-p', port, '-U', user, '-Fc', '-f', outFile, database],
    { env: { ...process.env, PGPASSWORD: password }, stdio: 'inherit' }
  );

  if (result.error || result.status !== 0) {
    console.error('Backup FAILED:', result.error?.message || `pg_dump exited with code ${result.status}`);
    process.exit(1);
  }

  console.log('Backup written to', outFile);

  // Prune old backups beyond KEEP_COUNT
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.dump'))
    .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(KEEP_COUNT)) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log('Pruned old backup', f);
  }
}

main();
