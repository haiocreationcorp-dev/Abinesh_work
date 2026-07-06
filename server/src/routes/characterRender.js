const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { renderCharacter } = require('../controllers/characterRenderController');

// Auth-protected: only logged-in users may trigger a server-side render.
router.post('/', auth, renderCharacter);

module.exports = router;
