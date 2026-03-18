import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Import all slides
import Slide01Cover from "./slides/Slide01Cover";
import Slide02ExecSummary from "./slides/Slide02ExecSummary";
import Slide03Problem from "./slides/Slide03Problem";
import Slide04Vision from "./slides/Slide04Vision";
import Slide05Market from "./slides/Slide05Market";
import Slide06Competition from "./slides/Slide06Competition";
import Slide07Infrastructure from "./slides/Slide07Infrastructure";
import Slide08GalaxyBots from "./slides/Slide08GalaxyBots";
import Slide09BingoLingo from "./slides/Slide09BingoLingo";
import Slide10Prospector from "./slides/Slide10Prospector";
import Slide11Mobile from "./slides/Slide11Mobile";
import Slide12BusinessModel from "./slides/Slide12BusinessModel";
import Slide13UnitEconomics from "./slides/Slide13UnitEconomics";
import Slide14FinancialProjections from "./slides/Slide14FinancialProjections";
import Slide15ScenarioModeling from "./slides/Slide15ScenarioModeling";
import Slide16GTMStrategy from "./slides/Slide16GTMStrategy";
import Slide17Year1Priorities from "./slides/Slide17Year1Priorities";
import Slide18Roadmap from "./slides/Slide18Roadmap";
import Slide19Moat from "./slides/Slide19Moat";
import Slide20Risks from "./slides/Slide20Risks";
import Slide21Team from "./slides/Slide21Team";
import Slide22ExitAsk from "./slides/Slide22ExitAsk";

const slides = [
  Slide01Cover,
  Slide02ExecSummary,
  Slide03Problem,
  Slide04Vision,
  Slide05Market,
  Slide06Competition,
  Slide07Infrastructure,
  Slide08GalaxyBots,
  Slide09BingoLingo,
  Slide10Prospector,
  Slide11Mobile,
  Slide12BusinessModel,
  Slide13UnitEconomics,
  Slide14FinancialProjections,
  Slide15ScenarioModeling,
  Slide16GTMStrategy,
  Slide17Year1Priorities,
  Slide18Roadmap,
  Slide19Moat,
  Slide20Risks,
  Slide21Team,
  Slide22ExitAsk,
];

export default function PitchDeck() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
      if (e.key === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

  const CurrentSlideComponent = slides[currentSlide];

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] bg-[#08091A] text-[#E8EAF0] overflow-hidden">
        <div className="flex-1 relative flex items-center justify-center p-4 sm:p-8">
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
                  className="h-full bg-[#D4A853]"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="h-20 bg-[#0C0E26] border-t border-border/40 px-6 flex items-center justify-between">
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
              GalaxyBots Strategic Business Plan 2026-2030 • Strictly Confidential
            </p>
          </div>

          <div className="flex items-center gap-2">
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
