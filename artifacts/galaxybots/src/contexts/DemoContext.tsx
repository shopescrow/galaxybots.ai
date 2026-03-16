import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DemoSession {
  token: string;
  sessionToken: string;
  clientId: number;
  taskSessionId: number;
  expiresAt: string;
  company: {
    name: string;
    industry: string;
    context: string;
  };
  mission: string;
  team?: Array<{
    id: number;
    name: string;
    title: string;
    department: string;
  }>;
}

interface DemoROI {
  estimatedHoursSaved: number;
  estimatedCostSavings: number;
  hourlyRate: number;
  messageCount: number;
  missionObjective: string;
}

interface DemoContextType {
  demoSession: DemoSession | null;
  isDemo: boolean;
  isStarting: boolean;
  remainingMs: number;
  roiData: DemoROI | null;
  missionCompleted: boolean;
  startDemo: () => Promise<void>;
  completeDemo: () => Promise<void>;
  clearDemo: () => void;
  getDemoToken: () => string | null;
}

const DemoContext = createContext<DemoContextType | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [demoSession, setDemoSession] = useState<DemoSession | null>(() => {
    const stored = localStorage.getItem("demo_session");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (new Date(parsed.expiresAt) > new Date()) return parsed;
        localStorage.removeItem("demo_session");
      } catch {}
    }
    return null;
  });
  const [isStarting, setIsStarting] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [roiData, setRoiData] = useState<DemoROI | null>(null);
  const [missionCompleted, setMissionCompleted] = useState(false);

  useEffect(() => {
    if (!demoSession) {
      setRemainingMs(0);
      return;
    }

    const update = () => {
      const ms = Math.max(0, new Date(demoSession.expiresAt).getTime() - Date.now());
      setRemainingMs(ms);
      if (ms <= 0) {
        setDemoSession(null);
        localStorage.removeItem("demo_session");
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [demoSession]);

  const startDemo = useCallback(async () => {
    setIsStarting(true);
    try {
      const res = await fetch(`${BASE}/api/demo/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to start demo" }));
        throw new Error(data.error || "Failed to start demo");
      }

      const data = await res.json();
      const session: DemoSession = {
        token: data.token,
        sessionToken: data.sessionToken,
        clientId: data.clientId,
        taskSessionId: data.taskSessionId,
        expiresAt: data.expiresAt,
        company: data.company,
        mission: data.mission,
        team: data.team,
      };

      setDemoSession(session);
      setMissionCompleted(false);
      setRoiData(null);
      localStorage.setItem("demo_session", JSON.stringify(session));
    } finally {
      setIsStarting(false);
    }
  }, []);

  const completeDemo = useCallback(async () => {
    if (!demoSession) return;

    try {
      const res = await fetch(`${BASE}/api/demo/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${demoSession.token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setRoiData(data);
        setMissionCompleted(true);
      }
    } catch (err) {
      console.error("Demo complete error:", err);
    }
  }, [demoSession]);

  const clearDemo = useCallback(() => {
    setDemoSession(null);
    setRoiData(null);
    setMissionCompleted(false);
    localStorage.removeItem("demo_session");
  }, []);

  const getDemoToken = useCallback(() => {
    return demoSession?.token || null;
  }, [demoSession]);

  return (
    <DemoContext.Provider
      value={{
        demoSession,
        isDemo: !!demoSession,
        isStarting,
        remainingMs,
        roiData,
        missionCompleted,
        startDemo,
        completeDemo,
        clearDemo,
        getDemoToken,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
