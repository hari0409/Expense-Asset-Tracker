import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import BudgetHistory from './pages/BudgetHistory';
import RentOuts from './pages/RentOuts';
import Savings from './pages/Savings';
import Assets from './pages/Assets';
import Mapping from './pages/Mapping';
import Loans from './pages/Loans';
import Reports from './pages/Reports';
import Config from './pages/Config';

function RequireAuth() {
  const { state } = useAuth();
  if (state.status === 'loading') return null;
  if (state.status !== 'authenticated') return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RedirectIfAuthed() {
  const { state } = useAuth();
  if (state.status === 'loading') return null;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<Login />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/savings/mapping" element={<Mapping />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="expenses/history" element={<BudgetHistory />} />
              <Route path="rent-outs" element={<RentOuts />} />
              <Route path="savings" element={<Savings />} />
              <Route path="assets" element={<Assets />} />
              <Route path="loans" element={<Loans />} />
              <Route path="reports" element={<Reports />} />
              <Route path="config" element={<Config />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
