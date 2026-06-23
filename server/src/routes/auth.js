const express = require('express');
const router = express.Router();
const { register, login, me, gateCheck, institutionLookup } = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/gate-check', gateCheck);
router.get('/institution-lookup/:code', institutionLookup);
router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, me);

module.exports = router;
