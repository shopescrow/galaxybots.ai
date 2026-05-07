import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type PartnerBranding = {
  ref: string;
  partnerName: string;
  partnerLogo: string | null;
  primaryColor: string | null;
};

type PartnerContextType = {
  partner: PartnerBranding | null;
  setPartner: (partner: PartnerBranding | null) => void;
  clearPartner: () => void;
};

const STORAGE_KEY = "galaxybots_partner";
const ORIGINAL_PRIMARY_KEY = "galaxybots_original_primary";

function hexToHslString(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const PartnerContext = createContext<PartnerContextType>({
  partner: null,
  setPartner: () => {},
  clearPartner: () => {},
});

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [partner, setPartnerState] = useState<PartnerBranding | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (partner) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(partner));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [partner]);

  useEffect(() => {
    const root = document.documentElement;
    if (partner?.primaryColor) {
      const hsl = hexToHslString(partner.primaryColor);
      if (hsl) {
        const original = root.style.getPropertyValue("--primary") || getComputedStyle(root).getPropertyValue("--primary").trim();
        if (original) {
          sessionStorage.setItem(ORIGINAL_PRIMARY_KEY, original);
        }
        root.style.setProperty("--primary", hsl);
      }
    } else {
      const original = sessionStorage.getItem(ORIGINAL_PRIMARY_KEY);
      if (original) {
        root.style.setProperty("--primary", original);
        sessionStorage.removeItem(ORIGINAL_PRIMARY_KEY);
      } else {
        root.style.removeProperty("--primary");
      }
    }
  }, [partner?.primaryColor]);

  const setPartner = (newPartner: PartnerBranding | null) => {
    setPartnerState(newPartner);
  };

  const clearPartner = () => {
    setPartnerState(null);
  };

  return (
    <PartnerContext.Provider value={{ partner, setPartner, clearPartner }}>
      {children}
    </PartnerContext.Provider>
  );
}

export function usePartner() {
  return useContext(PartnerContext);
}
