import api from './client.js';

const withGate = (data) => ({ ...data, gatePassword: sessionStorage.getItem('bc_gate_pw') || '' });

export const gateCheck = (password) => api.post('/auth/gate-check', { password }).then((r) => r.data);
export const register = (data) => api.post('/auth/register', withGate(data)).then((r) => r.data);
export const login = (data) => api.post('/auth/login', withGate(data)).then((r) => r.data);
export const me = () => api.get('/auth/me').then((r) => r.data);
export const lookupInstitution = (code) => api.get(`/auth/institution-lookup/${encodeURIComponent(code)}`).then((r) => r.data);
