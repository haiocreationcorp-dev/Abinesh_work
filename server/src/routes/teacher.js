const express = require('express');
const router = express.Router();
const {
  listStudents, listStudentComics, getStudentComic,
  resetStudentPassword, lockStudent, unlockStudent,
  createClass, listClasses, deleteClass, updateEnrollment, toggleClassAI,
  createTask, listTasks, listTaskSubmissions, gradeSubmission,
} = require('../controllers/teacherController');
const teacherAuth = require('../middleware/teacherAuth');
const requireActiveSubscription = require('../middleware/subscriptionAuth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(teacherAuth);
router.get('/students', asyncHandler(listStudents));
router.get('/students/:studentId/comics', asyncHandler(listStudentComics));
router.get('/students/:studentId/comics/:comicId', asyncHandler(getStudentComic));
router.post('/students/:studentId/reset-password', asyncHandler(resetStudentPassword));
router.post('/students/:studentId/lock', asyncHandler(lockStudent));
router.post('/students/:studentId/unlock', asyncHandler(unlockStudent));

router.post('/classes', asyncHandler(requireActiveSubscription), asyncHandler(createClass));
router.get('/classes', asyncHandler(listClasses));
router.delete('/classes/:id', asyncHandler(requireActiveSubscription), asyncHandler(deleteClass));
router.patch('/classes/:classId/enrollments/:enrollmentId', asyncHandler(requireActiveSubscription), asyncHandler(updateEnrollment));
router.patch('/classes/:classId/ai', asyncHandler(requireActiveSubscription), asyncHandler(toggleClassAI));

router.post('/tasks', asyncHandler(requireActiveSubscription), asyncHandler(createTask));
router.get('/tasks', asyncHandler(listTasks));
router.get('/tasks/:taskId/submissions', asyncHandler(listTaskSubmissions));
router.patch('/submissions/:submissionId/grade', asyncHandler(requireActiveSubscription), asyncHandler(gradeSubmission));

module.exports = router;
