import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

export type User = { id: string; name: string; email: string };

type AuthState = {
  user: User | null;
  /** true until we know whether the visitor is signed in */
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  loginWithGoogle: (credential: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** The session lives in an httpOnly cookie set by the API; here we only keep who is signed in. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: User | null }>("/auth/me")
      .then((r) => setUser(r.data.data))
      .catch(() => setUser(null)) // API unreachable: behave as a guest; meetings still work
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = (await api.post<{ data: User }>("/auth/login", { email, password })).data.data;
    setUser(u);
    return u;
  }, []);
  const register = useCallback(async (name: string, email: string, password: string) => {
    const u = (await api.post<{ data: User }>("/auth/register", { name, email, password })).data.data;
    setUser(u);
    return u;
  }, []);
  const loginWithGoogle = useCallback(async (credential: string) => {
    const u = (await api.post<{ data: User }>("/auth/google", { credential })).data.data;
    setUser(u);
    return u;
  }, []);
  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, loginWithGoogle, logout }),
    [user, loading, login, register, loginWithGoogle, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
