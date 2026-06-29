// Restores the most recent pg_dump (server/backups/db/*.dump) into a database, and prints
// row counts for the key tables so the result can be sanity-checked.
//
// SAFE BY DEFAULT: with no arguments, this restores into a disposable database named
// "<database>_restore_test" — it never touches the real database. The throwaway database
// is dropped again at the end of the run.
//
// To actually overwrite the live database (DESTRUCTIVE — wipes whatever is currently
// there first), you must pass both flags: `node scripts/restoreDb.js --live --i-understand`.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findBin, parseDatabaseUrl } = require('./pgBin');

const DUMP_DIR = path.join(__dirname, '../backups/db');

function latestDump() {
  const files = fs.readdirSync(DUMP_DIR).filter((f) => f.endsWith('.dump'));
  if (!files.length) throw new Error(`No .dump files found in ${DUMP_DIR}`);
  return files
    .map((f) => ({ f, t: fs.statSync(path.join(DUMP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f;
}

function runPsql(env, host, port, user, db, sql) {
  return spawnSync(findBin('psql'), ['-h', host, '-p', port, '-U', user, '-d', db, '-t', '-c', sql], { env, encoding: 'utf8' });
}

function printCounts(env, host, port, user, db, label) {
  const tables = ['User', 'Asset', 'Comic', 'Panel', 'Expression', 'CharacterPreset', 'FacePartAlignment', 'LightingPreset'];
  console.log(`\n${label} (database "${db}"):`);
  for (const t of tables) {
    const r = runPsql(env, host, port, user, db, `SELECT count(*) FROM "${t}"`);
    const count = r.status === 0 ? r.stdout.trim() : 'ERROR';
    console.log(`  ${t}: ${count}`);
  }
}

function main() {
  const isLive = process.argv.includes('--live');
  const confirmed = process.argv.includes('--i-understand');
  if (isLive && !confirmed) {
    console.error('Refusing to restore into the live database without --i-understand as well. Run with no flags first to test against a throwaway database.');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const { user, password, host, port, database } = parseDatabaseUrl(process.env.DATABASE_URL);
  const env = { ...process.env, PGPASSWORD: password };

  const dumpFile = path.join(DUMP_DIR, latestDump());
  const targetDb = isLive ? database : `${database}_restore_test`;

  console.log(isLive
    ? `LIVE RESTORE — about to WIPE and overwrite "${database}" from ${dumpFile}`
    : `TEST RESTORE — restoring into disposable database "${targetDb}" from ${dumpFile}. The real "${database}" is not touched.`);

  if (!isLive) {
    // Recreate the throwaway database from scratch so re-runs are clean.
    runPsql(env, host, port, user, 'postgres', `DROP DATABASE IF EXISTS ${targetDb}`);
    const create = runPsql(env, host, port, user, 'postgres', `CREATE DATABASE ${targetDb}`);
    if (create.status !== 0) { console.error('Could not create throwaway test database:', create.stderr); process.exit(1); }
  }

  const restoreArgs = ['-h', host, '-p', port, '-U', user, '-d', targetDb, '--clean', '--if-exists', '--no-owner', dumpFile];
  const restoreResult = spawnSync(findBin('pg_restore'), restoreArgs, { env, stdio: 'inherit' });
  if (restoreResult.status !== 0) {
    console.error('Restore FAILED');
    process.exit(1);
  }
  console.log('Restore succeeded.');

  printCounts(env, host, port, user, targetDb, isLive ? 'Restored live database' : 'Restored test database');
  if (!isLive) {
    printCounts(env, host, port, user, database, 'Current live database (for comparison)');
    runPsql(env, host, port, user, 'postgres', `DROP DATABASE IF EXISTS ${targetDb}`);
    console.log(`\nDropped throwaway database "${targetDb}". Live database was never touched.`);
  }
}

main();
