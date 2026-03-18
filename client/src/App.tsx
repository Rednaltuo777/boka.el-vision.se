import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import SuperadminLoginPage from "./pages/SuperadminLoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ForcePasswordChangePage from "./pages/ForcePasswordChangePage";
import RegisterPage from "./pages/RegisterPage";
import CalendarPage from "./pages/CalendarPage";
import BookingPage from "./pages/BookingPage";
import NewBookingPage from "./pages/NewBookingPage";
import UsersPage from "./pages/UsersPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import StatisticsPage from "./pages/StatisticsPage";

const HIDDEN_SYSTEM_LOGIN_PATH = "/system-access-8f2c1d";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Laddar...</div>;
  if (!user) return <Navigate to="/login" />;
  if (user.forcePasswordChange) return <Navigate to="/force-password-change" />;
  return <>{children}</>;
}

function ForcedPasswordChangeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Laddar...</div>;
  if (!user) return <Navigate to="/login" />;
  if (!user.forcePasswordChange) return <Navigate to="/" />;
  return <ForcePasswordChangePage />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Laddar...</div>;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== "admin" && user.role !== "superadmin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Laddar...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/superadmin/login" element={<Navigate to="/login" replace />} />
      <Route path={HIDDEN_SYSTEM_LOGIN_PATH} element={user ? <Navigate to="/" /> : <SuperadminLoginPage />} />
      <Route path="/forgot-password" element={user && !user.forcePasswordChange ? <Navigate to="/" /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={user && !user.forcePasswordChange ? <Navigate to="/" /> : <ResetPasswordPage />} />
      <Route path="/force-password-change" element={<ForcedPasswordChangeRoute />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<CalendarPage />} />
        <Route path="bookings/new" element={<NewBookingPage />} />
        <Route path="bookings/:id" element={<BookingPage />} />
        <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
        <Route path="settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="statistics" element={<AdminRoute><StatisticsPage /></AdminRoute>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}
