import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";
import { useAuth } from "./AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const ACCENT_COLOR_MAP: Record<string, string> = {
  purple: "270 80% 60%",
  cyan: "190 90% 50%",
  gold: "45 100% 55%",
  green: "142 76% 45%",
  orange: "25 95% 55%",
  red: "0 84% 60%",
  blue: "217 91% 60%",
  slate: "215 20% 55%",
};

const FONT_SIZE_MAP: Record<string, string> = {
  sm: "14px",
  md: "16px",
  lg: "18px",
  xl: "20px",
};

export interface UserPreferences {
  id: number;
  userId: number;
  logoUrl: string | null;
  accentColor: string;
  fontSize: string;
  showBillingWidget: boolean;
}

interface UserPreferencesContextType {
  preferences: UserPreferences | null;
  isLoading: boolean;
  updatePreferences: (updates: Partial<Pick<UserPreferences, "accentColor" | "fontSize" | "showBillingWidget" | "logoUrl">>) => Promise<void>;
  uploadLogo: (file: File) => Promise<void>;
  removeLogo: () => Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | null>(null);

function applyPreferences(prefs: UserPreferences | null) {
  const root = document.documentElement;

  if (prefs?.accentColor && ACCENT_COLOR_MAP[prefs.accentColor]) {
    const hsl = ACCENT_COLOR_MAP[prefs.accentColor];
    root.style.setProperty("--primary", hsl);
    root.style.setProperty("--ring", hsl);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
  }

  root.classList.remove("text-scale-sm", "text-scale-md", "text-scale-lg", "text-scale-xl");
  if (prefs?.fontSize) {
    root.classList.add(`text-scale-${prefs.fontSize}`);
  }
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!token || !user) {
      setPreferences(null);
      setIsLoading(false);
      applyPreferences(null);
      fetchedRef.current = false;
      return;
    }

    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch(`${BASE}/api/user/preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch preferences");
        return res.json();
      })
      .then(async (data) => {
        if (data.hasLogo) {
          try {
            const logoRes = await fetch(`${BASE}/api/user/preferences/logo/serve`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (logoRes.ok) {
              const blob = await logoRes.blob();
              data.logoUrl = URL.createObjectURL(blob);
            } else {
              data.logoUrl = null;
            }
          } catch {
            data.logoUrl = null;
          }
        } else {
          data.logoUrl = null;
        }
        setPreferences(data);
        applyPreferences(data);
      })
      .catch((err) => {
        console.warn("Failed to load user preferences:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token, user]);

  const updatePreferences = useCallback(
    async (updates: Partial<Pick<UserPreferences, "accentColor" | "fontSize" | "showBillingWidget" | "logoUrl">>) => {
      if (!token) return;

      const res = await fetch(`${BASE}/api/user/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error("Failed to update preferences");

      const updated = await res.json();
      if (updated.hasLogo && preferences?.logoUrl) {
        updated.logoUrl = preferences.logoUrl;
      } else if (!updated.hasLogo) {
        updated.logoUrl = null;
      }
      setPreferences(updated);
      applyPreferences(updated);
    },
    [token, preferences]
  );

  const uploadLogo = useCallback(
    async (file: File) => {
      if (!token) return;

      const uploadRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!uploadRes.ok) throw new Error("Failed to request upload URL");

      const { uploadURL, objectPath } = await uploadRes.json();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!putRes.ok) throw new Error("Failed to upload file");

      const res2 = await fetch(`${BASE}/api/user/preferences/logo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ objectPath }),
      });

      if (!res2.ok) throw new Error("Failed to save logo");

      const updated = await res2.json();

      const logoRes = await fetch(`${BASE}/api/user/preferences/logo/serve`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (logoRes.ok) {
        const blob = await logoRes.blob();
        updated.logoUrl = URL.createObjectURL(blob);
      }
      setPreferences(updated);
      applyPreferences(updated);
    },
    [token]
  );

  const removeLogo = useCallback(async () => {
    if (!token) return;

    const res = await fetch(`${BASE}/api/user/preferences/logo`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to remove logo");

    const updated = await res.json();
    setPreferences(updated);
    applyPreferences(updated);
  }, [token]);

  return (
    <UserPreferencesContext.Provider
      value={{ preferences, isLoading, updatePreferences, uploadLogo, removeLogo }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) throw new Error("useUserPreferences must be used within UserPreferencesProvider");
  return ctx;
}

export { ACCENT_COLOR_MAP, FONT_SIZE_MAP };
