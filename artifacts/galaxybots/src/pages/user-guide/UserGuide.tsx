import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, MessageSquare, MessageSquareOff, Share2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { narration } from "./narration";

import Slide01Title from "./slides/Slide01Title";
import Slide02Login from "./slides/Slide02Login";
import Slide03CommandCenter from "./slides/Slide03CommandCenter";
import Slide04BotTeam from "./slides/Slide04BotTeam";
import Slide05OpenChannel from "./slides/Slide05OpenChannel";
import Slide06Directive from "./slides/Slide06Directive";
import Slide07DeepThinking from "./slides/Slide07DeepThinking";
import Slide08DeployTeam from "./slides/Slide08DeployTeam";
import Slide09OptimaPrime from "./slides/Slide09OptimaPrime";
import Slide10Boardroom from "./slides/Slide10Boardroom";
import Slide11Approvals from "./slides/Slide11Approvals";
import Slide12Closing from "./slides/Slide12Closing";
import Slide13QuickStart from "./slides/Slide13QuickStart";

const slides = [
  Slide01Title,
  Slide02Login,
  Slide03CommandCenter,
  Slide04BotTeam,
  Slide05OpenChannel,
  Slide06Directive,
  Slide07DeepThinking,
  Slide08DeployTeam,
  Slide09OptimaPrime,
  Slide10Boardroom,
  Slide11Approvals,
  Slide12Closing,
  Slide13QuickStart,
];

export default function UserGuide() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNarration, setShowNarration] = useState(false);
  const [copied, setCopied] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, slides.length - 1));
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const handleShare = async () => {
    const url = new URL("/user-guide", window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
      if (e.key === "f") toggleFullscreen();
      if (e.key === "n") setShowNarration((v) => !v);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

  const CurrentSlideComponent = slides[currentSlide];
  const currentNarration = narration[currentSlide] ?? "";

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-[#08091A] text-[#E8EAF0] overflow-hidden">

        <div className={`relative flex items-center justify-center p-4 sm:p-8 transition-all duration-300 ${showNarration ? "flex-[0_0_auto]" : "flex-1"}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-6xl aspect-video bg-[#0C0E26] rounded-xl border border-border/40 shadow-2xl relative overflow-hidden flex flex-col"
            >
              <div className="flex-1 overflow-auto p-8 sm:p-12">
                <CurrentSlideComponent />
              </div>

              <div className="h-1 bg-border/20 w-full">
                <motion.div
                  className="h-full bg-[#8b5cf6]"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showNarration && (
            <motion.div
              key="narration-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden border-t border-[#8b5cf6]/30 bg-[#0a0c1f]"
            >
              <div className="px-6 py-4 max-w-6xl mx-auto w-full">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <span className="text-[10px] font-tech text-[#8b5cf6] uppercase tracking-[0.2em] block mb-1">Speaker Notes</span>
                    <span className="text-[10px] font-tech text-muted-foreground/50 uppercase tracking-widest">Slide {currentSlide + 1} of {slides.length}</span>
                  </div>
                  <div className="w-px self-stretch bg-[#8b5cf6]/20 mx-2 shrink-0" />
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={currentSlide}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="text-sm text-[#c8cce0] leading-relaxed flex-1"
                    >
                      {currentNarration}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="shrink-0 h-20 bg-[#0C0E26] border-t border-border/40 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={prevSlide}
              disabled={currentSlide === 0}
              className="bg-transparent border-border/40 hover:bg-white/5"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="font-tech text-sm text-muted-foreground">
              {currentSlide + 1} / {slides.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={nextSlide}
              disabled={currentSlide === slides.length - 1}
              className="bg-transparent border-border/40 hover:bg-white/5"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="hidden sm:block text-center">
            <p className="text-xs font-tech text-muted-foreground uppercase tracking-widest">
              GalaxyBots New User Guide
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="bg-transparent border-border/40 hover:bg-white/5 gap-2"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="bg-transparent border-border/40 hover:bg-white/5 gap-2"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNarration((v) => !v)}
              className={`bg-transparent border-border/40 hover:bg-white/5 gap-2 transition-colors ${showNarration ? "border-[#8b5cf6]/60 text-[#8b5cf6]" : ""}`}
            >
              {showNarration
                ? <MessageSquareOff className="w-4 h-4" />
                : <MessageSquare className="w-4 h-4" />}
              <span className="hidden sm:inline">{showNarration ? "Hide Notes" : "Speaker Notes"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="bg-transparent border-border/40 hover:bg-white/5 gap-2"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</span>
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
