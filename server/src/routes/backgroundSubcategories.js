const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const {
  getSubcategories, createSubcategory, updateSubcategory, deleteSubcategory, assignAssets,
} = require('../controllers/backgroundSubcategoryController');

// GET is open to any logged-in user — the comic editor (students/teachers, not just admins)
// lists subcategory folders. All mutations remain admin-only.
router.get('/', auth, getSubcategories);
router.post('/', adminAuth, createSubcategory);
router.put('/:id', adminAuth, updateSubcategory);
router.delete('/:id', adminAuth, deleteSubcategory);
router.post('/:id/assign-assets', adminAuth, assignAssets);

module.exports = router;
