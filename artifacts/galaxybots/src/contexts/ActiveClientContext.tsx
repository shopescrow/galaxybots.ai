import { createContext, useContext, useState, ReactNode } from "react";

interface ActiveClientContextType {
  activeClientId: number | null;
  activeClientName: string | null;
  setActiveClient: (id: number, name: string) => void;
  clearActiveClient: () => void;
}

const ActiveClientContext = createContext<ActiveClientContextType>({
  activeClientId: null,
  activeClientName: null,
  setActiveClient: () => {},
  clearActiveClient: () => {},
});

function readStoredClient(): { id: number; name: string } | null {
  try {
    const raw = localStorage.getItem("galaxybots_active_client");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.id === "number" && typeof parsed?.name === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function ActiveClientProvider({ children }: { children: ReactNode }) {
  const stored = readStoredClient();
  const [activeClientId, setActiveClientId] = useState<number | null>(stored?.id ?? null);
  const [activeClientName, setActiveClientName] = useState<string | null>(stored?.name ?? null);

  const setActiveClient = (id: number, name: string) => {
    setActiveClientId(id);
    setActiveClientName(name);
    localStorage.setItem("galaxybots_active_client", JSON.stringify({ id, name }));
  };

  const clearActiveClient = () => {
    setActiveClientId(null);
    setActiveClientName(null);
    localStorage.removeItem("galaxybots_active_client");
  };

  return (
    <ActiveClientContext.Provider value={{ activeClientId, activeClientName, setActiveClient, clearActiveClient }}>
      {children}
    </ActiveClientContext.Provider>
  );
}

export function useActiveClient() {
  return useContext(ActiveClientContext);
}
