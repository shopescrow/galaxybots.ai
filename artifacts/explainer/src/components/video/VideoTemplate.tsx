import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { InteractiveContext } from './interactiveContext';

export const SCENE_DURATIONS = {
  pitch: 6000,
  product: 8000,
  onboard1: 6500,
  onboard2: 8000,
  value: 8000,
  secret: 6000,
  cta: 7000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  pitch: Scene1,
  product: Scene2,
  onboard1: Scene3,
  onboard2: Scene4,
  value: Scene5,
  secret: Scene6,
  cta: Scene7,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

// Fixed 16:9 design stage. The whole composition is authored at this size and
// uniformly scaled to fit any container/device, so it looks identical (just
// smaller) everywhere instead of reflowing.
const STAGE_W = 1280;
const STAGE_H = 720;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  volume = 0.45,
  interactive = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  volume?: number;
  interactive?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
    // Note: muting is applied declaratively via the <audio muted> attribute, so
    // mute/volume toggles must NOT be a dependency here — otherwise toggling them
    // would re-seek audio back to the current scene's start.
  }, [currentSceneKey, baseSceneKey]);

  // Apply volume live without re-seeking/restarting playback on every change.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);

  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0B0F19] relative">
      <div
        className="absolute top-1/2 left-1/2 origin-center overflow-hidden bg-[#0B0F19]"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {/* Persistent Background Layer */}
        <div className="absolute inset-0">
          <video
            src={`${import.meta.env.BASE_URL}videos/space-bg.mp4`}
            autoPlay loop muted playsInline
            className="w-full h-full object-cover opacity-30 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F19]/40 via-transparent to-[#0B0F19]" />
        </div>

        <motion.div
          className="absolute w-[1024px] h-[1024px] rounded-full blur-[120px] opacity-20"
          animate={{
            background: [
              'radial-gradient(circle, var(--color-primary), transparent)',
              'radial-gradient(circle, var(--color-secondary), transparent)',
              'radial-gradient(circle, var(--color-accent), transparent)',
              'radial-gradient(circle, var(--color-primary), transparent)'
            ][sceneIndex % 4],
            x: ['-20%', '50%', '80%', '10%', '30%', '60%', '40%'][sceneIndex],
            y: ['-20%', '10%', '-30%', '40%', '10%', '-15%', '20%'][sceneIndex],
            scale: [1, 1.2, 0.8, 1.5, 1, 1.3, 1.1][sceneIndex]
          }}
          transition={{ duration: 2.5, ease: 'easeInOut' }}
        />

        <InteractiveContext.Provider value={interactive}>
          <AnimatePresence mode="popLayout">
            {SceneComponent && <SceneComponent key={currentSceneKey} />}
          </AnimatePresence>
        </InteractiveContext.Provider>
      </div>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
