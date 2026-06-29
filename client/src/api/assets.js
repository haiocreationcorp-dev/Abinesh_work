import api from './client.js';

export const getAssets = (params = {}) => api.get('/assets', { params }).then((r) => r.data);
export const getAssetById = (id) => api.get(`/assets/${id}`).then((r) => r.data);
export const deleteAsset = (id) => api.delete(`/assets/${id}`).then((r) => r.data);
export const deleteAssets = (ids) => api.delete('/assets/bulk', { data: { ids } }).then((r) => r.data);

export const uploadAsset = (formData) =>
  api.post('/admin/assets/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const uploadFolder = (formData, onProgress) =>
  api.post('/admin/assets/upload-folder', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  }).then((r) => r.data);

export const getAdminUsers = () => api.get('/admin/users').then((r) => r.data);

// Runs an on-demand pg_dump + JSON data export (same as the scheduled backup task).
export const triggerBackup = () => api.post('/admin/backup').then((r) => r.data);
export const updateUserRole = (id, role) => api.patch(`/admin/users/${id}/role`, { role }).then((r) => r.data);

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
