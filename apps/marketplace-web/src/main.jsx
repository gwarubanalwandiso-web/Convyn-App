import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, RequireAuth } from './auth';
import { AppShell } from './components/shared';
import { AuthPage, Directory, Home, NotFound } from './pages/public';
import { Dashboard, RequestDetail, RequestWizard } from './pages/customer';
import { ProviderHub, ProviderOnboarding } from './pages/provider';
import { Bookings } from './pages/bookings';
import { Admin } from './pages/admin';
import './index.css';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10000, refetchOnWindowFocus: true },
  },
});
function Private({ children, admin = false }) {
  return (
    <RequireAuth admin={admin}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/providers" element={<Directory />} />
            {['login', 'register', 'forgot-password', 'reset-password'].map(
              (mode) => (
                <Route
                  key={mode}
                  path={'/' + mode}
                  element={<AuthPage key={mode} mode={mode} />}
                />
              ),
            )}
            <Route
              path="/dashboard"
              element={
                <Private>
                  <Dashboard />
                </Private>
              }
            />
            <Route
              path="/requests/new"
              element={
                <Private>
                  <RequestWizard />
                </Private>
              }
            />
            <Route
              path="/requests/:id"
              element={
                <Private>
                  <RequestDetail />
                </Private>
              }
            />
            <Route
              path="/bookings"
              element={
                <Private>
                  <Bookings />
                </Private>
              }
            />
            <Route
              path="/provider"
              element={
                <Private>
                  <ProviderHub />
                </Private>
              }
            />
            <Route
              path="/provider/onboarding"
              element={
                <Private>
                  <ProviderOnboarding />
                </Private>
              }
            />
            <Route
              path="/admin"
              element={
                <Private admin>
                  <Admin />
                </Private>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
