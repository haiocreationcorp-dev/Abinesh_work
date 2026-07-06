const express = require('express');
const router = express.Router();
const { checkGrammar, rewriteText, punctuateText } = require('../controllers/aiController');
const auth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(auth);
router.post('/grammar', asyncHandler(checkGrammar));
router.post('/rewrite', asyncHandler(rewriteText));
router.post('/punctuate', asyncHandler(punctuateText));

module.exports = router;
