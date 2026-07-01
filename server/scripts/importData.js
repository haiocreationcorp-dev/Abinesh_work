// Imports assets, presets, expressions, alignments, and lighting presets
// from the latest JSON export in backups/data/ into the live database.
// Safe to run multiple times — uses upsert so existing records are not duplicated.
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const DATA_DIR = path.join(__dirname, '../backups/data');

async function main() {
  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  if (!files.length) { console.error('No export JSON found in', DATA_DIR); process.exit(1); }

  const latest = path.join(DATA_DIR, files[0].f);
  console.log('Importing from', files[0].f);
  const data = JSON.parse(fs.readFileSync(latest, 'utf8'));

  // Assets
  let count = 0;
  for (const row of (data.asset || [])) {
    await prisma.asset.upsert({ where: { id: row.id }, update: row, create: row });
    count++;
  }
  console.log(`Assets: ${count}`);

  // Expressions
  count = 0;
  for (const row of (data.expression || [])) {
    const { createdAt, updatedAt, ...rest } = row;
    await prisma.expression.upsert({ where: { id: row.id }, update: rest, create: rest });
    count++;
  }
  console.log(`Expressions: ${count}`);

  // FacePartAlignments
  count = 0;
  for (const row of (data.facePartAlignment || [])) {
    const { createdAt, updatedAt, ...rest } = row;
    await prisma.facePartAlignment.upsert({ where: { id: row.id }, update: rest, create: rest });
    count++;
  }
  console.log(`FacePartAlignments: ${count}`);

  // LightingPresets
  count = 0;
  for (const row of (data.lightingPreset || [])) {
    const { createdAt, updatedAt, ...rest } = row;
    await prisma.lightingPreset.upsert({ where: { id: row.id }, update: rest, create: rest });
    count++;
  }
  console.log(`LightingPresets: ${count}`);

  // CharacterPresets
  count = 0;
  for (const row of (data.characterPreset || [])) {
    const { createdAt, updatedAt, ...rest } = row;
    await prisma.characterPreset.upsert({ where: { id: row.id }, update: rest, create: rest });
    count++;
  }
  console.log(`CharacterPresets: ${count}`);

  console.log('\nImport complete! Restart PM2 if needed: pm2 restart bharatcomic');
  await prisma.$disconnect();
}

main().catch((err) => { console.error('Import FAILED:', err); process.exit(1); });
