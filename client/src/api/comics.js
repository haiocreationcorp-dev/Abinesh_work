import api from './client.js';

export const listComics = () => api.get('/comics').then((r) => r.data);
export const getComic = (id) => api.get(`/comics/${id}`).then((r) => r.data);
export const createComic = (data) => api.post('/comics', data).then((r) => r.data);
export const updateComic = (id, data) => api.put(`/comics/${id}`, data).then((r) => r.data);
export const deleteComic = (id) => api.delete(`/comics/${id}`).then((r) => r.data);
