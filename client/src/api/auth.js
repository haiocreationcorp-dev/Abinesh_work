import api from './client.js';

export const register = (data) => api.post('/auth/register', data).then((r) => r.data);
export const login = (data) => api.post('/auth/login', data).then((r) => r.data);

// Email-OTP password recovery (Admin / Institution Chief / Teacher)
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data);
export const verifyResetOtp = (email, otp) => api.post('/auth/verify-reset-otp', { email, otp }).then((r) => r.data);
export const resetPassword = (resetTicket, newPassword) => api.post('/auth/reset-password', { resetTicket, newPassword }).then((r) => r.data);
export const forceChangePassword = (currentPassword, newPassword) =>
  api.post('/auth/force-change-password', { currentPassword, newPassword }).then((r) => r.data);
export const me = () => api.get('/auth/me').then((r) => r.data);
export const lookupInstitution = (code) => api.get(`/auth/institution-lookup/${encodeURIComponent(code)}`).then((r) => r.data);
export const updateProfile = (data) => api.patch('/auth/me', data).then((r) => r.data);
export const heartbeat = () => api.post('/auth/heartbeat').then((r) => r.data);
export const getActiveUsers = () => api.get('/auth/active-users').then((r) => r.data);
export const getActiveIPs = () => api.get('/auth/active-ips').then((r) => r.data);
export const uploadAvatar = (formData) =>
  api.post('/auth/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
