const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { register, login, me, institutionLookup, updateProfile, uploadAvatar } = require('../controllers/authController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { touch, getClientIP, getActive, getActiveIPs } = require('../middleware/presence');

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

router.get('/institution-lookup/:code', institutionLookup);
router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, me);
router.patch('/me', auth, updateProfile);
router.post('/me/avatar', auth, avatarUpload.single('file'), uploadAvatar);

// Lightweight heartbeat — called every 30s by any logged-in client to mark them active
router.post('/heartbeat', auth, (req, res) => {
  touch(req.user, getClientIP(req));
  res.json({ ok: true });
});

// Admin-only: who's online right now (seen in last 2 min)
router.get('/active-users', adminAuth, (_req, res) => {
  res.json(getActive());
});

// Admin-only: unique IPs that hit the server in the last 2 min
router.get('/active-ips', adminAuth, (_req, res) => {
  res.json(getActiveIPs());
});

module.exports = router;
