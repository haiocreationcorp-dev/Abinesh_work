const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@bharathcomic.com' },
    update: {},
    create: {
      email: 'admin@bharathcomic.com',
      name: 'Admin',
      password: adminPassword,
      role: 'ADMIN',
    },
  });
  console.log('Seeded admin user:', admin.email);

  // Sample character asset (links to the pre-placed SVG in uploads/characters/)
  const existing = await prisma.asset.findFirst({ where: { name: 'Sample Character' } });
  if (!existing) {
    await prisma.asset.create({
      data: {
        name: 'Sample Character',
        category: 'CHARACTER',
        tags: ['sample', 'boy', 'cartoon'],
        filename: 'sample-character.svg',
        filePath: '/uploads/characters/sample-character.svg',
        thumbnailPath: null,
      },
    });
    console.log('Seeded sample character asset');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
