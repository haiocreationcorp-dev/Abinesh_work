import api from './client.js';

export const getAIStatus = () => api.get('/student/ai-status').then((r) => r.data);
export const listStudentTasks = () => api.get('/student/tasks').then((r) => r.data);
export const listInstructors = () => api.get('/student/instructors').then((r) => r.data);
export const joinClass = (classId) => api.post(`/student/classes/${classId}/join`).then((r) => r.data);

export const submitTask = (taskId, comicId, pdfBlob) => {
  const formData = new FormData();
  formData.append('comicId', comicId);
  formData.append('pdf', pdfBlob, 'submission.pdf');
  return api.post(`/student/tasks/${taskId}/submit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};
