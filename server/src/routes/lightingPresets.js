const express = require('express');
const router = express.Router();
const { getPresets, updatePreset } = require('../controllers/lightingPresetController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

router.get('/', auth, getPresets);
router.patch('/:id', adminAuth, updatePreset);

module.exports = router;
