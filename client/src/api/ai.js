import api from './client.js';

export const checkGrammar = (text) => api.post('/ai/grammar', { text }).then((r) => r.data);
export const rewriteText = (text, mode) => api.post('/ai/rewrite', { text, mode }).then((r) => r.data);
export const punctuateText = (text) => api.post('/ai/punctuate', { text }).then((r) => r.data);
