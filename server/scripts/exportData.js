// Exports every table's rows to a single timestamped JSON file under server/backups/data/.
// This is a supplementary, human-readable backup alongside backupDb.js's pg_dump — useful
// for quickly inspecting/recovering specific rows (e.g. asset names/tags) without needing
// a full pg_restore. Keeps the most recent KEEP_COUNT exports and prunes older ones.
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const KEEP_COUNT = 14;
const BACKUP_DIR = path.join(__dirname, '../backups/data');

async function main() {
  const data = {
    exportedAt: new Date().toISOString(),
    user: await prisma.user.findMany(),
    asset: await prisma.asset.findMany(),
    expression: await prisma.expression.findMany(),
    characterPreset: await prisma.characterPreset.findMany(),
    facePartAlignment: await prisma.facePartAlignment.findMany(),
    lightingPreset: await prisma.lightingPreset.findMany(),
    comic: await prisma.comic.findMany(),
    panel: await prisma.panel.findMany(),
  };

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(BACKUP_DIR, `export_${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(data, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  console.log('Data export written to', outFile, '—', Object.entries(data).filter(([k]) => k !== 'exportedAt').map(([k, v]) => `${k}:${v.length}`).join(', '));

  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(KEEP_COUNT)) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log('Pruned old export', f);
  }

  await prisma.$disconnect();
}

main().catch((err) => { console.error('Export FAILED:', err); process.exit(1); });
