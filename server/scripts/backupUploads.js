// Backs up server/uploads/ (the actual asset image/sound files — including any masked/
// quantized pixel data, which lives in the files themselves, not the DB) to a single
// persistent zip at server/backups/uploads/uploads.zip. pg_dump (backupDb.js) only covers
// the database, never the filesystem, so this is the only thing that backs up the files
// themselves.
//
// Uses Compress-Archive -Update, which only adds new files and overwrites ones that
// changed — files already in the zip that are unchanged are left alone. So every run
// after the first only touches the diff, instead of re-zipping (and duplicating) the
// whole uploads folder each time.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '../uploads');
const BACKUP_DIR = path.join(__dirname, '../backups/uploads');
const ZIP_FILE = path.join(BACKUP_DIR, 'uploads.zip');

function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const updateFlag = fs.existsSync(ZIP_FILE) ? '-Update' : '';
  const psCommand = `Compress-Archive -Path '${UPLOADS_DIR}\\*' -DestinationPath '${ZIP_FILE}' ${updateFlag} -CompressionLevel Optimal`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCommand], { stdio: 'inherit' });

  if (result.error || result.status !== 0) {
    console.error('Uploads backup FAILED:', result.error?.message || `powershell exited with code ${result.status}`);
    process.exit(1);
  }
  console.log('Uploads backup updated at', ZIP_FILE);
}

main();
