// One-off script: assigns a join code to every existing Class row that doesn't have one
// yet (created before the Class.code column existed). New classes get a code at creation
// time in teacherController.createClass, so this only ever needs to run once right after
// the migration that adds the column — but it only touches rows where code is still null,
// so it's safe to re-run.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { generateJoinCode } = require('../src/utils/generateCode');

const prisma = new PrismaClient();

async function main() {
  const classes = await prisma.class.findMany({ where: { code: null }, select: { id: true, name: true } });
  if (classes.length === 0) {
    console.log('No classes missing a code — nothing to do.');
    return;
  }

  let assigned = 0;
  for (const cls of classes) {
    let updated = null;
    for (let attempt = 0; attempt < 5 && !updated; attempt++) {
      try {
        updated = await prisma.class.update({ where: { id: cls.id }, data: { code: generateJoinCode() } });
      } catch (err) {
        if (err.code !== 'P2002') throw err; // unique constraint clash on code — retry
      }
    }
    if (!updated) { console.error(`Could not generate a unique code for class "${cls.name}" (${cls.id}) after 5 attempts`); continue; }
    assigned++;
    console.log(`${cls.name} (${cls.id}) -> ${updated.code}`);
  }

  console.log(`\nDone. Assigned codes to ${assigned}/${classes.length} class(es).`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
