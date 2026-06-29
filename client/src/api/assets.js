
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

export const getAdminStats = () => api.get('/admin/stats').then((r) => r.data);
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

// Persists just the Palette Normalizer's mask recipe (detection thresholds, brightness
// cutoffs, output palette) onto an existing asset — no image is re-uploaded.
export const saveAssetSkinMask = (assetId, mask) =>
  api.patch(`/admin/assets/${assetId}/skin-mask`, { mask }).then((r) => r.data);

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
export const deleteCharacterPreset = (id) => api.delete(`/admin/character-presets/${id}`).then((r) => r.data);
