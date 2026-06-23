const express = require('express');
const router = express.Router();
const {
  listStudents, listStudentComics, getStudentComic,
  createClass, listClasses, deleteClass, updateEnrollment,
  createTask, listTasks, listTaskSubmissions, gradeSubmission,
} = require('../controllers/teacherController');
const teacherAuth = require('../middleware/teacherAuth');
const requireActiveSubscription = require('../middleware/subscriptionAuth');

router.use(teacherAuth);
router.get('/students', listStudents);
router.get('/students/:studentId/comics', listStudentComics);
router.get('/students/:studentId/comics/:comicId', getStudentComic);

router.post('/classes', requireActiveSubscription, createClass);
router.get('/classes', listClasses);
router.delete('/classes/:id', requireActiveSubscription, deleteClass);
router.patch('/classes/:classId/enrollments/:enrollmentId', requireActiveSubscription, updateEnrollment);

router.post('/tasks', requireActiveSubscription, createTask);
router.get('/tasks', listTasks);
router.get('/tasks/:taskId/submissions', listTaskSubmissions);
router.patch('/submissions/:submissionId/grade', requireActiveSubscription, gradeSubmission);

module.exports = router;
