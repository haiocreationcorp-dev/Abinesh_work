// Wipes the entire asset library: all Asset rows + their files, plus the Expression,
// CharacterPreset, and FacePartAlignment rows that reference them (all become orphaned
// once Asset rows are gone). Run npm run backup:all BEFORE this — it is not reversible
// without that backup.
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const UPLOADS_ROOT = path.join(__dirname, '../uploads');
const CATEGORY_DIRS = ['face-parts', 'face-templates', 'body-poses', 'backgrounds', 'props', 'effects', 'bubbles', 'sounds', 'thumbnails'];

function deleteAllFilesRecursive(dir, failed) {
  let count = 0;
  if (!fs.existsSync(dir)) return count;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += deleteAllFilesRecursive(full, failed);
      try { fs.rmdirSync(full); } catch (_) { /* not empty (had a locked file) — fine */ }
    } else {
      try {
        fs.unlinkSync(full);
        count++;
      } catch (err) {
        failed.push({ file: full, error: err.message });
      }
    }
  }
  return count;
}

async function main() {
  console.log('Asset rows before:', await prisma.asset.count());
  console.log('Expression rows before:', await prisma.expression.count());
  console.log('CharacterPreset rows before:', await prisma.characterPreset.count());
  console.log('FacePartAlignment rows before:', await prisma.facePartAlignment.count());

  const assetResult = await prisma.asset.deleteMany({});
  const exprResult = await prisma.expression.deleteMany({});
  const presetResult = await prisma.characterPreset.deleteMany({});
  const alignResult = await prisma.facePartAlignment.deleteMany({});

  let filesDeleted = 0;
  const failed = [];
  for (const dir of CATEGORY_DIRS) {
    filesDeleted += deleteAllFilesRecursive(path.join(UPLOADS_ROOT, dir), failed);
  }

  console.log('\nDeleted: Asset', assetResult.count, '| Expression', exprResult.count,
    '| CharacterPreset', presetResult.count, '| FacePartAlignment', alignResult.count,
    '| files', filesDeleted);
  if (failed.length) {
    console.log(`\n${failed.length} file(s) could not be deleted (likely locked by a running process):`);
    for (const f of failed) console.log(`  ${f.file}: ${f.error}`);
    console.log('Stop the app (pm2 stop bharatcomic) and rerun this script to clear the rest.');
  }
  console.log('\nRemaining assets:', await prisma.asset.count());
}
main().catch(console.error).finally(() => prisma.$disconnect());
