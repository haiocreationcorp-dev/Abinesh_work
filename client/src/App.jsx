import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ComicProvider } from './context/ComicContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { UIThemeProvider } from './context/UIThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { DragProvider } from './context/DragContext.jsx';
import ProtectedRoute from './components/ui/ProtectedRoute.jsx';
import SiteGate from './components/ui/SiteGate.jsx';
import Navbar from './components/ui/Navbar.jsx';
import CommandPalette from './components/ui/CommandPalette.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import AdminLoginPage from './pages/AdminLoginPage.jsx';
import ChiefLoginPage from './pages/ChiefLoginPage.jsx';
import ChiefDashboardPage from './pages/ChiefDashboardPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ComicEditorPage from './pages/ComicEditorPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import TeacherStudentsPage from './pages/TeacherStudentsPage.jsx';
import TeacherComicViewPage from './pages/TeacherComicViewPage.jsx';
import TeacherTasksPage from './pages/TeacherTasksPage.jsx';
import TeacherSubmissionsPage from './pages/TeacherSubmissionsPage.jsx';
import StudentTasksPage from './pages/StudentTasksPage.jsx';
import TeacherClassesPage from './pages/TeacherClassesPage.jsx';
import StudentInstructorsPage from './pages/StudentInstructorsPage.jsx';

export default function App() {
  return (
    <UIThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <SiteGate>
            <AuthProvider>
              <CommandPalette />
              <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/chief/login" element={<ChiefLoginPage />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Navbar />
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/editor/:comicId"
              element={
                <ProtectedRoute>
                  <ThemeProvider>
                    <ComicProvider>
                      <DragProvider>
                        <ComicEditorPage />
                      </DragProvider>
                    </ComicProvider>
                  </ThemeProvider>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <DragProvider>
                    <AdminPage />
                  </DragProvider>
                </ProtectedRoute>
              }
            />

            <Route
              path="/chief/billing"
              element={
                <ProtectedRoute chiefOnly>
                  <Navbar />
                  <ChiefDashboardPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/teacher/students"
              element={
                <ProtectedRoute teacherOnly>
                  <Navbar />
                  <TeacherStudentsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/teacher/view/:studentId/:comicId"
              element={
                <ProtectedRoute teacherOnly>
                  <Navbar />
                  <TeacherComicViewPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/teacher/tasks"
              element={
                <ProtectedRoute teacherOnly>
                  <Navbar />
                  <TeacherTasksPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/teacher/tasks/:taskId/submissions"
              element={
                <ProtectedRoute teacherOnly>
                  <Navbar />
                  <TeacherSubmissionsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/student/tasks"
              element={
                <ProtectedRoute studentOnly>
                  <Navbar />
                  <StudentTasksPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/teacher/classes"
              element={
                <ProtectedRoute teacherOnly>
                  <Navbar />
                  <TeacherClassesPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/student/instructors"
              element={
                <ProtectedRoute studentOnly>
                  <Navbar />
                  <StudentInstructorsPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AuthProvider>
          </SiteGate>
        </BrowserRouter>
      </ToastProvider>
    </UIThemeProvider>
  );
}
