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
  const teachers = await prisma.user.findMany({
    where: { institutionId: req.user.institutionId, role: 'TEACHER' },
    select: {
      id: true, name: true, email: true,
      classesCreated: {
        select: {
          id: true, name: true,
          enrollments: { where: { studentId: req.user.id }, select: { status: true } },
        },
      },
    },
  });
  res.json(teachers);
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

module.exports = { listTasks, submitTask, listInstructors, joinClass };
