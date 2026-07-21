import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ProtectedRoute({ children, adminOnly = false, teacherOnly = false, studentOnly = false, chiefOnly = false, allowMustChangePassword = false }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="spinner" />;
  if (!user) return <Navigate to="/login" replace />;
  // A student who logged in with a teacher-issued temp password must set their own
  // password before reaching anywhere else — every route is blocked except the one page
  // that itself handles the change (allowMustChangePassword: true on that route only).
  if (user.mustChangePassword && !allowMustChangePassword) return <Navigate to="/create-new-password" replace />;
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  if (teacherOnly && user.role !== 'TEACHER') return <Navigate to="/dashboard" replace />;
  if (studentOnly && user.role !== 'STUDENT') return <Navigate to="/dashboard" replace />;
  if (chiefOnly && user.role !== 'INSTITUTION_CHIEF') return <Navigate to="/dashboard" replace />;

  return children;
}
