import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function SSOCallback() {
  const [, navigate] = useLocation();
  const { refreshUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const success = params.get("success");

    if (success === "true" && token) {
      localStorage.setItem("auth_token", token);
      window.history.replaceState({}, "", window.location.pathname);
      window.location.href = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "") + "/";
    } else {
      navigate("/login");
    }
  }, [navigate, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-300">Completing sign in...</p>
      </div>
    </div>
  );
}
