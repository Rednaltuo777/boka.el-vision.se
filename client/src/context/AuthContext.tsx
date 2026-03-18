import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "../lib/api";
import type { User } from "../types";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  superadminLogin: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

interface RegisterData {
  token: string;
  email: string;
  password: string;
  name: string;
  company: string;
  department: string;
  phone: string;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      void api
        .get<User>("/auth/me")
        .then(setUser)
        .catch(() => localStorage.removeItem("token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const refreshUser = async () => {
    const currentUser = await api.get<User>("/auth/me");
    setUser(currentUser);
  };

  const authenticateWithRoute = async (path: string, email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>(path, { email, password });
    localStorage.setItem("token", res.token);
    setUser(res.user);
  };

  const login = async (email: string, password: string) => {
    await authenticateWithRoute("/auth/login", email, password);
  };

  const superadminLogin = async (email: string, password: string) => {
    await authenticateWithRoute("/auth/superadmin/login", email, password);
  };

  const register = async (data: RegisterData) => {
    const res = await api.post<{ token: string; user: User }>("/auth/register", data);
    localStorage.setItem("token", res.token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, superadminLogin, register, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
