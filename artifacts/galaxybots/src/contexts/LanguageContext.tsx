import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type Language = {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  dir?: "rtl" | "ltr";
};

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦", dir: "rtl" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇧🇷" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", flag: "🇸🇪" },
];

type TranslationCache = Record<string, Record<string, string>>;

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  translate: (texts: string[]) => Promise<string[]>;
  translateOne: (text: string) => Promise<string>;
  isTranslating: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const savedCode = localStorage.getItem("galaxybots_language") || "en";
  const initialLang = LANGUAGES.find(l => l.code === savedCode) || LANGUAGES[0];
  const [language, setLanguageState] = useState<Language>(initialLang);
  const [isTranslating, setIsTranslating] = useState(false);
  const cacheRef = useRef<TranslationCache>({});

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("galaxybots_language", lang.code);
    document.documentElement.dir = lang.dir || "ltr";
    document.documentElement.lang = lang.code;
  }, []);

  useEffect(() => {
    document.documentElement.dir = language.dir || "ltr";
    document.documentElement.lang = language.code;
  }, []);

  const translate = useCallback(async (texts: string[]): Promise<string[]> => {
    if (language.code === "en") return texts;

    const cache = cacheRef.current;
    const langCache = cache[language.code] || {};

    const uncached = texts.filter(t => !langCache[t]);

    if (uncached.length > 0) {
      setIsTranslating(true);
      try {
        const res = await fetch(`${BASE}/api/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: uncached, targetLanguage: language.code }),
        });
        if (res.ok) {
          const data = await res.json();
          const newCache = { ...langCache };
          uncached.forEach((orig, i) => {
            newCache[orig] = data.translations[i] || orig;
          });
          cacheRef.current[language.code] = newCache;
        }
      } catch (e) {
        console.warn("Translation request failed", e);
      } finally {
        setIsTranslating(false);
      }
    }

    const finalCache = cacheRef.current[language.code] || {};
    return texts.map(t => finalCache[t] || t);
  }, [language.code]);

  const translateOne = useCallback(async (text: string): Promise<string> => {
    const results = await translate([text]);
    return results[0];
  }, [translate]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, translate, translateOne, isTranslating }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function useTranslatedStrings(strings: string[]) {
  const { translate, language } = useLanguage();
  const [translated, setTranslated] = useState<string[]>(strings);
  const key = strings.join("|");

  useEffect(() => {
    let cancelled = false;
    translate(strings).then(result => {
      if (!cancelled) setTranslated(result);
    });
    return () => { cancelled = true; };
  }, [language.code, key]);

  return translated;
}
