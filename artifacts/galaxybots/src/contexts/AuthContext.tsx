import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface OnboardingState {
  companyProfile: boolean;
  firstClient: boolean;
  industry: boolean;
  integrations: boolean;
  firstMission: boolean;
  dismissed: boolean;
  completedAt: string | null;
}

interface AuthUser {
  id: number;
  email: string;
  clientId: number;
  role: string;
  displayName?: string | null;
  plan?: string;
  bypassPayment?: boolean;
  onboarding?: OnboardingState | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateOnboarding: (updates: Partial<OnboardingState>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  companyName: string;
  contactName: string;
  displayName?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth_token");
  }, []);

  const fetchUser = useCallback(async (authToken: string) => {
    const res = await fetch(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error("Not authenticated");
    return res.json();
  }, []);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetchUser(token)
      .then((data) => {
        setUser(data);
      })
      .catch(() => {
        clearAuth();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token, clearAuth, fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error("Login failed. Please try again.");
    }

    if (!res.ok) {
      let message = "Login failed. Please try again.";
      try {
        const data = await res.json();
        if (data.error) message = data.error;
      } catch {}
      throw new Error(message);
    }

    const data = await res.json();
    setToken(data.token);
    localStorage.setItem("auth_token", data.token);

    const userData = await fetchUser(data.token);
    setUser(userData);
  }, [fetchUser]);

  const register = useCallback(async (registerData: RegisterData) => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerData),
      });
    } catch {
      throw new Error("Registration failed. Please try again.");
    }

    if (!res.ok) {
      let message = "Registration failed. Please try again.";
      try {
        const data = await res.json();
        if (data.error) message = data.error;
      } catch {}
      throw new Error(message);
    }

    const data = await res.json();
    setToken(data.token);
    localStorage.setItem("auth_token", data.token);

    const userData = await fetchUser(data.token);
    setUser(userData);
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        clearAuth();
        if (data.idpLogoutUrl) {
          window.location.href = data.idpLogoutUrl;
          return;
        }
      }
    } catch {}
    clearAuth();
  }, [clearAuth, token]);

  const updateOnboarding = useCallback(async (updates: Partial<OnboardingState>) => {
    if (!token) return;
    const res = await fetch(`${BASE}/api/onboarding`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update onboarding");
    const onboarding = await res.json();
    setUser((prev) => prev ? { ...prev, onboarding } : prev);
  }, [token]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchUser(token);
      setUser(data);
    } catch {}
  }, [token, fetchUser]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, updateOnboarding, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
