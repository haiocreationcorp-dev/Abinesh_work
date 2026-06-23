const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { listTasks, submitTask, listInstructors, joinClass } = require('../controllers/studentController');
const studentAuth = require('../middleware/studentAuth');
const requireActiveSubscription = require('../middleware/subscriptionAuth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

router.use(studentAuth);
router.get('/tasks', listTasks);
router.post('/tasks/:taskId/submit', requireActiveSubscription, upload.single('pdf'), submitTask);
router.get('/instructors', listInstructors);
router.post('/classes/:classId/join', requireActiveSubscription, joinClass);

module.exports = router;
