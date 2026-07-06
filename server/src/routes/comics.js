const express = require('express');
const router = express.Router();
const { listComics, getComic, createComic, updateComic, deleteComic } = require('../controllers/comicController');
const auth = require('../middleware/auth');
const requireActiveSubscription = require('../middleware/subscriptionAuth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(auth);
router.get('/', asyncHandler(listComics));
router.get('/:id', asyncHandler(getComic));
router.post('/', asyncHandler(requireActiveSubscription), asyncHandler(createComic));
router.put('/:id', asyncHandler(requireActiveSubscription), asyncHandler(updateComic));
router.delete('/:id', asyncHandler(requireActiveSubscription), asyncHandler(deleteComic));

module.exports = router;
