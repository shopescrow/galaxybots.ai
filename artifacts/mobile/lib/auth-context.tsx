import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as Notifications from "expo-notifications";
import {
  getToken,
  setToken,
  removeToken,
  getBiometricEnabled,
  setBiometricEnabled,
  apiFetch,
  apiPost,
  apiDelete,
} from "./api";


interface User {
  id: number;
  email: string;
  clientId: number;
  role: string;
  displayName: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  hasStoredSession: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithBiometric: () => Promise<boolean>;
  logout: () => Promise<void>;
  toggleBiometric: () => Promise<void>;
  authenticateWithBiometric: () => Promise<boolean>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [hasStoredSession, setHasStoredSession] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(hasHardware && isEnrolled);
        const enabled = await getBiometricEnabled();
        setBiometricEnabledState(enabled);
      } catch {}

      try {
        const token = await getToken();
        if (token) {
          const enabled = await getBiometricEnabled();
          if (enabled) {
            setHasStoredSession(true);
          } else {
            const data = await apiFetch<User>("auth/me");
            setUser(data);
          }
        }
      } catch {
        await removeToken();
        setHasStoredSession(false);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiPost<{ user: User; token: string }>("auth/login", {
      email,
      password,
    });
    await setToken(data.token);
    setUser(data.user);
    setHasStoredSession(true);
  }, []);

  const loginWithBiometric = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate to GalaxyBots",
      fallbackLabel: "Use password",
    });
    if (!result.success) return false;

    const token = await getToken();
    if (!token) return false;

    try {
      const data = await apiFetch<User>("auth/me");
      setUser(data);
      return true;
    } catch {
      await removeToken();
      setHasStoredSession(false);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      if (tokenData?.data) {
        await apiDelete("push-tokens/deregister", {
          token: tokenData.data,
        });
      }
    } catch {}
    await removeToken();
    setUser(null);
    setHasStoredSession(false);
  }, []);


  const toggleBiometric = useCallback(async () => {
    const newVal = !biometricEnabled;
    if (newVal) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Enable biometric login",
      });
      if (!result.success) return;
    }
    await setBiometricEnabled(newVal);
    setBiometricEnabledState(newVal);
  }, [biometricEnabled]);

  const authenticateWithBiometric = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate to GalaxyBots",
      fallbackLabel: "Use password",
    });
    return result.success;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        biometricAvailable,
        biometricEnabled,
        hasStoredSession,
        login,
        loginWithBiometric,
        logout,
        toggleBiometric,
        authenticateWithBiometric,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
