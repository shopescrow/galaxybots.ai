import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SSOCallback() {
  const [, navigate] = useLocation();
  const { refreshUser } = useAuth();
  const processed = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      navigate("/login");
      return;
    }

    window.history.replaceState({}, "", window.location.pathname);

    fetch(`${BASE}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "SSO login failed");
        }
        return res.json();
      })
      .then((data) => {
        localStorage.setItem("auth_token", data.token);
        window.location.href = window.location.origin + BASE + "/";
      })
      .catch((err) => {
        setError(err.message);
        setTimeout(() => navigate("/login"), 3000);
      });
  }, [navigate, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-red-400 mb-2">{error}</p>
            <p className="text-slate-400 text-sm">Redirecting to login...</p>
          </>
        ) : (
          <>
            <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-slate-300">Completing sign in...</p>
          </>
        )}
      </div>
    </div>
  );
}
