import api from './client.js';

export const getLightingPresets = () => api.get('/lighting-presets').then((r) => r.data);
export const updateLightingPreset = (id, data) =>
  api.patch(`/lighting-presets/${id}`, data).then((r) => r.data);
