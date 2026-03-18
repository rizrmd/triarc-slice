import { useRef, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Brush, Eraser, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { AnimapConfig, AnimapLayer } from '@/types';

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
          className="text-xs select-none flex-shrink-0"
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
}: {
  slug: string;
  layerId: string;
  file: string;
  fileVersion: number;
  loopStart: number;
  loopEnd: number;
  onChange: (start: number, end: number) => void;
}) {
  const [duration, setDuration] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ time: number; x: number; trackTop: number } | null>(null);
  const seekingRef = useRef(false);

  // Load video for duration + thumbnail seeking
  useEffect(() => {
    if (!file) return;
    const video = document.createElement('video');
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = `/data/animap/${slug}/${file}?v=${fileVersion}`;
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

  const handlePointerMove = (e: React.PointerEvent) => {
    // Thumbnail on hover — use screen coords for fixed positioning
    const t = pxToTime(e.clientX);
    if (duration > 0) {
      setHoverInfo({ time: t, x: e.clientX, trackTop: trackRef.current?.getBoundingClientRect().top ?? 0 });
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
    dragging.current = null;
  };

  const handlePointerLeaveTrack = () => {
    dragging.current = null;
    setHoverInfo(null);
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
      <Label className="text-xs font-medium">Loop Range</Label>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-8 rounded bg-muted cursor-pointer select-none"
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
  selectedLayer: AnimapLayer | null;
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
}

export function AnimapPropertyPanel({
  slug,
  config,
  selectedLayer,
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
}: AnimapPropertyPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateLayer = (id: string, updates: Partial<AnimapLayer>) => {
    commitConfig((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
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
            onChange={(e) => updateLayer(selectedLayer.id, { name: e.target.value })}
          />
        </div>

        {/* File upload */}
        <div className="space-y-1">
          <Label className="text-xs">File</Label>
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
                  ? 'video/*,.ogv,.mp4,.webm'
                  : 'image/*'
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(selectedLayer.id, file);
                e.target.value = '';
              }}
            />
          </div>
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
              onChange={(v) => updateLayer(selectedLayer.id, { x: v })}
              onReset={() => updateLayer(selectedLayer.id, { x: 0 })}
              resetValue={0}
              step={1}
              min={-config.width}
              max={config.width}
            />
            <PropertyRow
              label="Y"
              value={selectedLayer.y ?? 0}
              onChange={(v) => updateLayer(selectedLayer.id, { y: v })}
              onReset={() => updateLayer(selectedLayer.id, { y: 0 })}
              resetValue={0}
              step={1}
              min={-config.height}
              max={config.height}
            />
            <PropertyRow
              label="Scale"
              value={selectedLayer.scale ?? 1}
              onChange={(v) => updateLayer(selectedLayer.id, { scale: v })}
              onReset={() => updateLayer(selectedLayer.id, { scale: 1 })}
              resetValue={1}
              step={0.01}
              min={0.01}
              max={5}
              displayValue={((selectedLayer.scale ?? 1) * 100).toFixed(0) + '%'}
            />
            <PropertyRow
              label="Opacity"
              value={selectedLayer.opacity ?? 1}
              onChange={(v) => updateLayer(selectedLayer.id, { opacity: v })}
              onReset={() => updateLayer(selectedLayer.id, { opacity: 1 })}
              resetValue={1}
              step={0.01}
              min={0}
              max={1}
              displayValue={((selectedLayer.opacity ?? 1) * 100).toFixed(0) + '%'}
            />
          </>
        )}

        {/* Video-specific controls */}
        {selectedLayer.type === 'video' && (
          <VideoTimeline
            slug={slug}
            layerId={selectedLayer.id}
            file={selectedLayer.file}
            fileVersion={fileVersion}
            loopStart={selectedLayer.loop_start ?? 0}
            loopEnd={selectedLayer.loop_end ?? 0}
            onChange={(start, end) => updateLayer(selectedLayer.id, { loop_start: start, loop_end: end })}
          />
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
                        updateLayer(selectedLayer.id, {
                          targets: checked
                            ? [...targets, l.id]
                            : targets.filter((t) => t !== l.id),
                        });
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
            updateLayer={updateLayer}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AdvancedFilters({
  layer,
  updateLayer,
}: {
  layer: AnimapLayer;
  updateLayer: (id: string, updates: Partial<AnimapLayer>) => void;
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
                    onClick={() => updateLayer(layer.id, { [f.key]: f.default_ })}
                    title={`Reset ${f.label}`}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>
                <Slider
                  value={[val]}
                  onValueChange={([v]) => updateLayer(layer.id, { [f.key]: v })}
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
              const resets: Partial<AnimapLayer> = {};
              for (const f of filters) (resets as any)[f.key] = f.default_;
              updateLayer(layer.id, resets);
            }}
          >
            Reset all filters
          </button>
        </div>
      )}
    </div>
  );
}
