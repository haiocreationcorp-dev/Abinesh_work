const express = require('express');
const router = express.Router();
const { listComics, getComic, createComic, updateComic, deleteComic } = require('../controllers/comicController');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', listComics);
router.get('/:id', getComic);
router.post('/', createComic);
router.put('/:id', updateComic);
router.delete('/:id', deleteComic);

module.exports = router;
