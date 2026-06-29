// Verifies server/backups/uploads/uploads.zip is actually extractable and matches the
// live uploads/ folder's file count.
//
// SAFE BY DEFAULT: extracts into a disposable folder (server/backups/uploads/restore-test/),
// compares, then deletes that folder. Never touches the real uploads/ folder.
//
// To actually restore over the live uploads/ folder (DESTRUCTIVE — overwrites files
// currently there), pass both flags: `node scripts/restoreUploads.js --live --i-understand`.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '../uploads');
const ZIP_FILE = path.join(__dirname, '../backups/uploads/uploads.zip');
const TEST_DIR = path.join(__dirname, '../backups/uploads/restore-test');

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
    else count++;
  }
  return count;
}

function main() {
  const isLive = process.argv.includes('--live');
  const confirmed = process.argv.includes('--i-understand');
  if (isLive && !confirmed) {
    console.error('Refusing to restore over the live uploads/ folder without --i-understand as well. Run with no flags first to verify the zip is valid.');
    process.exit(1);
  }
  if (!fs.existsSync(ZIP_FILE)) throw new Error(`No backup zip found at ${ZIP_FILE}`);

  const destDir = isLive ? UPLOADS_DIR : TEST_DIR;
  console.log(isLive
    ? `LIVE RESTORE — extracting ${ZIP_FILE} over "${UPLOADS_DIR}" (existing files with the same name will be overwritten)`
    : `TEST RESTORE — extracting ${ZIP_FILE} into disposable folder "${TEST_DIR}". The real uploads/ folder is not touched.`);

  if (!isLive) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  const psCommand = `Expand-Archive -Path '${ZIP_FILE}' -DestinationPath '${destDir}' -Force`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCommand], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('Extraction FAILED:', result.error?.message || `powershell exited with code ${result.status}`);
    process.exit(1);
  }

  if (!isLive) {
    const liveCount = countFiles(UPLOADS_DIR);
    const restoredCount = countFiles(TEST_DIR);
    console.log(`\nLive uploads/ file count:     ${liveCount}`);
    console.log(`Restored (test) file count:   ${restoredCount}`);
    console.log(liveCount === restoredCount ? 'Match — backup zip is valid and complete.' : 'MISMATCH — investigate before relying on this backup.');
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    console.log(`Cleaned up "${TEST_DIR}". Live uploads/ was never touched.`);
  } else {
    console.log('Live uploads/ folder restored.');
  }
}

main();
