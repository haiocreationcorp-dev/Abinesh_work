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

  // Demo institution — home for the seeded chief/teacher/student accounts below.
  const now = new Date();
  const demoInstitution = await prisma.institution.upsert({
    where: { code: 'DEMO-0001' },
    update: {},
    create: {
      name: 'Demo Institution',
      code: 'DEMO-0001',
      type: 'SCHOOL',
      subscriptionStartedAt: now,
      subscriptionExpiresAt: new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()),
    },
  });
  console.log('Seeded institution:', demoInstitution.name);

  const chiefPassword = await bcrypt.hash('12345678', 10);
  const chief = await prisma.user.upsert({
    where: { email: 'Chief@gmail.com' },
    update: {},
    create: {
      email: 'Chief@gmail.com',
      name: 'Chief',
      password: chiefPassword,
      role: 'INSTITUTION_CHIEF',
      institutionId: demoInstitution.id,
    },
  });
  console.log('Seeded chief user:', chief.email);

  const teacherPassword = await bcrypt.hash('hello321@', 10);
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@sample.com' },
    update: {},
    create: {
      email: 'teacher@sample.com',
      name: 'Teacher',
      password: teacherPassword,
      role: 'TEACHER',
      institutionId: demoInstitution.id,
    },
  });
  console.log('Seeded teacher user:', teacher.email);

  const studentPassword = await bcrypt.hash('stud123@', 10);
  const student = await prisma.user.upsert({
    where: { email: 'student@gmail.com' },
    update: {},
    create: {
      email: 'student@gmail.com',
      name: 'Student',
      password: studentPassword,
      role: 'STUDENT',
      institutionId: demoInstitution.id,
      gradeLevel: '10th',
      section: 'A',
      rollNo: '1',
    },
  });
  console.log('Seeded student user:', student.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
