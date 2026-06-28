import { useState, useEffect } from "react";
import { LANGUAGES, Language } from "@/contexts/LanguageContext";

const COUNTRY_TO_LANG: Record<string, string> = {
  US: "en", CA: "en", GB: "en", AU: "en", NZ: "en", IE: "en", ZA: "en",
  ES: "es", MX: "es", AR: "es", CO: "es", PE: "es", CL: "es", VE: "es",
  FR: "fr", BE: "fr", CH: "fr", SN: "fr", CI: "fr",
  DE: "de", AT: "de",
  CN: "zh", TW: "zh", HK: "zh", MO: "zh",
  SA: "ar", AE: "ar", EG: "ar", IQ: "ar", JO: "ar", KW: "ar", QA: "ar",
  BR: "pt", PT: "pt", AO: "pt", MZ: "pt",
  JP: "ja",
  IN: "hi", NP: "hi",
  RU: "ru", BY: "ru", KZ: "ru",
  IT: "it", SM: "it", VA: "it",
  KR: "ko",
  NL: "nl",
  TR: "tr",
  SE: "sv", NO: "sv",
  SG: "en",
};

export type GeoInfo = {
  lang: Language;
  countryName: string;
  countryCode: string;
};

export function useGeoLanguage(): GeoInfo {
  const fallbackLang = (): Language => {
    const navCode = navigator.language?.split("-")[0]?.toLowerCase() ?? "en";
    return LANGUAGES.find(l => l.code === navCode) ?? LANGUAGES[0];
  };

  const [info, setInfo] = useState<GeoInfo>({
    lang: fallbackLang(),
    countryName: "",
    countryCode: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("https://ipapi.co/json/", { signal: controller.signal })
        .then(r => r.json())
        .then((data: { country_code?: string; country_name?: string }) => {
          const cc = data.country_code ?? "";
          const name = data.country_name ?? cc;
          const langCode = COUNTRY_TO_LANG[cc];
          const lang = (langCode ? LANGUAGES.find(l => l.code === langCode) : null) ?? fallbackLang();
          setInfo({ lang, countryName: name, countryCode: cc });
        })
        .catch(() => {});
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return info;
}
