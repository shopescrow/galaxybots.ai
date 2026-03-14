import { AppLayout } from "@/components/layout/AppLayout";
import { motion, useReducedMotion } from "framer-motion";
import { useLanguage, LANGUAGES, useTranslatedStrings } from "@/contexts/LanguageContext";
import { Globe, Zap, MessageSquare, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DEMO_PHRASES = [
  { en: "Fortune 500 Intelligence, deployed for you.", key: "phrase1" },
  { en: "Your AI executive board is ready.", key: "phrase2" },
  { en: "Strategic decisions at the speed of thought.", key: "phrase3" },
];

function TranslationDemo() {
  const prefersReducedMotion = useReducedMotion();
  const { language } = useLanguage();
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [translations, setTranslations] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function fetchTranslation(lang: typeof LANGUAGES[0]) {
    if (lang.code === "en") {
      setSelectedLang(lang);
      return;
    }
    if (translations[lang.code]) {
      setSelectedLang(lang);
      return;
    }
    setLoading(lang.code);
    try {
      const res = await fetch(`${BASE}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texts: DEMO_PHRASES.map(p => p.en),
          targetLanguage: lang.code,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranslations(prev => ({ ...prev, [lang.code]: data.translations }));
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(null);
      setSelectedLang(lang);
    }
  }

  const currentTexts = selectedLang.code === "en"
    ? DEMO_PHRASES.map(p => p.en)
    : (translations[selectedLang.code] || DEMO_PHRASES.map(p => p.en));

  return (
    <div className="rounded-2xl border border-primary/20 bg-card overflow-hidden">
      <div className="border-b border-border/40 p-4 bg-secondary/30">
        <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-3">Live Translation Demo — Click a Language</div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => fetchTranslation(lang)}
              disabled={loading === lang.code}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-tech border transition-all duration-200 ${
                selectedLang.code === lang.code
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              <span>{lang.flag}</span>
              <span className="hidden sm:inline">{lang.name}</span>
              {loading === lang.code && <span className="animate-pulse">...</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6 space-y-4 min-h-[140px]">
        {currentTexts.map((text, i) => (
          <motion.div
            key={`${selectedLang.code}-${i}`}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 5  }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: prefersReducedMotion ? 0 : i * 0.1   }}
            className="flex items-start gap-3"
          >
            <span className="text-lg">{selectedLang.flag}</span>
            <p className={`text-foreground/90 font-medium leading-relaxed ${selectedLang.dir === "rtl" ? "text-right w-full" : ""}`}
               dir={selectedLang.dir || "ltr"}>
              {text}
            </p>
          </motion.div>
        ))}
        {selectedLang.code !== "en" && !translations[selectedLang.code] && (
          <div className="text-muted-foreground text-sm font-tech animate-pulse">Translating...</div>
        )}
      </div>
    </div>
  );
}

const STAT_STRINGS = [
  "Languages Supported",
  "AI Directors Available",
  "Real-Time Translation",
  "Bot Responses In Your Language",
];

export default function Global() {
  const prefersReducedMotion = useReducedMotion();
  const translated = useTranslatedStrings(STAT_STRINGS);

  const regions = [
    { name: "Americas", langs: ["🇺🇸 English", "🇪🇸 Spanish", "🇧🇷 Portuguese"], color: "text-cyan", border: "border-cyan/20", bg: "bg-cyan/5" },
    { name: "Europe", langs: ["🇫🇷 French", "🇩🇪 German", "🇮🇹 Italian", "🇳🇱 Dutch", "🇸🇪 Swedish", "🇹🇷 Turkish", "🇷🇺 Russian"], color: "text-primary", border: "border-primary/20", bg: "bg-primary/5" },
    { name: "Asia Pacific", langs: ["🇨🇳 Chinese", "🇯🇵 Japanese", "🇰🇷 Korean", "🇮🇳 Hindi"], color: "text-gold", border: "border-gold/20", bg: "bg-gold/5" },
    { name: "Middle East", langs: ["🇸🇦 Arabic"], color: "text-purple", border: "border-purple/20", bg: "bg-purple/5" },
  ];

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16 sm:py-24 space-y-20 max-w-6xl">

        {/* Hero */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.7 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 text-xs font-tech text-primary uppercase tracking-widest mb-8">
            <Globe className="w-3.5 h-3.5" />
            Multilingual Intelligence Platform
          </div>
          <h1 className="text-2xl sm:text-5xl lg:text-6xl font-display font-bold mb-6 leading-tight">
            One Board.<br />
            <span className="text-gradient">Every Language.</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            GalaxyBots.ai operates in 15 languages across every major global market. Your AI directors think, advise, and respond in the language of your business — wherever in the world you operate.
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { value: "15", label: translated[0], icon: Globe, color: "text-cyan" },
            { value: "51", label: translated[1], icon: MessageSquare, color: "text-primary" },
            { value: "< 2s", label: translated[2], icon: Zap, color: "text-gold" },
            { value: "100%", label: translated[3], icon: CheckCircle, color: "text-purple" },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: prefersReducedMotion ? 0 : i * 0.1   }}
              className="p-5 rounded-2xl border border-border/40 bg-card text-center"
            >
              <stat.icon className={`w-6 h-6 ${stat.color} mx-auto mb-3`} />
              <div className={`text-3xl font-display font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground font-tech mt-1.5">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Live Translation Demo */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="mb-6">
            <div className="text-xs font-tech uppercase tracking-widest text-primary mb-2">Live Demo</div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">See It In Action</h2>
            <p className="text-muted-foreground mt-2">Click any language to instantly translate GalaxyBots.ai content in real time using our AI translation engine.</p>
          </div>
          <TranslationDemo />
        </motion.section>

        {/* Regional Coverage */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="mb-8">
            <div className="text-xs font-tech uppercase tracking-widest text-primary mb-2">Global Coverage</div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">Regions & Languages</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {regions.map((region, i) => (
              <motion.div
                key={i}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: prefersReducedMotion ? 0 : i * 0.1   }}
                className={`p-5 rounded-2xl border ${region.border} ${region.bg}`}
              >
                <div className={`text-sm font-display font-bold uppercase tracking-wide ${region.color} mb-4`}>{region.name}</div>
                <div className="space-y-2">
                  {region.langs.map((lang, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm text-foreground/80">
                      <CheckCircle className={`w-3.5 h-3.5 ${region.color} shrink-0`} />
                      {lang}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Language Grid */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="mb-8">
            <div className="text-xs font-tech uppercase tracking-widest text-primary mb-2">All Languages</div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">15 Supported Languages</h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {LANGUAGES.map((lang, i) => (
              <motion.div
                key={lang.code}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9  }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: prefersReducedMotion ? 0 : i * 0.05   }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/30 bg-card hover:border-primary/30 transition-colors group"
              >
                <span className="text-3xl">{lang.flag}</span>
                <div className="text-center">
                  <div className="text-xs font-tech font-bold text-foreground group-hover:text-primary transition-colors">{lang.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5" dir={lang.dir}>{lang.nativeName}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* How It Works */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl border border-primary/20 bg-card p-10"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-6">
              <div>
                <div className="text-xs font-tech uppercase tracking-widest text-primary mb-2">How It Works</div>
                <h2 className="text-2xl sm:text-3xl font-display font-bold">Powered by AI Translation</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                GalaxyBots.ai uses the Replit AI Integration (GPT-5.2) to power real-time translation of the entire platform — including UI text, bot descriptions, and live AI chat responses. No third-party translation API required.
              </p>
              <div className="space-y-4">
                {[
                  { step: "01", text: "Select your language from the navbar selector" },
                  { step: "02", text: "UI strings are translated and cached automatically" },
                  { step: "03", text: "Chat with any of the 51 directors — they respond in your language" },
                  { step: "04", text: "Your language preference is saved across sessions" },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-4">
                    <span className="text-primary font-display font-bold text-sm min-w-[2rem]">{item.step}</span>
                    <span className="text-foreground/80">{item.text}</span>
                  </div>
                ))}
              </div>
              <Link href="/bots">
                <Button variant="glow" className="gap-2">
                  Chat with a Director <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
            <div className="space-y-4">
              {/* Chat mockup showing multilingual */}
              {[
                { lang: "🇫🇷", msg: "Quelle est votre stratégie pour le marché européen ?", from: "user" },
                { lang: "🤖", msg: "En tant que Directeur des Ventes, ma recommandation est d'établir d'abord une présence en France et en Allemagne — les marchés les plus rentables de l'UE...", from: "bot" },
                { lang: "🇯🇵", msg: "日本市場への参入戦略について教えてください。", from: "user" },
                { lang: "🤖", msg: "日本市場は独自の特性を持っています。まず、信頼関係の構築が最優先です...", from: "bot" },
              ].map((msg, i) => (
                <motion.div
                  key={i}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: msg.from === "user" ? -20 : 20  }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: prefersReducedMotion ? 0 : i * 0.15   }}
                  className={`flex gap-3 ${msg.from === "bot" ? "justify-end" : ""}`}
                >
                  {msg.from === "user" && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-base shrink-0">{msg.lang}</div>
                  )}
                  <div className={`rounded-xl px-4 py-3 text-sm max-w-[80%] ${
                    msg.from === "bot"
                      ? "bg-primary/10 border border-primary/20 text-foreground/85"
                      : "bg-secondary text-foreground/85"
                  }`}>
                    {msg.msg}
                  </div>
                  {msg.from === "bot" && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-base shrink-0">{msg.lang}</div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* CTA */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center space-y-4"
        >
          <Globe className="w-10 h-10 text-primary mx-auto" />
          <h2 className="text-2xl sm:text-3xl font-display font-bold">Your Board Speaks Every Language</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Deploy your AI executive team today. Use the language selector in the navbar to get started in your language.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <Link href="/hire">
              <Button variant="glow" size="lg" className="gap-2">Deploy Your Board <ArrowRight className="w-4 h-4" /></Button>
            </Link>
            <Link href="/bots">
              <Button variant="outline" size="lg">Browse Directors</Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
