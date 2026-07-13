

import api from './client.js';

export const getAssets = (params = {}) => api.get('/assets', { params }).then((r) => r.data);
export const getAssetById = (id) => api.get(`/assets/${id}`).then((r) => r.data);
export const deleteAsset = (id) => api.delete(`/assets/${id}`).then((r) => r.data);
export const deleteAssets = (ids, password) => api.delete('/assets/bulk', { data: { ids, password } }).then((r) => r.data);

export const uploadAsset = (formData) =>
  api.post('/admin/assets/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const uploadFolder = (formData, onProgress) =>
  api.post('/admin/assets/upload-folder', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  }).then((r) => r.data);

// items: [{ name, category, view }] — reports which already exist as Asset rows, using
// the same name+category+view match upload-folder's upsert does, before anything uploads.
export const checkDuplicateAssets = (items) =>
  api.post('/admin/assets/check-duplicates', { items }).then((r) => r.data);

export const getAdminStats = () => api.get('/admin/stats').then((r) => r.data);
export const getAssetCategoryCounts = () => api.get('/admin/assets/category-counts').then((r) => r.data);
export const getRecentComics = () => api.get('/admin/recent-comics').then((r) => r.data);
export const getAdminUsers = () => api.get('/admin/users').then((r) => r.data);
export const disableUser = (id, disabled) => api.patch(`/admin/users/${id}/disable`, { disabled }).then((r) => r.data);
export const deleteUser = (id) => api.delete(`/admin/users/${id}`).then((r) => r.data);

export const listInstitutions = () => api.get('/admin/institutions').then((r) => r.data);
export const createInstitution = (name, type) => api.post('/admin/institutions', { name, type }).then((r) => r.data);
export const renewInstitution = (id) => api.patch(`/admin/institutions/${id}/renew`).then((r) => r.data);
export const updateInstitution = (id, data) => api.patch(`/admin/institutions/${id}`, data).then((r) => r.data);
export const suspendInstitution = (id, suspended) => api.patch(`/admin/institutions/${id}/suspend`, { suspended }).then((r) => r.data);
export const deleteInstitution = (id) => api.delete(`/admin/institutions/${id}`).then((r) => r.data);
export const createInstitutionChief = (id, data) => api.post(`/admin/institutions/${id}/chief`, data).then((r) => r.data);
export const updateInstitutionSystemCount = (id, systemCount) => api.patch(`/admin/institutions/${id}/system-count`, { systemCount }).then((r) => r.data);

// Runs an on-demand pg_dump + JSON data export (same as the scheduled backup task).
export const triggerBackup = () => api.post('/admin/backup').then((r) => r.data);

// Persists just the Palette Normalizer's mask recipe (detection thresholds, brightness
// cutoffs, output palette) onto an existing asset — no image is re-uploaded.
export const saveAssetSkinMask = (assetId, mask) =>
  api.patch(`/admin/assets/${assetId}/skin-mask`, { mask }).then((r) => r.data);

// Renames an asset. The server also re-stamps the old name wherever it was denormalized
// (FACE_TEMPLATE layout JSON, already-placed Comic Panel data) so the new name is reflected
// everywhere it's used, not just in the asset's own record.
export const renameAsset = (assetId, name) =>
  api.patch(`/admin/assets/${assetId}/rename`, { name }).then((r) => r.data);

// Overwrites an existing asset's image file in place (same asset id, no duplicate) and
// optionally updates its skinThresholds mask recipe in the same request.
export const replaceAssetFile = (assetId, formData) =>
  api.put(`/admin/assets/${assetId}/file`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const saveAssembledFace = (name, svgContent, layout, meta = {}) =>
  api.post('/admin/faces/assemble', { name, svgContent, layout, ...meta }).then((r) => r.data);

export const updateAssembledFace = (id, name, svgContent, layout, meta = {}) =>
  api.put(`/admin/faces/assemble/${id}`, { name, svgContent, layout, ...meta }).then((r) => r.data);

export const getFacePartAlignmentsPublic = (faceAssetId) =>
  api.get(`/assets/faces/${faceAssetId}/part-alignments`).then((r) => r.data);

export const getFacePartAlignment = (faceAssetId, partAssetId, partType) =>
  api.get('/admin/face-part-alignment', { params: { faceAssetId, partAssetId, partType } }).then((r) => r.data);

export const saveFacePartAlignment = (alignment) =>
  api.post('/admin/face-part-alignment', alignment).then((r) => r.data);

// Reads are public (the Comic Editor needs to browse these to place a character);
// create/delete stay admin-only.
export const getExpressions = () => api.get('/assets/expressions').then((r) => r.data);
export const createExpression = (data) => api.post('/admin/expressions', data).then((r) => r.data);
export const deleteExpression = (id) => api.delete(`/admin/expressions/${id}`).then((r) => r.data);

export const getCharacterPresets = () => api.get('/assets/character-presets').then((r) => r.data);
export const createCharacterPreset = (data) => api.post('/admin/character-presets', data).then((r) => r.data);
export const updateCharacterPreset = (id, data) => api.put(`/admin/character-presets/${id}`, data).then((r) => r.data);
export const deleteCharacterPreset = (id) => api.delete(`/admin/character-presets/${id}`).then((r) => r.data);

// Admin-managed BACKGROUND subcategory registry (see backgroundSubcategoryController.js).
export const getBackgroundSubcategories = () => api.get('/admin/background-subcategories').then((r) => r.data);
export const createBackgroundSubcategory = (label) => api.post('/admin/background-subcategories', { label }).then((r) => r.data);
export const updateBackgroundSubcategory = (id, label) => api.put(`/admin/background-subcategories/${id}`, { label }).then((r) => r.data);
// Delete cascades to every BACKGROUND asset tagged with this subcategory; password is
// required by the server when that count exceeds the bulk-delete threshold.
export const deleteBackgroundSubcategory = (id, password) => api.delete(`/admin/background-subcategories/${id}`, { data: { password } }).then((r) => r.data);
// Retro-move existing BACKGROUND assets into a subcategory (renames to its code + moves the
// files into its folder + retags).
export const assignAssetsToSubcategory = (id, assetIds) => api.post(`/admin/background-subcategories/${id}/assign-assets`, { assetIds }).then((r) => r.data);
