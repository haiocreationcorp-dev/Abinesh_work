const express = require('express');
const router = express.Router();
const { getAssets, getAssetById, deleteAsset, deleteAssets } = require('../controllers/assetController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

router.get('/', auth, getAssets);
router.get('/:id', auth, getAssetById);
router.delete('/bulk', adminAuth, deleteAssets);
router.delete('/:id', adminAuth, deleteAsset);

module.exports = router;
