import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { setCurrency } from '@/lib/format';
import type { Owner } from '@/types';

interface AuthState {
  owner: Owner | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshOwner: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface MeResponse {
  owner: Owner;
  sessions: number;
  notificationProvider: string;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>('/auth/me');
      setOwner(me.owner);
      try {
        const settings = await api.get<{ currency: string }>('/settings');
        setCurrency(settings.currency);
      } catch {
        /* non-fatal */
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setOwner(null);
      else setOwner(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ owner: Owner }>('/auth/login', { email, password });
    setOwner(res.owner);
    try {
      const settings = await api.get<{ currency: string }>('/settings');
      setCurrency(settings.currency);
    } catch {
      /* non-fatal */
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    setOwner(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ owner, loading, login, logout, refreshOwner: loadMe }),
    [owner, loading, login, logout, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
