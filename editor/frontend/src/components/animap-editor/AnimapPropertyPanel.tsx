import { useRef, useCallback, useState, useEffect, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Brush, Eraser, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { AnimapConfig, AnimapLayer, AnimapLayerStateOverride, AnimapState, AnimapTransition } from '@/types';
import {
  clearStateLayerOverride,
  DEFAULT_STATE_ID,
  getAnimapTransition,
  getStateOverrideValue,
  normalizeAnimapConfig,
  updateAnimapTransition,
  updateStateLayerOverride,
} from '@/lib/animap-state';
import { toKebabCase } from '@/lib/utils';

function PropertyRow({
  label,
  value,
  onChange,
  onReset,
  resetValue,
  step = 1,
  min,
  max,
  displayValue,
  highlighted = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
  resetValue: number;
  step?: number;
  min?: number;
  max?: number;
  displayValue?: string;
  highlighted?: boolean;
}) {
  const startX = useRef(0);
  const startVal = useRef(0);
  const [inputValue, setInputValue] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const clamp = (v: number) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      startVal.current = value;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const handleMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX.current;
        const sensitivity = ev.shiftKey ? 0.1 : 1;
        onChange(clamp(startVal.current + dx * step * sensitivity));
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [value, onChange, step, min, max]
  );

  // Show raw value when not focused, user's text when focused
  const displayedInput = isFocused && inputValue !== null ? inputValue : String(value);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label
          className={`text-xs select-none flex-shrink-0 ${highlighted ? 'text-primary' : ''}`}
          style={{ cursor: 'ew-resize' }}
          onPointerDown={handlePointerDown}
        >
          {label}{displayValue !== undefined ? ` (${displayValue})` : ''}
        </Label>
        <input
          type="text"
          inputMode="decimal"
          className="h-6 text-xs px-1 w-16 ml-auto text-right rounded border border-input bg-background"
          value={displayedInput}
          onFocus={(e) => {
            setIsFocused(true);
            setInputValue(String(value));
            e.target.select();
          }}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => {
            setIsFocused(false);
            if (inputValue !== null) {
              const parsed = parseFloat(inputValue);
              if (!isNaN(parsed)) onChange(clamp(parsed));
              setInputValue(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Escape') {
              setInputValue(null);
              setIsFocused(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 flex-shrink-0"
          onClick={onReset}
          title={`Reset ${label}`}
          disabled={value === resetValue}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

function VideoTimeline({
  slug,
  layerId: _layerId,
  file,
  fileVersion,
  loopStart,
  loopEnd,
  onChange,
  activeVideoRef,
}: {
  slug: string;
  layerId: string;
  file: string;
  fileVersion: number;
  loopStart: number;
  loopEnd: number;
  onChange: (start: number, end: number) => void;
  activeVideoRef: MutableRefObject<HTMLVideoElement | null>;
}) {
  const [duration, setDuration] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ time: number; x: number; trackTop: number } | null>(null);
  const seekingRef = useRef(false);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const isSeeking = useRef(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const analyzeAbortRef = useRef(false);

  useEffect(() => {
    return () => { analyzeAbortRef.current = true; };
  }, []);

  // Load video for duration + thumbnail seeking
  useEffect(() => {
    if (!file) return;
    const video = document.createElement('video');
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = `/api/animap-preview/${slug}/${file}?v=${fileVersion}`;
    video.onloadedmetadata = () => {
      setDuration(video.duration);
    };
    videoRef.current = video;
    return () => { videoRef.current = null; };
  }, [file, slug, fileVersion]);

  // Draw thumbnail when hover time changes
  useEffect(() => {
    if (!hoverInfo || !videoRef.current || seekingRef.current) return;
    const video = videoRef.current;
    if (!video.duration) return;

    seekingRef.current = true;
    video.currentTime = Math.min(hoverInfo.time, video.duration);

    const drawFrame = () => {
      const canvas = thumbCanvasRef.current;
      if (!canvas || !video.videoWidth) { seekingRef.current = false; return; }
      const aspect = video.videoWidth / video.videoHeight;
      const w = 120;
      const h = Math.round(w / aspect);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(video, 0, 0, w, h);
      seekingRef.current = false;
    };

    video.onseeked = drawFrame;
  }, [hoverInfo?.time]);

  // Animate scrubber head via RAF — synced to actual video currentTime
  useEffect(() => {
    if (!duration) return;
    const max = duration || 10;

    const tick = () => {
      const video = activeVideoRef.current;
      if (scrubberRef.current && video) {
        scrubberRef.current.style.left = `${(video.currentTime / max) * 100}%`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration]);

  const effectiveEnd = loopEnd > 0 ? loopEnd : duration;
  const maxVal = duration || 10;

  const pxToTime = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return parseFloat((ratio * maxVal).toFixed(1));
  };

  const pxToOffset = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return clientX - rect.left;
  };

  const startPct = maxVal > 0 ? (loopStart / maxVal) * 100 : 0;
  const endPct = maxVal > 0 ? (effectiveEnd / maxVal) * 100 : 100;

  const handlePointerDown = (handle: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = handle;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleTrackPointerDown = (e: React.PointerEvent) => {
    // Don't interfere with loop handle dragging (handles fire first via bubbling)
    if (dragging.current) return;
    const video = activeVideoRef.current;
    if (!video || !duration) return;

    isSeeking.current = true;
    video.pause();
    const t = pxToTime(e.clientX);
    video.currentTime = Math.max(0, Math.min(t, video.duration));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Thumbnail on hover — use screen coords for fixed positioning
    const t = pxToTime(e.clientX);
    if (duration > 0) {
      setHoverInfo({ time: t, x: e.clientX, trackTop: trackRef.current?.getBoundingClientRect().top ?? 0 });
    }

    if (isSeeking.current) {
      const video = activeVideoRef.current;
      if (video) video.currentTime = Math.max(0, Math.min(t, video.duration));
      return;
    }

    if (!dragging.current) return;
    if (dragging.current === 'start') {
      onChange(Math.min(t, effectiveEnd - 0.1), loopEnd);
    } else {
      const newEnd = Math.max(t, loopStart + 0.1);
      onChange(loopStart, newEnd >= maxVal - 0.05 ? 0 : newEnd);
    }
  };

  const handlePointerUp = () => {
    if (isSeeking.current) {
      isSeeking.current = false;
      const video = activeVideoRef.current;
      if (video) video.play().catch(() => {});
    }
    dragging.current = null;
  };

  const handlePointerLeaveTrack = () => {
    if (isSeeking.current) {
      isSeeking.current = false;
      const video = activeVideoRef.current;
      if (video) video.play().catch(() => {});
    }
    dragging.current = null;
    setHoverInfo(null);
  };

  const findPerfectLoop = async () => {
    if (!file || analyzing) return;

    setAnalyzing(true);
    setAnalyzeProgress(0);
    analyzeAbortRef.current = false;

    try {
      // Use a dedicated video element so we don't interfere with thumbnail preview
      const video = document.createElement('video');
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      video.src = `/api/animap-preview/${slug}/${file}?v=${fileVersion}`;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
      });

      const dur = video.duration;
      if (dur < 0.5) { setAnalyzing(false); return; }

      const sampleInterval = 0.1; // 10 fps sampling
      const totalFrames = Math.min(300, Math.floor(dur / sampleInterval));
      const analyzeWidth = 64;
      const aspect = video.videoWidth / video.videoHeight;
      const analyzeHeight = Math.round(analyzeWidth / aspect);
      const pixelCount = analyzeWidth * analyzeHeight;

      const canvas = document.createElement('canvas');
      canvas.width = analyzeWidth;
      canvas.height = analyzeHeight;
      const ctx = canvas.getContext('2d')!;

      // Phase 1: Extract grayscale frames
      const frames: Uint8Array[] = [];
      const frameTimes: number[] = [];

      for (let i = 0; i < totalFrames; i++) {
        if (analyzeAbortRef.current) { setAnalyzing(false); return; }

        const time = (i / totalFrames) * dur;
        frameTimes.push(time);

        video.currentTime = time;
        await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });

        ctx.drawImage(video, 0, 0, analyzeWidth, analyzeHeight);
        const imageData = ctx.getImageData(0, 0, analyzeWidth, analyzeHeight);
        const gray = new Uint8Array(pixelCount);
        for (let j = 0; j < pixelCount; j++) {
          const idx = j * 4;
          gray[j] = Math.round(
            0.299 * imageData.data[idx] +
            0.587 * imageData.data[idx + 1] +
            0.114 * imageData.data[idx + 2]
          );
        }
        frames.push(gray);

        setAnalyzeProgress(Math.round(((i + 1) / totalFrames) * 60));
      }

      // Phase 2: Find frame pair with minimum Mean Absolute Difference
      const minGapFrames = Math.max(5, Math.ceil(0.5 / sampleInterval));
      let bestMAD = Infinity;
      let bestI = 0;
      let bestJ = 0;

      for (let i = 0; i < frames.length; i++) {
        if (analyzeAbortRef.current) { setAnalyzing(false); return; }

        for (let j = i + minGapFrames; j < frames.length; j++) {
          let sum = 0;
          const a = frames[i];
          const b = frames[j];
          for (let k = 0; k < pixelCount; k++) {
            sum += Math.abs(a[k] - b[k]);
          }
          const mad = sum / pixelCount;
          if (mad < bestMAD) {
            bestMAD = mad;
            bestI = i;
            bestJ = j;
          }
        }

        // Yield to UI thread periodically
        if (i % 10 === 0) {
          setAnalyzeProgress(60 + Math.round(((i + 1) / frames.length) * 40));
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const start = parseFloat(frameTimes[bestI].toFixed(1));
      const end = parseFloat(frameTimes[bestJ].toFixed(1));
      onChange(start, end);
    } catch (err) {
      console.error('Perfect loop analysis failed:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  if (!file) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Upload a video to set loop range</Label>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Loop Range</Label>
        <Button
          size="sm"
          variant="outline"
          className="h-5 text-[10px] px-2"
          disabled={analyzing || !duration}
          onClick={findPerfectLoop}
        >
          {analyzing ? `Analyzing… ${analyzeProgress}%` : 'Perfect Loop'}
        </Button>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-8 rounded bg-muted cursor-pointer select-none"
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeaveTrack}
      >
        {/* Hover scrub line (relative to track) */}
        {hoverInfo && (
          <div
            className="absolute top-0 bottom-0 w-px bg-foreground/30 pointer-events-none z-10"
            style={{ left: pxToOffset(hoverInfo.x) }}
          />
        )}
        {/* Playback scrubber head */}
        {duration > 0 && (
          <div
            ref={scrubberRef}
            className="absolute top-0 bottom-0 w-0.5 bg-blue-500 pointer-events-none z-20"
            style={{ left: '0%' }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-blue-300" />
          </div>
        )}
        {/* Active range */}
        <div
          className="absolute top-0 bottom-0 bg-primary/30 border-y-2 border-primary/50"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
        />

        {/* Start handle */}
        <div
          className="absolute top-0 bottom-0 w-2 bg-primary rounded-l cursor-ew-resize hover:bg-primary/80 z-10"
          style={{ left: `calc(${startPct}% - 4px)` }}
          onPointerDown={handlePointerDown('start')}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
            <div className="w-0.5 h-3 bg-primary-foreground rounded" />
          </div>
        </div>

        {/* End handle */}
        <div
          className="absolute top-0 bottom-0 w-2 bg-primary rounded-r cursor-ew-resize hover:bg-primary/80 z-10"
          style={{ left: `calc(${endPct}% - 4px)` }}
          onPointerDown={handlePointerDown('end')}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
            <div className="w-0.5 h-3 bg-primary-foreground rounded" />
          </div>
        </div>

        {/* Time ticks */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 pointer-events-none">
          <span className="text-[9px] text-muted-foreground">0:00.0</span>
          <span className="text-[9px] text-muted-foreground">{formatTime(maxVal)}</span>
        </div>
      </div>

      {/* Numeric values */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Start</Label>
          <input
            type="text"
            inputMode="decimal"
            className="h-6 w-full text-xs px-1 text-center rounded border border-input bg-background"
            value={loopStart}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(Math.max(0, Math.min(v, effectiveEnd - 0.1)), loopEnd);
            }}
          />
        </div>
        <div className="flex-1 space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">End</Label>
          <input
            type="text"
            inputMode="decimal"
            className="h-6 w-full text-xs px-1 text-center rounded border border-input bg-background"
            value={loopEnd === 0 ? formatTime(duration) : loopEnd}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(loopStart, v <= 0 ? 0 : Math.max(loopStart + 0.1, v));
            }}
          />
        </div>
        <div className="flex-1 space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Duration</Label>
          <div className="h-6 flex items-center justify-center text-xs text-muted-foreground">
            {formatTime(effectiveEnd - loopStart)}
          </div>
        </div>
      </div>

      {/* Hover thumbnail — rendered via portal so it's above all panels */}
      {hoverInfo && duration > 0 && createPortal(
        <div
          className="pointer-events-none"
          style={{
            position: 'fixed',
            left: hoverInfo.x,
            top: hoverInfo.trackTop - 8,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
          }}
        >
          <div className="rounded border bg-popover shadow-lg overflow-hidden">
            <canvas
              ref={thumbCanvasRef}
              className="block"
              style={{ width: 120, height: 'auto' }}
            />
            <div className="text-[10px] text-center py-0.5 text-muted-foreground bg-popover">
              {formatTime(hoverInfo.time)}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface AnimapPropertyPanelProps {
  slug: string;
  config: AnimapConfig;
  selectedState: AnimapState;
  selectedStateId: string;
  selectedLayer: AnimapLayer | null;
  selectedLayerBase: AnimapLayer | null;
  commitConfig: (updater: (prev: AnimapConfig) => AnimapConfig) => void;
  onUpload: (layerId: string, file: File) => void;
  fileVersion: number;
  brushSize: number;
  setBrushSize: (size: number) => void;
  brushOpacity: number;
  setBrushOpacity: (opacity: number) => void;
  brushHardness: number;
  setBrushHardness: (hardness: number) => void;
  brushMode: 'paint' | 'erase';
  setBrushMode: (mode: 'paint' | 'erase') => void;
  convertProgress: number | null;
  activeVideoRef: MutableRefObject<HTMLVideoElement | null>;
}

export function AnimapPropertyPanel({
  slug,
  config,
  selectedState,
  selectedStateId,
  selectedLayer,
  selectedLayerBase,
  commitConfig,
  onUpload,
  fileVersion,
  brushSize,
  setBrushSize,
  brushOpacity,
  setBrushOpacity,
  brushHardness,
  setBrushHardness,
  brushMode,
  setBrushMode,
  convertProgress,
  activeVideoRef,
}: AnimapPropertyPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const states = normalizeAnimapConfig(config).states ?? [];

  const updateLayerStateKey = <K extends keyof AnimapLayerStateOverride>(id: string, key: K, value: AnimapLayerStateOverride[K]) => {
    commitConfig((prev) => updateStateLayerOverride(prev, selectedStateId, id, key, value));
  };

  const resetLayerStateKey = (id: string, key: keyof AnimapLayerStateOverride, fallbackValue: AnimapLayer[keyof AnimapLayer]) => {
    if (selectedStateId === DEFAULT_STATE_ID) {
      commitConfig((prev) => ({
        ...prev,
        layers: prev.layers.map((layer) => (layer.id === id ? { ...layer, [key]: fallbackValue } : layer)),
      }));
      return;
    }

    commitConfig((prev) => clearStateLayerOverride(prev, selectedStateId, id, key));
  };

  const updateTransition = (direction: 'to' | 'from', otherStateId: string, transition: AnimapTransition | null) => {
    commitConfig((prev) => updateAnimapTransition(prev, selectedStateId, direction, otherStateId, transition));
  };

  if (!selectedLayer) {
    return (
      <Card className="rounded-none border-0 h-full">
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">Select a layer</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const fileUrl = selectedLayer.file
    ? `/data/animap/${slug}/${selectedLayer.file}?v=${fileVersion}`
    : '';

  return (
    <Card className="rounded-none border-0 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{selectedLayer.name}</CardTitle>
        <p className="text-xs text-muted-foreground capitalize">{selectedLayer.type} layer</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Name */}
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={selectedLayer.name}
            onChange={(e) => {
              const kebab = toKebabCase(e.target.value);
              commitConfig((prev) => ({
                ...prev,
                layers: prev.layers.map((layer) => (layer.id === selectedLayer.id ? { ...layer, name: kebab } : layer)),
              }));
            }}
          />
        </div>

        {/* File upload */}
        <div className="space-y-1">
          <Label className="text-xs">File</Label>
          {convertProgress !== null ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Converting to OGV...</span>
                <span>{convertProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${convertProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-3 w-3" />
                  Upload
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={
                    selectedLayer.type === 'video'
                      ? 'video/*,.ogv'
                      : 'image/*'
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(selectedLayer.id, file);
                    e.target.value = '';
                  }}
                />
              </div>
            </>
          )}
          {selectedLayer.file && (
            <p className="text-xs text-muted-foreground truncate">{selectedLayer.file}</p>
          )}
          {/* Preview for images */}
          {selectedLayer.file && selectedLayer.type === 'image' && (
            <img
              src={fileUrl}
              alt={selectedLayer.name}
              className="mt-2 w-full rounded border object-contain"
              style={{ maxHeight: 120 }}
            />
          )}
        </div>

        {/* Position/opacity for image and video */}
        {(selectedLayer.type === 'image' || selectedLayer.type === 'video') && (
          <>
            <PropertyRow
              label="X"
              value={selectedLayer.x ?? 0}
              onChange={(v) => updateLayerStateKey(selectedLayer.id, 'x', v)}
              onReset={() => resetLayerStateKey(selectedLayer.id, 'x', selectedLayerBase?.x ?? 0)}
              resetValue={selectedStateId === DEFAULT_STATE_ID ? 0 : (selectedLayerBase?.x ?? 0)}
              step={1}
              min={-config.width}
              max={config.width}
              highlighted={getStateOverrideValue(config, selectedStateId, selectedLayer.id, 'x') !== undefined}
            />
            <PropertyRow
              label="Y"
              value={selectedLayer.y ?? 0}
              onChange={(v) => updateLayerStateKey(selectedLayer.id, 'y', v)}
              onReset={() => resetLayerStateKey(selectedLayer.id, 'y', selectedLayerBase?.y ?? 0)}
              resetValue={selectedStateId === DEFAULT_STATE_ID ? 0 : (selectedLayerBase?.y ?? 0)}
              step={1}
              min={-config.height}
              max={config.height}
              highlighted={getStateOverrideValue(config, selectedStateId, selectedLayer.id, 'y') !== undefined}
            />
            <PropertyRow
              label="Scale"
              value={selectedLayer.scale ?? 1}
              onChange={(v) => updateLayerStateKey(selectedLayer.id, 'scale', v)}
              onReset={() => resetLayerStateKey(selectedLayer.id, 'scale', selectedLayerBase?.scale ?? 1)}
              resetValue={selectedStateId === DEFAULT_STATE_ID ? 1 : (selectedLayerBase?.scale ?? 1)}
              step={0.01}
              min={0.01}
              max={5}
              displayValue={((selectedLayer.scale ?? 1) * 100).toFixed(0) + '%'}
              highlighted={getStateOverrideValue(config, selectedStateId, selectedLayer.id, 'scale') !== undefined}
            />
            <PropertyRow
              label="Opacity"
              value={selectedLayer.opacity ?? 1}
              onChange={(v) => updateLayerStateKey(selectedLayer.id, 'opacity', v)}
              onReset={() => resetLayerStateKey(selectedLayer.id, 'opacity', selectedLayerBase?.opacity ?? 1)}
              resetValue={selectedStateId === DEFAULT_STATE_ID ? 1 : (selectedLayerBase?.opacity ?? 1)}
              step={0.01}
              min={0}
              max={1}
              displayValue={((selectedLayer.opacity ?? 1) * 100).toFixed(0) + '%'}
              highlighted={getStateOverrideValue(config, selectedStateId, selectedLayer.id, 'opacity') !== undefined}
            />
          </>
        )}

        {/* Video-specific controls */}
        {selectedLayer.type === 'video' && (
          <>
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Loop Playback</Label>
                  <p className="text-[10px] text-muted-foreground">
                    When off, the video plays once and stops at the selected end time.
                  </p>
                </div>
                <Switch
                  checked={selectedLayer.loop ?? true}
                  onCheckedChange={(checked) => updateLayerStateKey(selectedLayer.id, 'loop', checked)}
                />
              </div>
            </div>

            <VideoTimeline
              slug={slug}
              layerId={selectedLayer.id}
              file={selectedLayer.file}
              fileVersion={fileVersion}
              loopStart={selectedLayer.loop_start ?? 0}
              loopEnd={selectedLayer.loop_end ?? 0}
              onChange={(start, end) => {
                updateLayerStateKey(selectedLayer.id, 'loop_start', start);
                updateLayerStateKey(selectedLayer.id, 'loop_end', end);
              }}
              activeVideoRef={activeVideoRef}
            />
          </>
        )}

        {/* Mask-specific controls */}
        {selectedLayer.type === 'mask' && (
          <>
            <div className="space-y-2">
              <Label className="text-xs">Target Layers</Label>
              {config.layers
                .filter((l) => l.type !== 'mask')
                .map((l) => (
                  <div key={l.id} className="flex items-center gap-2">
                    <Switch
                      checked={(selectedLayer.targets ?? []).includes(l.id)}
                      onCheckedChange={(checked) => {
                        const targets = selectedLayer.targets ?? [];
                        updateLayerStateKey(
                          selectedLayer.id,
                          'targets',
                          checked ? [...targets, l.id] : targets.filter((t) => t !== l.id),
                        );
                      }}
                      className="scale-75"
                    />
                    <span className="text-xs">{l.name}</span>
                  </div>
                ))}
            </div>

            {/* Brush controls for mask drawing */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-medium">Mask Brush</Label>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={brushMode === 'paint' ? 'default' : 'outline'}
                  className="flex-1 text-xs"
                  onClick={() => setBrushMode('paint')}
                >
                  <Brush className="mr-1 h-3 w-3" />
                  Paint
                </Button>
                <Button
                  size="sm"
                  variant={brushMode === 'erase' ? 'default' : 'outline'}
                  className="flex-1 text-xs"
                  onClick={() => setBrushMode('erase')}
                >
                  <Eraser className="mr-1 h-3 w-3" />
                  Erase
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Size: {brushSize}px</Label>
                <Slider
                  value={[brushSize]}
                  onValueChange={([v]) => setBrushSize(v)}
                  min={1}
                  max={200}
                  step={1}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Opacity: {(brushOpacity * 100).toFixed(0)}%</Label>
                <Slider
                  value={[brushOpacity]}
                  onValueChange={([v]) => setBrushOpacity(v)}
                  min={0.01}
                  max={1}
                  step={0.01}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hardness: {(brushHardness * 100).toFixed(0)}%</Label>
                <Slider
                  value={[brushHardness]}
                  onValueChange={([v]) => setBrushHardness(v)}
                  min={0}
                  max={1}
                  step={0.01}
                />
              </div>
            </div>
          </>
        )}
        {/* Advanced section for image/video */}
        {(selectedLayer.type === 'image' || selectedLayer.type === 'video') && (
          <AdvancedFilters
            layer={selectedLayer}
            updateLayerStateKey={updateLayerStateKey}
            resetLayerStateKey={resetLayerStateKey}
          />
        )}

        {states.length > 1 && (
          <TransitionsEditor
            states={states}
            selectedState={selectedState}
            selectedStateId={selectedStateId}
            updateTransition={updateTransition}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AdvancedFilters({
  layer,
  updateLayerStateKey,
  resetLayerStateKey,
}: {
  layer: AnimapLayer;
  updateLayerStateKey: <K extends keyof AnimapLayerStateOverride>(id: string, key: K, value: AnimapLayerStateOverride[K]) => void;
  resetLayerStateKey: (id: string, key: keyof AnimapLayerStateOverride, fallbackValue: AnimapLayer[keyof AnimapLayer]) => void;
}) {
  const [open, setOpen] = useState(false);

  const filters = [
    { key: 'hue' as const, label: 'Hue', min: -180, max: 180, step: 1, default_: 0, unit: '°' },
    { key: 'saturation' as const, label: 'Saturation', min: 0, max: 300, step: 1, default_: 100, unit: '%' },
    { key: 'lightness' as const, label: 'Lightness', min: 0, max: 200, step: 1, default_: 100, unit: '%' },
    { key: 'brightness' as const, label: 'Brightness', min: 0, max: 300, step: 1, default_: 100, unit: '%' },
    { key: 'contrast' as const, label: 'Contrast', min: 0, max: 300, step: 1, default_: 100, unit: '%' },
  ];

  const hasNonDefault = filters.some((f) => {
    const val = layer[f.key];
    return val !== undefined && val !== f.default_;
  });

  return (
    <div className="border-t pt-3">
      <button
        className="flex items-center justify-between w-full text-xs font-medium"
        onClick={() => setOpen(!open)}
      >
        <span>Advanced{hasNonDefault ? ' *' : ''}</span>
        <span className="text-muted-foreground">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {filters.map((f) => {
            const val = layer[f.key] ?? f.default_;
            return (
              <div key={f.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{f.label}: {val}{f.unit}</Label>
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={val === f.default_}
                    onClick={() => resetLayerStateKey(layer.id, f.key, f.default_)}
                    title={`Reset ${f.label}`}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>
                <Slider
                  value={[val]}
                  onValueChange={([v]) => updateLayerStateKey(layer.id, f.key, v)}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                />
              </div>
            );
          })}
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              for (const f of filters) {
                resetLayerStateKey(layer.id, f.key, f.default_);
              }
            }}
          >
            Reset all filters
          </button>
        </div>
      )}
    </div>
  );
}

function TransitionsEditor({
  states,
  selectedState,
  selectedStateId,
  updateTransition,
}: {
  states: AnimapState[];
  selectedState: AnimapState;
  selectedStateId: string;
  updateTransition: (direction: 'to' | 'from', otherStateId: string, transition: AnimapTransition | null) => void;
}) {
  const otherStates = states.filter((state) => state.id !== selectedStateId);

  return (
    <div className="border-t pt-3 space-y-3">
      <div>
        <Label className="text-xs font-medium">Transitions</Label>
        <p className="text-[10px] text-muted-foreground">
          Missing entries use the default instant transition.
        </p>
      </div>
      {otherStates.map((state) => {
        const transitionTo = getAnimapTransition(selectedState, 'to', state.id);
        const transitionFrom = getAnimapTransition(selectedState, 'from', state.id);

        return (
          <div key={state.id} className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-medium">{state.name}</div>
            <TransitionRow
              label={`To ${state.name}`}
              transition={transitionTo}
              onChange={(transition) => updateTransition('to', state.id, transition)}
            />
            <TransitionRow
              label={`From ${state.name}`}
              transition={transitionFrom}
              onChange={(transition) => updateTransition('from', state.id, transition)}
            />
          </div>
        );
      })}
    </div>
  );
}

function TransitionRow({
  label,
  transition,
  onChange,
}: {
  label: string;
  transition: AnimapTransition;
  onChange: (transition: AnimapTransition | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <select
          className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs"
          value={transition.mode}
          onChange={(e) => {
            const mode = e.target.value as AnimapTransition['mode'];
            onChange(mode === 'instant' ? null : { mode, duration_ms: transition.duration_ms && transition.duration_ms > 0 ? transition.duration_ms : 300 });
          }}
        >
          <option value="instant">Instant</option>
          <option value="timed">Timed</option>
        </select>
        <Input
          type="number"
          min={0}
          step={50}
          className="h-8 w-24 text-xs"
          disabled={transition.mode === 'instant'}
          value={transition.mode === 'instant' ? 0 : (transition.duration_ms ?? 300)}
          onChange={(e) => {
            const duration = Math.max(0, parseInt(e.target.value || '0', 10));
            onChange(duration <= 0 ? null : { mode: 'timed', duration_ms: duration });
          }}
        />
      </div>
    </div>
  );
}
