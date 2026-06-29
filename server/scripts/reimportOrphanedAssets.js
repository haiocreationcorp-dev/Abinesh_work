// One-off recovery script: re-registers asset files that still exist on disk under
// server/uploads/<dir>/ but have no corresponding Asset row (e.g. after a database
// wipe that didn't touch the filesystem). Filenames are random UUIDs assigned at
// upload time, so the original human-readable name/tags/filter metadata (part type,
// gender, view, etc.) lived only in the DB and can't be recovered — this only restores
// "the file exists in the library under the right category," nothing richer. Skips any
// file that already has a matching Asset row (by filePath), so it's safe to re-run.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const UPLOADS_ROOT = path.join(__dirname, '../uploads');

// dir name -> [AssetCategory, human label for the generic placeholder name]
const FOLDER_MAP = {
  'face-parts': ['FACE_PART', 'Face Part'],
  'face-templates': ['FACE_TEMPLATE', 'Face Template'],
  'body-poses': ['BODY_POSE', 'Body Pose'],
  backgrounds: ['BACKGROUND', 'Background'],
  props: ['PROP', 'Prop'],
  effects: ['EFFECT', 'Effect'],
  bubbles: ['BUBBLE', 'Bubble'],
  sounds: ['SOUND', 'Sound'],
};

async function main() {
  let created = 0;
  let skipped = 0;

  for (const [dir, [category, label]] of Object.entries(FOLDER_MAP)) {
    const dirPath = path.join(UPLOADS_ROOT, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter((f) => !f.startsWith('.')).sort();
    let n = 0;
    for (const file of files) {
      const filePath = `/uploads/${dir}/${file}`;
      const existing = await prisma.asset.findFirst({ where: { filePath } });
      if (existing) { skipped++; continue; }

      n++;
      await prisma.asset.create({
        data: { name: `${label} ${n}`, category, tags: [], filename: file, filePath },
      });
      created++;
    }
    console.log(`${dir}: ${n} re-registered as ${category}`);
  }

  console.log(`\nDone. Created ${created} asset row(s), skipped ${skipped} already-registered file(s).`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
