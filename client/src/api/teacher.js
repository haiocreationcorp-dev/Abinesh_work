import api from './client.js';

export const listStudents = () => api.get('/teacher/students').then((r) => r.data);
export const listStudentComics = (studentId) => api.get(`/teacher/students/${studentId}/comics`).then((r) => r.data);
export const getStudentComic = (studentId, comicId) => api.get(`/teacher/students/${studentId}/comics/${comicId}`).then((r) => r.data);

export const createTask = (data) => api.post('/teacher/tasks', data).then((r) => r.data);
export const listTeacherTasks = () => api.get('/teacher/tasks').then((r) => r.data);
export const listTaskSubmissions = (taskId) => api.get(`/teacher/tasks/${taskId}/submissions`).then((r) => r.data);
export const gradeSubmission = (submissionId, data) => api.patch(`/teacher/submissions/${submissionId}/grade`, data).then((r) => r.data);

export const createClass = (name) => api.post('/teacher/classes', { name }).then((r) => r.data);
export const listClasses = () => api.get('/teacher/classes').then((r) => r.data);
export const deleteClass = (id) => api.delete(`/teacher/classes/${id}`).then((r) => r.data);
export const updateEnrollment = (classId, enrollmentId, status) =>
  api.patch(`/teacher/classes/${classId}/enrollments/${enrollmentId}`, { status }).then((r) => r.data);
