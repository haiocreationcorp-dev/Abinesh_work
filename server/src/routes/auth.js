const express = require('express');
const router = express.Router();
const { register, login, me, gateCheck } = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/gate-check', gateCheck);
router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, me);

module.exports = router;
