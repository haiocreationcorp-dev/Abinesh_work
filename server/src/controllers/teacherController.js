const prisma = require('../config/prisma');

const listStudents = async (req, res) => {
  const students = await prisma.user.findMany({
    where: { institutionId: req.user.institutionId, role: 'STUDENT' },
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(students);
};

// Confirms the target user is a student in the same institution as the requesting teacher —
// the actual cross-institution authorization boundary for every teacher→student lookup below.
const findStudentInInstitution = (studentId, institutionId) =>
  prisma.user.findFirst({
    where: { id: studentId, role: 'STUDENT', institutionId },
    select: { id: true, name: true, email: true },
  });

const listStudentComics = async (req, res) => {
  const student = await findStudentInInstitution(req.params.studentId, req.user.institutionId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const comics = await prisma.comic.findMany({
    where: { userId: student.id },
    include: { panels: { orderBy: { order: 'asc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ student, comics });
};

const getStudentComic = async (req, res) => {
  const student = await findStudentInInstitution(req.params.studentId, req.user.institutionId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const comic = await prisma.comic.findFirst({
    where: { id: req.params.comicId, userId: student.id },
    include: { panels: { orderBy: { order: 'asc' } } },
  });
  if (!comic) return res.status(404).json({ error: 'Comic not found' });
  res.json({ student, comic });
};

const createClass = async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Class name is required' });

  const cls = await prisma.class.create({
    data: { name: name.trim(), teacherId: req.user.id, institutionId: req.user.institutionId },
  });
  res.status(201).json(cls);
};

const listClasses = async (req, res) => {
  const classes = await prisma.class.findMany({
    where: { teacherId: req.user.id },
    include: {
      enrollments: {
        include: {
          student: {
            select: {
              id: true, name: true, email: true,
              gradeLevel: true, section: true, rollNo: true,
              department: true, year: true, gender: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(classes);
};

const deleteClass = async (req, res) => {
  const cls = await prisma.class.findFirst({ where: { id: req.params.id, teacherId: req.user.id } });
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  await prisma.class.delete({ where: { id: cls.id } }); // cascades to enrollments + tasks + their submissions
  res.json({ message: 'Class deleted' });
};

const updateEnrollment = async (req, res) => {
  const { status } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Status must be APPROVED or REJECTED' });

  const enrollment = await prisma.classEnrollment.findFirst({
    where: { id: req.params.enrollmentId, classId: req.params.classId, class: { teacherId: req.user.id } },
  });
  if (!enrollment) return res.status(404).json({ error: 'Enrollment request not found' });

  const updated = await prisma.classEnrollment.update({ where: { id: enrollment.id }, data: { status } });
  res.json(updated);
};

const createTask = async (req, res) => {
  const { title, description, dueDate, classId } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!classId) return res.status(400).json({ error: 'classId is required' });

  const cls = await prisma.class.findFirst({ where: { id: classId, teacherId: req.user.id } });
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      teacherId: req.user.id,
      institutionId: req.user.institutionId,
      classId: cls.id,
    },
  });
  res.status(201).json(task);
};

const listTasks = async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { teacherId: req.user.id },
    include: { _count: { select: { submissions: true } }, class: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tasks);
};

const listTaskSubmissions = async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.taskId, teacherId: req.user.id } });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const submissions = await prisma.submission.findMany({
    where: { taskId: task.id },
    include: { student: { select: { id: true, name: true, email: true } } },
    orderBy: { submittedAt: 'desc' },
  });
  res.json({ task, submissions });
};

const toggleClassAI = async (req, res) => {
  const cls = await prisma.class.findFirst({ where: { id: req.params.classId, teacherId: req.user.id } });
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  const updated = await prisma.class.update({ where: { id: cls.id }, data: { aiEnabled: !cls.aiEnabled } });
  res.json(updated);
};

const gradeSubmission = async (req, res) => {
  const { score, feedback } = req.body;
  if (score !== undefined && score !== null && (typeof score !== 'number' || score < 0 || score > 100)) {
    return res.status(400).json({ error: 'Score must be a number between 0 and 100' });
  }

  const submission = await prisma.submission.findFirst({
    where: { id: req.params.submissionId, task: { teacherId: req.user.id } },
  });
  if (!submission) return res.status(404).json({ error: 'Submission not found' });

  const updated = await prisma.submission.update({
    where: { id: submission.id },
    data: { score: score ?? null, feedback: feedback || null, gradedAt: new Date() },
  });
  res.json(updated);
};

module.exports = {
  listStudents, listStudentComics, getStudentComic,
  createClass, listClasses, deleteClass, updateEnrollment, toggleClassAI,
  createTask, listTasks, listTaskSubmissions, gradeSubmission,
};
