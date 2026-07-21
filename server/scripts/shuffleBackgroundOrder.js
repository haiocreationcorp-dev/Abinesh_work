// One-off script: assigns a fixed, randomized sortOrder to every BACKGROUND asset, grouped
// by its subcategory (the slug tag written at upload time — see BackgroundSubcategory in
// schema.prisma). The editor's background picker previously re-shuffled the display order
// on every panel open; this bakes in a single shuffle instead, so the order is stable and
// identical for every user going forward, while still not being the plain name/number order.
//
// Safe to re-run — each run picks a fresh random order, overwriting the previous one. Only
// run this again if you deliberately want a new shuffle.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  const subcats = await prisma.backgroundSubcategory.findMany({ select: { slug: true, label: true } });
  const assets = await prisma.asset.findMany({
    where: { category: 'BACKGROUND' },
    select: { id: true, name: true, tags: true },
  });

  if (assets.length === 0) {
    console.log('No BACKGROUND assets found — nothing to do.');
    return;
  }

  // Group by whichever subcategory slug each asset is tagged with; anything untagged (or
  // tagged with a slug that no longer matches a subcategory) falls into its own "uncategorized"
  // bucket so it still gets a stable order rather than being skipped.
  const bySlug = new Map();
  for (const asset of assets) {
    const slug = subcats.find((sc) => asset.tags.includes(sc.slug))?.slug || '__uncategorized__';
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(asset);
  }

  let updated = 0;
  for (const [slug, group] of bySlug) {
    const label = subcats.find((sc) => sc.slug === slug)?.label || 'Uncategorized';
    shuffle(group);
    for (let i = 0; i < group.length; i++) {
      await prisma.asset.update({ where: { id: group[i].id }, data: { sortOrder: i } });
      updated++;
    }
    console.log(`${label} (${slug}): shuffled ${group.length} asset(s)`);
  }

  console.log(`\nDone. Updated sortOrder on ${updated}/${assets.length} BACKGROUND asset(s).`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
