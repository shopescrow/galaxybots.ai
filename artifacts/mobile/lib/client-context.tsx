import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./api";

export interface Client {
  id: number;
  companyName: string;
  status: string;
  plan: string;
}

interface ClientState {
  clients: Client[];
  activeClient: Client | null;
  isLoading: boolean;
  switchClient: (client: Client) => Promise<void>;
  refreshClients: () => Promise<void>;
}

const ACTIVE_CLIENT_KEY = "galaxybots_active_client_id";

const ClientContext = createContext<ClientState | null>(null);

export function useClient(): ClientState {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClient must be used within ClientProvider");
  return ctx;
}

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClients = useCallback(async (): Promise<Client[]> => {
    const response = await apiFetch<{ data: Client[]; nextCursor: number | null; hasMore: boolean }>("clients");
    return response.data ?? [];
  }, []);

  const refreshClients = useCallback(async () => {
    try {
      const data = await fetchClients();
      setClients(data);
      const storedId = await AsyncStorage.getItem(ACTIVE_CLIENT_KEY);
      if (storedId) {
        const found = data.find((c) => c.id === Number(storedId));
        if (found) {
          setActiveClient(found);
          return;
        }
      }
      if (data.length > 0) {
        setActiveClient(data[0]);
        await AsyncStorage.setItem(ACTIVE_CLIENT_KEY, String(data[0].id));
      }
    } catch {
    }
  }, [fetchClients]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        await refreshClients();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshClients]);

  const switchClient = useCallback(async (client: Client) => {
    setActiveClient(client);
    await AsyncStorage.setItem(ACTIVE_CLIENT_KEY, String(client.id));
  }, []);

  return (
    <ClientContext.Provider value={{ clients, activeClient, isLoading, switchClient, refreshClients }}>
      {children}
    </ClientContext.Provider>
  );
}
