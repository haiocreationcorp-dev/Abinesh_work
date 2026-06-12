import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ComicProvider } from './context/ComicContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { DragProvider } from './context/DragContext.jsx';
import ProtectedRoute from './components/ui/ProtectedRoute.jsx';
import SiteGate from './components/ui/SiteGate.jsx';
import Navbar from './components/ui/Navbar.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ComicEditorPage from './pages/ComicEditorPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <SiteGate>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

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
                    <Navbar />
                    <AdminPage />
                  </DragProvider>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </SiteGate>
    </BrowserRouter>
  );
}
