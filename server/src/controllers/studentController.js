const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const listTasks = async (req, res) => {
  const approved = await prisma.classEnrollment.findMany({
    where: { studentId: req.user.id, status: 'APPROVED' },
    select: { classId: true },
  });
  const approvedClassIds = approved.map((e) => e.classId);

  const tasks = await prisma.task.findMany({
    where: {
      institutionId: req.user.institutionId,
      OR: [{ classId: null }, { classId: { in: approvedClassIds } }],
    },
    include: { submissions: { where: { studentId: req.user.id } }, class: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tasks);
};

const listInstructors = async (req, res) => {
  // Only return teachers of classes this student has an enrollment in (any status).
  // This scopes the instructor list to classes the student actually interacts with
  // rather than exposing every teacher in the institution.
  const enrollments = await prisma.classEnrollment.findMany({
    where: { studentId: req.user.id },
    include: {
      class: {
        include: {
          teacher: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  const teacherMap = new Map();
  enrollments.forEach((e) => {
    const t = e.class.teacher;
    if (!teacherMap.has(t.id)) teacherMap.set(t.id, { ...t, classesCreated: [] });
    teacherMap.get(t.id).classesCreated.push({
      id: e.class.id,
      name: e.class.name,
      enrollments: [{ status: e.status }],
    });
  });

  // If student has no enrollments yet, fall back to listing all institution teachers
  // so they can discover classes to join.
  if (teacherMap.size === 0) {
    const allTeachers = await prisma.user.findMany({
      where: { institutionId: req.user.institutionId, role: 'TEACHER' },
      select: {
        id: true, name: true, email: true,
        classesCreated: {
          select: { id: true, name: true, enrollments: { where: { studentId: req.user.id }, select: { status: true } } },
        },
      },
    });
    return res.json(allTeachers);
  }

  res.json([...teacherMap.values()]);
};

const joinClass = async (req, res) => {
  const cls = await prisma.class.findFirst({ where: { id: req.params.classId, institutionId: req.user.institutionId } });
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const existing = await prisma.classEnrollment.findUnique({
    where: { classId_studentId: { classId: cls.id, studentId: req.user.id } },
  });
  if (existing?.status === 'APPROVED') return res.json(existing); // already joined — no-op

  const enrollment = await prisma.classEnrollment.upsert({
    where: { classId_studentId: { classId: cls.id, studentId: req.user.id } },
    create: { classId: cls.id, studentId: req.user.id, status: 'PENDING' },
    update: { status: 'PENDING' }, // allows re-requesting after a rejection
  });
  res.status(201).json(enrollment);
};

const joinClassByCode = async (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'Code is required' });

  const cls = await prisma.class.findFirst({
    where: { code: code.trim().toUpperCase(), institutionId: req.user.institutionId },
  });
  if (!cls) return res.status(404).json({ error: 'Invalid class code' });

  const existing = await prisma.classEnrollment.findUnique({
    where: { classId_studentId: { classId: cls.id, studentId: req.user.id } },
  });
  if (existing?.status === 'APPROVED') return res.json({ ...existing, className: cls.name }); // already joined — no-op

  // A student who was previously kicked/rejected always needs the teacher's manual
  // approval again — the code can't be used to bypass that. Everyone else auto-joins.
  const targetStatus = existing?.status === 'REJECTED' ? 'PENDING' : 'APPROVED';

  const enrollment = await prisma.classEnrollment.upsert({
    where: { classId_studentId: { classId: cls.id, studentId: req.user.id } },
    create: { classId: cls.id, studentId: req.user.id, status: targetStatus },
    update: { status: targetStatus },
  });
  res.status(201).json({ ...enrollment, className: cls.name });
};

const submitTask = async (req, res) => {
  const { comicId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
  if (!comicId) return res.status(400).json({ error: 'comicId is required' });

  const task = await prisma.task.findFirst({ where: { id: req.params.taskId, institutionId: req.user.institutionId } });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const comic = await prisma.comic.findFirst({ where: { id: comicId, userId: req.user.id } });
  if (!comic) return res.status(404).json({ error: 'Comic not found' });

  const dir = path.join(UPLOADS_ROOT, 'submissions');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${uuidv4()}.pdf`;
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);
  const pdfPath = `/uploads/submissions/${filename}`;

  const submission = await prisma.submission.upsert({
    where: { taskId_studentId: { taskId: task.id, studentId: req.user.id } },
    create: { taskId: task.id, studentId: req.user.id, comicId, pdfPath },
    update: { comicId, pdfPath, score: null, feedback: null, gradedAt: null, submittedAt: new Date() },
  });
  res.status(201).json(submission);
};

const getAIStatus = async (req, res) => {
  const approved = await prisma.classEnrollment.findMany({
    where: { studentId: req.user.id, status: 'APPROVED' },
    include: { class: { select: { aiEnabled: true } } },
  });
  const aiEnabled = approved.some((e) => e.class.aiEnabled);
  res.json({ aiEnabled });
};

module.exports = { listTasks, submitTask, listInstructors, joinClass, joinClassByCode, getAIStatus };
