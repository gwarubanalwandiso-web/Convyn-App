import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { api, restoreSession, setAccessToken } from './lib';
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    cache = useQueryClient();
  useEffect(() => {
    let active = true;
    const end = () => {
      setUser(null);
      setAccessToken('');
      localStorage.removeItem('convyn-session');
      cache.clear();
    };
    window.addEventListener('convyn-session-ended', end);
    const oauth = window.location.hash === '#signed-in';
    if (oauth) window.history.replaceState({}, '', window.location.pathname);
    if (localStorage.getItem('convyn-session') || oauth)
      restoreSession()
        .then((result) => {
          if (active) {
            setUser(result.user);
            localStorage.setItem('convyn-session', '1');
          }
        })
        .catch(end)
        .finally(() => {
          if (active) setLoading(false);
        });
    else setLoading(false);
    return () => {
      active = false;
      window.removeEventListener('convyn-session-ended', end);
    };
  }, [cache]);
  const accept = (result) => {
    cache.clear();
    setAccessToken(result.accessToken);
    setUser(result.user);
    localStorage.setItem('convyn-session', '1');
    return result.user;
  };
  async function login(email, password) {
    return accept(
      await api('auth/login', { body: { email, password }, retry: false }),
    );
  }
  async function register(data) {
    return accept(
      await api('marketplace/auth/register', { body: data, retry: false }),
    );
  }
  async function logout() {
    await api('auth/logout', { body: {}, retry: false });
    setAccessToken('');
    setUser(null);
    localStorage.removeItem('convyn-session');
    cache.clear();
  }
  return (
    <Context.Provider
      value={{ user, setUser, loading, login, register, logout }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
export function RequireAuth({ children, admin = false }) {
  const { user, loading } = useAuth(),
    location = useLocation();
  if (loading)
    return (
      <main className="loading" role="status">
        Opening your workspace…
      </main>
    );
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && user.role !== 'ADMIN')
    return (
      <main className="access-denied">
        <p className="eyebrow">Account permissions</p>
        <h1>Administrator access required</h1>
        <p>Your account does not have access to this workspace.</p>
        <a href="/dashboard">Return to your dashboard</a>
      </main>
    );
  return children;
}
