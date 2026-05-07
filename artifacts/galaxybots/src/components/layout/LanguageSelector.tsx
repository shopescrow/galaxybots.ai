import { useState, useRef, useEffect } from "react";
import { useLanguage, LANGUAGES } from "@/contexts/LanguageContext";
import { Globe, ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

export function LanguageSelector() {
  const { language, setLanguage, isTranslating } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-tech transition-all duration-200 min-h-[44px] min-w-[44px] justify-center",
          open
            ? "bg-primary/10 border-primary/40 text-primary"
            : "border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
        )}
        title="Select language"
        aria-label="Select language"
      >
        {isTranslating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Globe className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">{language.flag}</span>
        <span className="hidden lg:inline max-w-[60px] truncate">{language.nativeName}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
            className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border/60 bg-card shadow-2xl shadow-black/40 overflow-hidden z-50"
          >
            <div className="p-2 border-b border-border/30">
              <p className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground px-2 py-1">Select Language</p>
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => { setLanguage(lang); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]",
                    language.code === lang.code
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <span className="text-base w-6 text-center">{lang.flag}</span>
                  <div className="flex-1 text-left">
                    <div className="font-tech text-xs font-medium">{lang.name}</div>
                    <div className="text-[10px] text-muted-foreground">{lang.nativeName}</div>
                  </div>
                  {language.code === lang.code && (
                    <Check className="w-3.5 h-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
