
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

export const listInstitutions = () => api.get('/admin/institutions').then((r) => r.data);
export const createInstitution = (name, type) => api.post('/admin/institutions', { name, type }).then((r) => r.data);
export const renewInstitution = (id) => api.patch(`/admin/institutions/${id}/renew`).then((r) => r.data);
export const updateInstitution = (id, data) => api.patch(`/admin/institutions/${id}`, data).then((r) => r.data);
export const suspendInstitution = (id, suspended) => api.patch(`/admin/institutions/${id}/suspend`, { suspended }).then((r) => r.data);
export const createInstitutionChief = (id, data) => api.post(`/admin/institutions/${id}/chief`, data).then((r) => r.data);
export const updateInstitutionSystemCount = (id, systemCount) => api.patch(`/admin/institutions/${id}/system-count`, { systemCount }).then((r) => r.data);

export const saveAssembledFace = (name, svgContent, layout) =>
  api.post('/admin/faces/assemble', { name, svgContent, layout }).then((r) => r.data);

export const saveAssembledDress = (name, svgContent, layout) =>
  api.post('/admin/dresses/assemble', { name, svgContent, layout }).then((r) => r.data);

export const saveAssembledExpression = (name, svgContent, layout) =>
  api.post('/admin/expressions/assemble', { name, svgContent, layout }).then((r) => r.data);

export const getFacePartAlignmentsPublic = (faceAssetId) =>
  api.get(`/assets/faces/${faceAssetId}/part-alignments`).then((r) => r.data);

export const getFacePartAlignment = (faceAssetId, partAssetId, partType) =>
  api.get('/admin/face-part-alignment', { params: { faceAssetId, partAssetId, partType } }).then((r) => r.data);

export const saveFacePartAlignment = (alignment) =>
  api.post('/admin/face-part-alignment', alignment).then((r) => r.data);
