import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Facebook,
  Link2,
  Linkedin,
  Maximize,
  Minimize,
  Repeat,
  Share2,
  Twitter,
  Volume2,
  VolumeX,
} from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';
import { META, mainSiteUrl } from '../../content/explainerContent';

const PROGRESS_TICK_MS = 60;

interface ControlBarProps {
  visible: boolean;
  collapsed: boolean;
  locked: boolean;
  muted: boolean;
  volume: number;
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  fullscreen: boolean;
  onToggleLock: () => void;
  onToggleMuted: () => void;
  onVolumeChange: (v: number) => void;
  onToggleFullscreen: () => void;
  onJumpTo: (index: number) => void;
  onToggleCollapsed: () => void;
}

function ProgressSegments({
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsed(performance.now() - start);
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [tick]);

  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;

  return (
    <div className="flex-1 flex items-center gap-1.5">
      {sceneKeys.map((key, i) => {
        const isActive = i === activeIndex;
        const fill = isActive ? progress * 100 : 0;
        return (
          <button
            key={key}
            onClick={() => onJumpTo(i)}
            className="flex-1 h-3 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-4 hover:bg-white/25 transition-all relative min-h-[12px]"
            aria-label={`Jump to scene ${i + 1}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <div
              className="absolute inset-y-0 left-0 bg-white/90 rounded-full transition-[width] duration-100"
              style={{ width: `${fill}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

function ShareButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const shareUrl = mainSiteUrl(META.explainerPath);
  const shareText = META.title;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const copyLink = useCallback(() => {
    navigator.clipboard?.writeText(shareUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }, [shareUrl]);

  const targets = [
    {
      label: 'Post on X',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      Icon: Twitter,
    },
    {
      label: 'Share on LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
      Icon: Linkedin,
    },
    {
      label: 'Share on Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      Icon: Facebook,
    },
  ];

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-lg"
        title="Share"
        aria-label="Share"
        aria-expanded={open}
      >
        <Share2 className="w-8 h-8" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-3 w-56 rounded-xl bg-black/90 backdrop-blur-md border border-white/10 p-2 shadow-2xl">
          {targets.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors text-base"
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </a>
          ))}
          <button
            onClick={copyLink}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors text-base"
          >
            {copied ? <Check className="w-5 h-5 shrink-0" /> : <Link2 className="w-5 h-5 shrink-0" />}
            {copied ? 'Link copied!' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}

function ControlBar({
  visible,
  collapsed,
  locked,
  muted,
  volume,
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  fullscreen,
  onToggleLock,
  onToggleMuted,
  onVolumeChange,
  onToggleFullscreen,
  onJumpTo,
  onToggleCollapsed,
}: ControlBarProps) {
  return (
    <div
      className={`flex items-center gap-3 bg-black/50 backdrop-blur-sm px-5 py-4 transition-all duration-200 ease-out ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      <button
        onClick={onToggleLock}
        className={`w-14 h-14 flex items-center justify-center transition-colors rounded-lg shrink-0 ${
          locked
            ? 'text-white bg-white/15 hover:bg-white/25'
            : 'text-white/60 hover:text-white hover:bg-white/10'
        }`}
        title={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
        aria-label={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
        aria-pressed={locked}
      >
        <Repeat className="w-8 h-8" />
      </button>

      <button
        onClick={onToggleMuted}
        className={`w-14 h-14 flex items-center justify-center transition-colors rounded-lg shrink-0 ${
          muted
            ? 'text-white/60 hover:text-white hover:bg-white/10'
            : 'text-white bg-white/15 hover:bg-white/25'
        }`}
        title={muted ? 'Unmute audio' : 'Mute audio'}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        aria-pressed={!muted}
      >
        {muted ? <VolumeX className="w-8 h-8" /> : <Volume2 className="w-8 h-8" />}
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        aria-label="Volume"
        title="Volume"
        className="w-24 h-1.5 accent-white cursor-pointer shrink-0"
      />

      <div className="w-px self-stretch bg-white/15" aria-hidden="true" />

      <ProgressSegments
        sceneKeys={sceneKeys}
        activeIndex={activeIndex}
        activeDuration={activeDuration}
        tick={tick}
        onJumpTo={onJumpTo}
      />

      <div className="text-xl text-white/60 font-mono tabular-nums shrink-0">
        {activeIndex + 1}/{sceneKeys.length}
      </div>

      <ShareButton />

      <button
        onClick={onToggleFullscreen}
        className="w-14 h-14 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-lg shrink-0"
        title={fullscreen ? 'Exit full screen' : 'Full screen'}
        aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
        aria-pressed={fullscreen}
      >
        {fullscreen ? <Minimize className="w-8 h-8" /> : <Maximize className="w-8 h-8" />}
      </button>

      <button
        onClick={onToggleCollapsed}
        className="w-14 h-14 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-lg shrink-0"
        title={collapsed ? 'Show controls' : 'Hide controls'}
        aria-label={collapsed ? 'Show controls' : 'Hide controls'}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronUp className="w-10 h-10" /> : <ChevronDown className="w-10 h-10" />}
      </button>
    </div>
  );
}

export default function VideoWithControls() {
  // The headless export/recording harness injects `window.startRecording`
  // before any app code runs, so its presence — not iframe detection — is the
  // reliable signal that we should render the clean, non-interactive recording.
  // Every real visitor (desktop AND mobile, whether the video is embedded in an
  // iframe or opened directly top-level from a shared link) gets the full
  // interactive interface. `?export` forces the clean path for manual checks.
  const isExportPath =
    typeof window !== 'undefined' &&
    (typeof window.startRecording === 'function' ||
      new URLSearchParams(window.location.search).has('export'));

  const {
    sceneKeys,
    activeIndex,
    locked,
    mountKey,
    tick,
    durations,
    activeDuration,
    onSceneChange,
    jumpTo,
    toggleLock,
  } = useSceneControls(SCENE_DURATIONS);

  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(0.45);
  const sensorRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // True when a pointer is within the bottom 25% of the player — the zone that
  // reveals the control bar. Used by container-level handlers so the bottom
  // overlay never blocks clicks on in-video content (e.g. the CTA buttons).
  const isNearBottom = useCallback((clientY: number) => {
    const el = containerRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return clientY >= rect.bottom - rect.height * 0.25;
  }, []);
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') setHovering(isNearBottom(e.clientY));
    },
    [isNearBottom],
  );
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovering(false);
  }, []);
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') return;
      if (collapsed && isNearBottom(e.clientY)) setTapPinned(true);
    },
    [collapsed, isNearBottom],
  );
  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      if (!c) {
        setHovering(false);
        setTapPinned(false);
      }
      return !c;
    });
  }, []);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    setMuted(v <= 0);
  }, []);

  const handleToggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (!next && volume <= 0) setVolume(0.45);
      return next;
    });
  }, [volume]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const node = el as HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch?.(() => {});
    } else {
      void (node.requestFullscreen?.() ?? node.webkitRequestFullscreen?.())?.catch?.(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const sensor = sensorRef.current;
      if (sensor && !sensor.contains(e.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [collapsed, tapPinned]);

  // Export path: no props, preserves recording markers and unmuted audio.
  if (isExportPath) return <VideoTemplate />;

  const barVisible = !collapsed || hovering || tapPinned;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-[#0B0F19]"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
    >
      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        muted={muted}
        volume={volume}
        interactive
        onSceneChange={onSceneChange}
      />

      <div
        ref={sensorRef}
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end"
        style={{ height: '25%' }}
      >
        <div className={barVisible ? 'pointer-events-auto' : 'pointer-events-none'}>
          <ControlBar
          visible={barVisible}
          collapsed={collapsed}
          locked={locked}
          muted={muted}
          volume={volume}
          sceneKeys={sceneKeys}
          activeIndex={activeIndex}
          activeDuration={activeDuration}
          tick={tick}
          fullscreen={isFullscreen}
          onToggleLock={toggleLock}
          onToggleMuted={handleToggleMuted}
          onVolumeChange={handleVolumeChange}
          onToggleFullscreen={toggleFullscreen}
          onJumpTo={jumpTo}
          onToggleCollapsed={handleToggleCollapsed}
          />
        </div>
      </div>
    </div>
  );
}
