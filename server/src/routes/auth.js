const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { register, login, me, gateCheck, institutionLookup, updateProfile, uploadAvatar } = require('../controllers/authController');
const auth = require('../middleware/auth');

const AVATAR_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (AVATAR_EXTS.includes(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not allowed. Use PNG, JPG, GIF, or WebP.`));
  },
});

router.post('/gate-check', gateCheck);
router.get('/institution-lookup/:code', institutionLookup);
router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, me);
router.patch('/me', auth, updateProfile);
router.post('/me/avatar', auth, avatarUpload.single('file'), uploadAvatar);

module.exports = router;
