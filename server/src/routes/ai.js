const express = require('express');
const router = express.Router();
const { checkGrammar, rewriteText, punctuateText } = require('../controllers/aiController');
const auth = require('../middleware/auth');

router.use(auth);
router.post('/grammar', checkGrammar);
router.post('/rewrite', rewriteText);
router.post('/punctuate', punctuateText);

module.exports = router;
