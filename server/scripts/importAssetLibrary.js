// Imports server/data/asset-library.json (written by exportAssetLibrary.js) into the
// current DATABASE_URL, upserting by `id` so it's safe to re-run any time (e.g. after
// every `git pull`) — already-matching rows are just updated in place, nothing is duplicated.
//
// This does NOT touch the actual image files in server/uploads/ — those come from git
// directly. It only recreates the database rows (Asset/CharacterPreset/Expression/
// FacePartAlignment) that point at them, so Browse Assets/Outfit/Pose/Expression pickers
// show the exact same library, with the same names/tags/gender/view/etc., as whoever ran
// the export.
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const IN_FILE = path.join(__dirname, '../data/asset-library.json');

async function main() {
  if (!fs.existsSync(IN_FILE)) {
    console.error(`No file at ${IN_FILE} — pull the latest from git first (it's committed, not gitignored).`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));

  let assetCount = 0;
  for (const row of data.asset || []) {
    const { id, ...fields } = row;
    await prisma.asset.upsert({ where: { id }, create: { id, ...fields }, update: fields });
    assetCount++;
  }

  let presetCount = 0;
  for (const row of data.characterPreset || []) {
    const { id, ...fields } = row;
    await prisma.characterPreset.upsert({ where: { id }, create: { id, ...fields }, update: fields });
    presetCount++;
  }

  let exprCount = 0;
  for (const row of data.expression || []) {
    const { id, ...fields } = row;
    await prisma.expression.upsert({ where: { id }, create: { id, ...fields }, update: fields });
    exprCount++;
  }

  let alignCount = 0;
  for (const row of data.facePartAlignment || []) {
    const { id, ...fields } = row;
    await prisma.facePartAlignment.upsert({ where: { id }, create: { id, ...fields }, update: fields });
    alignCount++;
  }

  console.log(`Imported (exported ${data.exportedAt}): asset:${assetCount}, characterPreset:${presetCount}, expression:${exprCount}, facePartAlignment:${alignCount}`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
