// Copies server/.env to server/backups/env/.env.bak. Without this, restoring the database
// and files after a disaster is useless if DATABASE_URL/JWT_SECRET/SITE_GATE_PASSWORD are
// also gone — the app couldn't connect or authenticate even with all the data back.
//
// This file contains plaintext secrets. server/backups/ is already git-ignored; never
// commit it, and don't copy it anywhere outside this machine without re-securing it.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../.env');
const DEST_DIR = path.join(__dirname, '../backups/env');
const DEST = path.join(DEST_DIR, '.env.bak');

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`No .env found at ${SRC}`);
  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.copyFileSync(SRC, DEST);
  console.log('.env backed up to', DEST);
}

main();
