import api from './client.js';

export const getBillingSummary = () => api.get('/billing/summary').then((r) => r.data);
export const updateSystemCount = (systemCount) => api.patch('/billing/system-count', { systemCount }).then((r) => r.data);
export const createBillingOrder = (planType) => api.post('/billing/order', { planType }).then((r) => r.data);
export const verifyBillingPayment = (payload) => api.post('/billing/verify', payload).then((r) => r.data);
export const getPaymentHistory = () => api.get('/billing/payments').then((r) => r.data);
