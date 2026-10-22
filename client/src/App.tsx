import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Properties } from '@/pages/Properties';
import { Tenants } from '@/pages/Tenants';
import { Leases } from '@/pages/Leases';
import { Payments } from '@/pages/Payments';
import { Maintenance } from '@/pages/Maintenance';
import { Reports } from '@/pages/Reports';
import { Notifications } from '@/pages/Notifications';
import { Settings } from '@/pages/Settings';

const PublicOnly = ({ children }: { children: React.ReactNode }) => {
  const { owner, loading } = useAuth();
  if (!loading && owner) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export const App = () => (
  <Routes>
    <Route
      path="/login"
      element={
        <PublicOnly>
          <Login />
        </PublicOnly>
      }
    />
    <Route
      element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }
    >
      <Route path="/" element={<Dashboard />} />
      <Route path="/properties" element={<Properties />} />
      <Route path="/tenants" element={<Tenants />} />
      <Route path="/leases" element={<Leases />} />
      <Route path="/payments" element={<Payments />} />
      <Route path="/maintenance" element={<Maintenance />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/settings" element={<Settings />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
