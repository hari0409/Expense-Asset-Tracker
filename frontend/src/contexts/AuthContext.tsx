import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { AuthUser } from '../api';

type AuthState =
  | { status: 'loading' }
  | { status: 'setup-required' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser };

interface AuthContextValue {
  state: AuthState;
  setAuthenticated: (user: AuthUser) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = async () => {
    try {
      const { setupRequired } = await api.getAuthStatus();
      if (setupRequired) {
        setState({ status: 'setup-required' });
        return;
      }
      try {
        const user = await api.getMe();
        setState({ status: 'authenticated', user });
      } catch {
        setState({ status: 'unauthenticated' });
      }
    } catch {
      setState({ status: 'unauthenticated' });
    }
  };

  useEffect(() => { refresh(); }, []);

  const setAuthenticated = (user: AuthUser) => setState({ status: 'authenticated', user });

  const logout = async () => {
    await api.logout().catch(() => {});
    setState({ status: 'unauthenticated' });
  };

  return (
    <AuthContext.Provider value={{ state, setAuthenticated, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
