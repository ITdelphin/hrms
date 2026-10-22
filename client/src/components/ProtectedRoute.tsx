import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Spinner } from '@/components/ui';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { owner, loading } = useAuth();
  if (loading) return <Spinner label="Checking session…" />;
  if (!owner) return <Navigate to="/login" replace />;
  return <>{children}</>;
};
