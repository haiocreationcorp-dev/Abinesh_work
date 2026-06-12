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
export const updateUserRole = (id, role) => api.patch(`/admin/users/${id}/role`, { role }).then((r) => r.data);

export const saveAssembledCharacter = (name, svgContent) =>
  api.post('/admin/characters/assemble', { name, svgContent }).then((r) => r.data);
