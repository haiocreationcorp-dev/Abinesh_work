const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { listTasks, submitTask, listInstructors, joinClass, getAIStatus } = require('../controllers/studentController');
const studentAuth = require('../middleware/studentAuth');
const requireActiveSubscription = require('../middleware/subscriptionAuth');
const { asyncHandler } = require('../middleware/errorHandler');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

router.use(studentAuth);
router.get('/tasks', asyncHandler(listTasks));
router.post('/tasks/:taskId/submit', asyncHandler(requireActiveSubscription), upload.single('pdf'), asyncHandler(submitTask));
router.get('/ai-status', asyncHandler(getAIStatus));
router.get('/instructors', asyncHandler(listInstructors));
router.post('/classes/:classId/join', asyncHandler(requireActiveSubscription), asyncHandler(joinClass));

module.exports = router;
