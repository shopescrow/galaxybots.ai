import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "gb_sidebar_collapsed";

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return JSON.parse(stored);
    } catch {
    }
    return false;
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);

  return { collapsed, toggle, mobileOpen, openMobile, closeMobile, toggleMobile };
}
