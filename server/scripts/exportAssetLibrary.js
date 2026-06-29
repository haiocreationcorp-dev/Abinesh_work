// Exports just the asset-library tables (Asset, CharacterPreset, Expression,
// FacePartAlignment) — no User accounts/passwords, no Comic/Panel (personal per-account
// work) — to a single JSON file that is NOT gitignored, unlike server/backups/. The point
// is for this file to travel with normal git commits/pushes, so anyone who clones the repo
// can run importAssetLibrary.js once and get the exact same Browse Assets library (names,
// tags, gender, view, eyeType/mouthType, costume, poseType, and all FacePartAlignment
// placements) without a manual file handoff.
//
// Every record keeps its original `id` (cuid) — there's no real FK constraint between
// these tables (CharacterPreset.frontFaceId etc. are plain strings, not @relation, per
// schema.prisma's own comment), so importing in any order is safe as long as ids match
// exactly, which is exactly what lets cross-references (e.g. CharacterPreset.frontFaceId
// -> Asset.id) keep working after import.
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const OUT_FILE = path.join(__dirname, '../data/asset-library.json');

async function main() {
  const data = {
    exportedAt: new Date().toISOString(),
    asset: await prisma.asset.findMany(),
    characterPreset: await prisma.characterPreset.findMany(),
    expression: await prisma.expression.findMany(),
    facePartAlignment: await prisma.facePartAlignment.findMany(),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  console.log(
    'Asset library exported to', OUT_FILE, '—',
    Object.entries(data).filter(([k]) => k !== 'exportedAt').map(([k, v]) => `${k}:${v.length}`).join(', ')
  );

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
