import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ProtectedRoute({ children, adminOnly = false, teacherOnly = false, studentOnly = false, chiefOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="spinner" />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  if (teacherOnly && user.role !== 'TEACHER') return <Navigate to="/dashboard" replace />;
  if (studentOnly && user.role !== 'STUDENT') return <Navigate to="/dashboard" replace />;
  if (chiefOnly && user.role !== 'INSTITUTION_CHIEF') return <Navigate to="/dashboard" replace />;

  return children;
}
