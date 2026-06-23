const express = require('express');
const router = express.Router();
const { listComics, getComic, createComic, updateComic, deleteComic } = require('../controllers/comicController');
const auth = require('../middleware/auth');
const requireActiveSubscription = require('../middleware/subscriptionAuth');

router.use(auth);
router.get('/', listComics);
router.get('/:id', getComic);
router.post('/', requireActiveSubscription, createComic);
router.put('/:id', requireActiveSubscription, updateComic);
router.delete('/:id', requireActiveSubscription, deleteComic);

module.exports = router;
