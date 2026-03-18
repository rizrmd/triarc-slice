import { useEffect, useRef, useState, useCallback, type RefObject, type PointerEvent as ReactPointerEvent } from 'react';
import type { AnimapConfig, AnimapLayer } from '@/types';

function buildCssFilter(layer: AnimapLayer): string | undefined {
  const parts: string[] = [];
  if (layer.hue !== undefined && layer.hue !== 0) parts.push(`hue-rotate(${layer.hue}deg)`);
  if (layer.saturation !== undefined && layer.saturation !== 100) parts.push(`saturate(${layer.saturation}%)`);
  // Lightness uses CSS brightness (additive light feel)
  if (layer.lightness !== undefined && layer.lightness !== 100) parts.push(`brightness(${layer.lightness}%)`);
  // Brightness is a separate multiplier on top
  if (layer.brightness !== undefined && layer.brightness !== 100) parts.push(`brightness(${layer.brightness}%)`);
  if (layer.contrast !== undefined && layer.contrast !== 100) parts.push(`contrast(${layer.contrast}%)`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

interface AnimapCanvasProps {
  slug: string;
  config: AnimapConfig;
  selectedLayerId: string | null;
  setSelectedLayerId: (id: string | null) => void;
  commitConfig: (updater: (prev: AnimapConfig) => AnimapConfig) => void;
  canvasZoom: number;
  canvasPan: { x: number; y: number };
  setCanvasPan: (pan: { x: number; y: number }) => void;
  fileVersion: number;
  brushSize: number;
  brushOpacity: number;
  brushHardness: number;
  brushMode: 'paint' | 'erase';
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;
  setMaskDirty: (dirty: boolean) => void;
}

export function AnimapCanvas({
  slug,
  config,
  selectedLayerId,
  setSelectedLayerId: _setSelectedLayerId,
  commitConfig,
  canvasZoom,
  canvasPan,
  setCanvasPan,
  fileVersion,
  brushSize,
  brushOpacity,
  brushHardness,
  brushMode,
  maskCanvasRef,
  setMaskDirty,
}: AnimapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panStartOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragLayerId = useRef<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spacePressed = useRef(false);

  // Mask drawing state
  const isMaskPainting = useRef(false);
  const lastMaskPoint = useRef<{ x: number; y: number } | null>(null);
  const selectedLayer = config.layers.find((l) => l.id === selectedLayerId);
  const isMaskMode = selectedLayer?.type === 'mask';

  // Init mask canvas when selecting a mask layer
  useEffect(() => {
    if (!isMaskMode || !maskCanvasRef.current) return;
    const canvas = maskCanvasRef.current;
    canvas.width = config.width;
    canvas.height = config.height;

    // Load existing mask file (raw strokes: white where painted)
    if (selectedLayer?.file) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      };
      img.src = `/data/animap/${slug}/${selectedLayer.file}?v=${fileVersion}`;
    }
  }, [isMaskMode, selectedLayerId, config.width, config.height, slug, selectedLayer?.file, fileVersion]);

  // Space key for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        spacePressed.current = true;
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressed.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        const newZoom = Math.max(10, Math.min(400, canvasZoom + delta));
        // We can't call setCanvasZoom here since it's a prop, we need a workaround
        // Actually we need to pass setCanvasZoom too but it's not in props
        // For now dispatch a custom event
        container.dispatchEvent(new CustomEvent('canvas-zoom', { detail: newZoom }));
      }
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, [canvasZoom]);

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const scale = canvasZoom / 100;
      const cx = (clientX - rect.left - rect.width / 2 - canvasPan.x) / scale + config.width / 2;
      const cy = (clientY - rect.top - rect.height / 2 - canvasPan.y) / scale + config.height / 2;
      return { x: cx, y: cy };
    },
    [canvasZoom, canvasPan, config.width, config.height]
  );

  const drawBrushStroke = useCallback(
    (x: number, y: number) => {
      const canvas = maskCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const radius = brushSize / 2;
      ctx.save();
      if (brushMode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = brushOpacity;

      // Create radial gradient for softness
      const gradient = ctx.createRadialGradient(x, y, radius * brushHardness, x, y, radius);
      gradient.addColorStop(0, 'white');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    [brushSize, brushOpacity, brushHardness, brushMode, maskCanvasRef]
  );

  const interpolatePoints = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(1, brushSize / 4);
      const steps = Math.ceil(dist / step);
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        drawBrushStroke(from.x + dx * t, from.y + dy * t);
      }
    },
    [drawBrushStroke, brushSize]
  );

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (spacePressed.current || e.button === 1) {
      // Pan mode
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panStartOffset.current = { ...canvasPan };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (isMaskMode && e.button === 0) {
      // Mask painting
      isMaskPainting.current = true;
      const coords = getCanvasCoords(e.clientX, e.clientY);
      drawBrushStroke(coords.x, coords.y);
      lastMaskPoint.current = coords;
      setMaskDirty(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Layer dragging (skip if locked)
    if (e.button === 0 && selectedLayerId) {
      const layer = config.layers.find((l) => l.id === selectedLayerId);
      if (layer && !layer.locked && (layer.type === 'image' || layer.type === 'video')) {
        isDragging.current = true;
        dragLayerId.current = selectedLayerId;
        const scale = canvasZoom / 100;
        dragStart.current = { x: e.clientX / scale, y: e.clientY / scale };
        dragStartPos.current = { x: layer.x ?? 0, y: layer.y ?? 0 };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isPanning.current) {
      setCanvasPan({
        x: panStartOffset.current.x + (e.clientX - panStart.current.x),
        y: panStartOffset.current.y + (e.clientY - panStart.current.y),
      });
      return;
    }

    if (isMaskPainting.current) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      if (lastMaskPoint.current) {
        interpolatePoints(lastMaskPoint.current, coords);
      } else {
        drawBrushStroke(coords.x, coords.y);
      }
      lastMaskPoint.current = coords;
      return;
    }

    if (isDragging.current && dragLayerId.current) {
      const scale = canvasZoom / 100;
      const dx = e.clientX / scale - dragStart.current.x;
      const dy = e.clientY / scale - dragStart.current.y;
      commitConfig((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === dragLayerId.current
            ? {
                ...l,
                x: Math.round(dragStartPos.current.x + dx),
                y: Math.round(dragStartPos.current.y + dy),
              }
            : l
        ),
      }));
    }
  };

  const handlePointerUp = () => {
    isPanning.current = false;
    isDragging.current = false;
    dragLayerId.current = null;
    isMaskPainting.current = false;
    lastMaskPoint.current = null;
  };

  const scale = canvasZoom / 100;

  // Build mask lookup: for each non-mask layer, collect all mask URLs that target it
  const maskLookup: Record<string, string[]> = {};
  config.layers.forEach((layer) => {
    if (layer.type === 'mask' && layer.visible && layer.file && layer.targets) {
      for (const targetId of layer.targets) {
        if (!maskLookup[targetId]) maskLookup[targetId] = [];
        // If this is the currently selected mask being painted, use the canvas data URL
        // Otherwise use the file URL
        if (layer.id === selectedLayerId && isMaskMode && maskCanvasRef.current) {
          // We'll handle this via CSS on the mask canvas ref — skip for now, it's complex
          // Just use the file URL
        }
        maskLookup[targetId].push(`/data/animap/${slug}/${layer.file}?v=${fileVersion}`);
      }
    }
  });

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          'repeating-conic-gradient(#1a1a2e 0% 25%, #16162a 0% 50%) 0 0 / 20px 20px',
        cursor: spaceHeld ? 'grab' : isMaskMode ? 'crosshair' : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Animap canvas */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: config.width,
          height: config.height,
          transform: `translate(-50%, -50%) translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Layer rendering */}
        {config.layers.map((layer) => {
          if (!layer.visible) return null;

          const fileUrl = layer.file
            ? `/data/animap/${slug}/${layer.file}?v=${fileVersion}`
            : '';

          const cssFilter = buildCssFilter(layer);

          if (layer.type === 'image' && fileUrl) {
            const maskUrls = maskLookup[layer.id];
            const maskStyle: React.CSSProperties = maskUrls?.length
              ? {
                  WebkitMaskImage: maskUrls.map((u) => `url(${u})`).join(', '),
                  maskImage: maskUrls.map((u) => `url(${u})`).join(', '),
                  WebkitMaskSize: '100% 100%',
                  maskSize: '100% 100%',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                }
              : {};
            const hasMask = maskUrls?.length > 0;

            return (
              <div
                key={layer.id}
                onClick={(e) => { e.stopPropagation(); }}
                style={{
                  position: 'absolute',
                  left: layer.x ?? 0,
                  top: layer.y ?? 0,
                  transform: `scale(${layer.scale ?? 1})`,
                  transformOrigin: 'top left',
                  opacity: layer.opacity ?? 1,
                  filter: cssFilter,
                  pointerEvents: isMaskMode ? 'none' : 'auto',
                  cursor: 'move',
                  outline: selectedLayerId === layer.id ? '2px solid #3b82f6' : 'none',
                  ...(hasMask ? maskStyle : {}),
                }}
              >
                <img
                  src={fileUrl}
                  alt={layer.name}
                  draggable={false}
                  style={{ display: 'block' }}
                />
              </div>
            );
          }

          if (layer.type === 'video' && fileUrl) {
            return (
              <VideoLayer
                key={layer.id}
                layer={layer}
                fileUrl={fileUrl}
                cssFilter={cssFilter}
                selected={selectedLayerId === layer.id}
                isMaskMode={isMaskMode}
                maskUrls={maskLookup[layer.id] ?? []}
                configWidth={config.width}
                configHeight={config.height}
                onSelect={() => {}}
              />
            );
          }

          // Mask layers are not rendered visually as compositing elements
          // (they are applied to their targets via CSS mask-image)
          return null;
        })}

        {/* Mask canvas for painting — width/height set only in useEffect to avoid clearing on re-render */}
        {isMaskMode && (
          <canvas
            ref={maskCanvasRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: config.width,
              height: config.height,
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}

function VideoLayer({
  layer,
  fileUrl,
  cssFilter,
  selected,
  isMaskMode,
  maskUrls,
  configWidth,
  configHeight,
  onSelect,
}: {
  layer: { id: string; name: string; x?: number; y?: number; scale?: number; opacity?: number; loop_start?: number; loop_end?: number };
  fileUrl: string;
  cssFilter?: string;
  selected: boolean;
  isMaskMode: boolean;
  maskUrls: string[];
  configWidth: number;
  configHeight: number;
  onSelect: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const maskImagesRef = useRef<HTMLImageElement[]>([]);

  // Loop handling
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const loopStart = layer.loop_start ?? 0;
    const loopEnd = layer.loop_end ?? 0;

    const handleTimeUpdate = () => {
      if (!video) return;
      const end = loopEnd > 0 ? loopEnd : video.duration;
      if (video.currentTime >= end) video.currentTime = loopStart;
    };
    const handleLoaded = () => {
      if (loopStart > 0) video.currentTime = loopStart;
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoaded);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoaded);
    };
  }, [layer.loop_start, layer.loop_end]);

  // Load mask images
  useEffect(() => {
    if (maskUrls.length === 0) { maskImagesRef.current = []; return; }
    maskImagesRef.current = maskUrls.map((url) => {
      const img = new Image();
      img.onload = () => console.log('[mask] loaded', url, img.naturalWidth, img.naturalHeight);
      img.onerror = () => console.error('[mask] failed to load', url);
      img.src = url;
      return img;
    });
  }, [maskUrls.join(',')]);

  // Draw video frames to canvas, apply mask if present
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }
        ctx.clearRect(0, 0, vw, vh);
        ctx.drawImage(video, 0, 0);

        // Apply mask: cut out video where mask is opaque (painted)
        if (maskImagesRef.current.length > 0) {
          ctx.globalCompositeOperation = 'destination-out';
          const lx = layer.x ?? 0;
          const ly = layer.y ?? 0;
          const s = layer.scale ?? 1;
          for (const maskImg of maskImagesRef.current) {
            if (maskImg.complete && maskImg.naturalWidth > 0) {
              ctx.drawImage(maskImg, -lx / s, -ly / s, configWidth / s, configHeight / s);
            }
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [fileUrl, maskUrls.join(','), layer.x, layer.y, configWidth, configHeight]);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: 'absolute',
        left: layer.x ?? 0,
        top: layer.y ?? 0,
        transform: `scale(${layer.scale ?? 1})`,
        transformOrigin: 'top left',
        opacity: layer.opacity ?? 1,
        filter: cssFilter,
        pointerEvents: isMaskMode ? 'none' : 'auto',
        cursor: 'move',
        outline: selected ? '2px solid #3b82f6' : 'none',
      }}
    >
      <video
        ref={videoRef}
        src={fileUrl}
        muted
        autoPlay
        playsInline
        loop
        style={{ position: 'absolute', top: 0, left: 0, opacity: 0.01, pointerEvents: 'none' }}
      />
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
}
