import { useState, useCallback, useEffect, useRef } from "react";
import { Check, Shield } from "lucide-react";

interface CaptchaCheckboxProps {
  onVerified: (verified: boolean) => void;
}

export default function CaptchaCheckbox({ onVerified }: CaptchaCheckboxProps) {
  const [state, setState] = useState<"idle" | "verifying" | "verified">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    if (state === "verified") return;
    setState("verifying");
    const delay = 800 + Math.random() * 700;
    timerRef.current = setTimeout(() => {
      setState("verified");
      onVerified(true);
    }, delay);
  }, [state, onVerified]);

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-600 bg-slate-700/30 px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-all duration-200 ${
            state === "verified"
              ? "bg-green-500 border-green-500"
              : state === "verifying"
                ? "border-purple-400 bg-slate-600"
                : "border-slate-500 bg-slate-700 hover:border-purple-400"
          }`}
        >
          {state === "verifying" && (
            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          )}
          {state === "verified" && <Check className="w-4 h-4 text-white" />}
        </button>
        <span className="text-sm text-slate-300 select-none">I'm not a robot</span>
      </div>
      <Shield className="w-5 h-5 text-slate-500" />
    </div>
  );
}
