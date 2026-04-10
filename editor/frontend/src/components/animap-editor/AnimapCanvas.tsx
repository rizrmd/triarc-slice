import { useEffect, useRef, useState, useCallback, type RefObject, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import type { AnimapConfig, AnimapLayer } from '@/types';
import { getEffectiveLayers, updateStateLayerOverride } from '@/lib/animap-state';

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
  selectedStateId: string;
  selectedLayerId: string | null;
  commitConfig: (updater: (prev: AnimapConfig) => AnimapConfig) => void;
  canvasZoom: number;
  setCanvasZoom: (zoom: number) => void;
  canvasPan: { x: number; y: number };
  setCanvasPan: (pan: { x: number; y: number }) => void;
  fileVersion: number;
  brushSize: number;
  brushOpacity: number;
  brushHardness: number;
  brushMode: 'paint' | 'erase';
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;
  setMaskDirty: (dirty: boolean) => void;
  activeVideoRef: MutableRefObject<HTMLVideoElement | null>;
}

export function AnimapCanvas({
  slug,
  config,
  selectedStateId,
  selectedLayerId,
  commitConfig,
  canvasZoom,
  setCanvasZoom,
  canvasPan,
  setCanvasPan,
  fileVersion,
  brushSize,
  brushOpacity,
  brushHardness,
  brushMode,
  maskCanvasRef,
  setMaskDirty,
  activeVideoRef,
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
  const effectiveLayers = getEffectiveLayers(config, selectedStateId);
  const selectedLayer = effectiveLayers.find((l) => l.id === selectedLayerId);
  const isMaskMode = selectedLayer?.type === 'mask';

  // Init mask canvas when selecting a mask layer.
  // Deliberately excludes selectedLayer?.file and fileVersion from deps:
  // saving the mask updates both, but the canvas already has the correct
  // content — re-running would clear and reload mid-stroke, causing stutter.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaskMode, selectedLayerId, config.width, config.height, slug]);

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

  // Wheel: pinch-to-zoom (ctrlKey) and two-finger pan (no modifier)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom on macOS trackpad sends wheel events with ctrlKey
        // Zoom toward cursor position
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left - rect.width / 2;
        const cursorY = e.clientY - rect.top - rect.height / 2;
        const delta = -e.deltaY * 2;
        const newZoom = Math.max(10, Math.min(400, canvasZoom + delta));
        const ratio = newZoom / canvasZoom;
        setCanvasPan({
          x: cursorX - ratio * (cursorX - canvasPan.x),
          y: cursorY - ratio * (cursorY - canvasPan.y),
        });
        setCanvasZoom(newZoom);
      } else {
        // Two-finger pan
        setCanvasPan({
          x: canvasPan.x - e.deltaX,
          y: canvasPan.y - e.deltaY,
        });
      }
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, [canvasZoom, canvasPan, setCanvasZoom, setCanvasPan]);

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

    if (isMaskMode && e.button === 0 && !selectedLayer?.locked) {
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
      const layer = selectedLayer;
      if (layer && !layer.locked && (layer.type === 'image' || layer.type === 'video' || layer.type === 'text')) {
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
      // Re-assert dirty so auto-save schedules again if it fired mid-stroke
      setMaskDirty(true);
      return;
    }

    if (isDragging.current && dragLayerId.current) {
      const scale = canvasZoom / 100;
      const dx = e.clientX / scale - dragStart.current.x;
      const dy = e.clientY / scale - dragStart.current.y;
      commitConfig((prev) =>
        updateStateLayerOverride(
          updateStateLayerOverride(prev, selectedStateId, dragLayerId.current!, 'x', Math.round(dragStartPos.current.x + dx)),
          selectedStateId,
          dragLayerId.current!,
          'y',
          Math.round(dragStartPos.current.y + dy),
        )
      );
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
  effectiveLayers.forEach((layer) => {
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
        cursor: spaceHeld ? 'grab' : (isMaskMode && !selectedLayer?.locked) ? 'crosshair' : 'default',
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
        {effectiveLayers.map((layer) => {
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
                style={{
                  position: 'absolute',
                  left: layer.x ?? 0,
                  top: layer.y ?? 0,
                  transform: `scale(${layer.scale ?? 1})`,
                  transformOrigin: 'top left',
                  opacity: layer.opacity ?? 1,
                  filter: cssFilter,
                  pointerEvents: isMaskMode ? 'none' : 'auto',
                  cursor: layer.locked ? 'default' : 'move',
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
            const previewUrl = layer.file
              ? `/api/animap-preview/${slug}/${layer.file}?v=${fileVersion}`
              : fileUrl;
            return (
              <VideoLayer
                key={layer.id}
                layer={layer}
                fileUrl={previewUrl}
                cssFilter={cssFilter}
                selected={selectedLayerId === layer.id}
                isMaskMode={isMaskMode}
                maskUrls={maskLookup[layer.id] ?? []}
                configWidth={config.width}
                configHeight={config.height}
                activeVideoRef={selectedLayerId === layer.id ? activeVideoRef : undefined}
              />
            );
          }

          if (layer.type === 'text') {
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
                style={{
                  position: 'absolute',
                  left: layer.x ?? 0,
                  top: layer.y ?? 0,
                  transform: `scale(${layer.scale ?? 1})`,
                  transformOrigin: 'top left',
                  opacity: layer.opacity ?? 1,
                  filter: cssFilter,
                  pointerEvents: isMaskMode ? 'none' : 'auto',
                  cursor: layer.locked ? 'default' : 'move',
                  outline: selectedLayerId === layer.id ? '2px solid #3b82f6' : 'none',
                  color: layer.color ?? '#ffffff',
                  fontSize: `${layer.font_size ?? 96}px`,
                  fontFamily: '"Volkhov", serif',
                  fontWeight: 700,
                  lineHeight: 1,
                  whiteSpace: 'pre-wrap',
                  width: layer.width ?? 480,
                  height: layer.height ?? 160,
                  overflow: 'hidden',
                  textAlign: layer.text_align ?? 'left',
                  ...(hasMask ? maskStyle : {}),
                }}
              >
                {layer.text || layer.name}
              </div>
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
  activeVideoRef,
}: {
  layer: { id: string; name: string; x?: number; y?: number; scale?: number; opacity?: number; loop?: boolean; loop_start?: number; loop_end?: number; locked?: boolean };
  fileUrl: string;
  cssFilter?: string;
  selected: boolean;
  isMaskMode: boolean;
  maskUrls: string[];
  configWidth: number;
  configHeight: number;
  activeVideoRef?: MutableRefObject<HTMLVideoElement | null>;
}) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const maskImagesRef = useRef<HTMLImageElement[]>([]);
  const loopFrameRef = useRef<ImageBitmap | null>(null);
  const SWAP_MARGIN = 0.05;

  // Track latest activeVideoRef prop without restarting effects
  const activeVideoRefLatest = useRef(activeVideoRef);
  activeVideoRefLatest.current = activeVideoRef;

  // Clean up parent ref when deselected
  useEffect(() => {
    if (!activeVideoRef) return;
    return () => { activeVideoRef.current = null; };
  }, [activeVideoRef]);

  // Determine if we need custom loop logic (non-trivial loop boundaries)
  const loopEnabled = layer.loop ?? true;
  const loopStart = layer.loop_start ?? 0;
  const loopEnd = layer.loop_end ?? 0;
  const hasCustomLoop = loopStart > 0 || loopEnd > 0;

  // Custom loop: both videos play continuously, offset by half the loop duration.
  // Both decoders stay warm — at the loop boundary we just switch which one we draw.
  useEffect(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    if (!videoA || !videoB || !hasCustomLoop) return;

    let initialized = false;
    const tryInit = () => {
      if (initialized || videoA.readyState < 1 || videoB.readyState < 1) return;
      const dur = videoA.duration;
      if (!dur || isNaN(dur)) return;
      initialized = true;
      const end = loopEnd > 0 ? loopEnd : dur;
      const loopDur = end - loopStart;
      videoA.currentTime = loopStart;
      void videoA.play().catch(() => {});
      videoB.currentTime = loopStart + loopDur / 2;
      void videoB.play().catch(() => {});
    };

    const captureLoopFrame = (video: HTMLVideoElement) => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        createImageBitmap(video).then(bmp => {
          loopFrameRef.current?.close();
          loopFrameRef.current = bmp;
        }).catch(() => {});
      }
    };
    const onSeekedA = () => { if (Math.abs(videoA.currentTime - loopStart) < 0.15) captureLoopFrame(videoA); };
    const onSeekedB = () => { if (Math.abs(videoB.currentTime - loopStart) < 0.15) captureLoopFrame(videoB); };
    // Safety net: if a video reaches its natural file end, restart it
    const onEndedA = () => { videoA.currentTime = loopStart; void videoA.play().catch(() => {}); };
    const onEndedB = () => { videoB.currentTime = loopStart; void videoB.play().catch(() => {}); };

    videoA.addEventListener('loadedmetadata', tryInit);
    videoB.addEventListener('loadedmetadata', tryInit);
    videoA.addEventListener('seeked', onSeekedA);
    videoB.addEventListener('seeked', onSeekedB);
    videoA.addEventListener('ended', onEndedA);
    videoB.addEventListener('ended', onEndedB);
    tryInit();

    return () => {
      videoA.removeEventListener('loadedmetadata', tryInit);
      videoB.removeEventListener('loadedmetadata', tryInit);
      videoA.removeEventListener('seeked', onSeekedA);
      videoB.removeEventListener('seeked', onSeekedB);
      videoA.removeEventListener('ended', onEndedA);
      videoB.removeEventListener('ended', onEndedB);
      loopFrameRef.current?.close();
      loopFrameRef.current = null;
    };
  }, [loopStart, loopEnd, hasCustomLoop]);

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

  // Ensure primary video plays (autoplay can be blocked even when muted)
  useEffect(() => {
    const video = videoARef.current;
    if (!video) return;
<<<<<<< HEAD
    const tryPlay = () => { video.play().catch(() => {}); };
    video.addEventListener('canplay', tryPlay);
    if (video.readyState >= 3) tryPlay();
    return () => { video.removeEventListener('canplay', tryPlay); };
=======
    console.log('[video] loading', fileUrl, 'readyState:', video.readyState);
    const onError = () => console.error('[video] error loading', fileUrl, video.error?.message, video.error?.code);
    const onLoaded = () => console.log('[video] loadedmetadata', fileUrl, video.videoWidth, 'x', video.videoHeight, 'duration:', video.duration);
    const tryPlay = () => { console.log('[video] canplay, attempting play', fileUrl); video.play().catch((e) => console.error('[video] play failed', e)); };
    video.addEventListener('error', onError);
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('canplay', tryPlay);
    if (video.readyState >= 3) tryPlay();
    return () => { video.removeEventListener('error', onError); video.removeEventListener('loadedmetadata', onLoaded); video.removeEventListener('canplay', tryPlay); };
>>>>>>> origin/main
  }, [fileUrl]);

  // Draw video frames to canvas, apply mask if present, handle loop boundaries
  useEffect(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    const canvas = canvasRef.current;
    if (!videoA || !videoB || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      let video: HTMLVideoElement;

      if (loopEnabled && hasCustomLoop) {
        // Both videos play continuously, offset by half the loop duration.
        // Reset any video that crosses loopEnd back to loopStart.
        const dur = videoA.duration;
        const end = loopEnd > 0 ? loopEnd : dur;
        if (end > 0 && !isNaN(end)) {
          for (const v of [videoA, videoB]) {
            if (v.readyState >= 1 && !v.paused && !v.seeking) {
              if (v.currentTime >= end - SWAP_MARGIN || v.currentTime < loopStart - 0.05) {
                v.currentTime = loopStart;
              }
            }
          }
        }

        // Pick whichever video is further into the loop (less recently seeked, decoder warmer)
        const aTime = videoA.currentTime;
        const bTime = videoB.currentTime;
        const endV = loopEnd > 0 ? loopEnd : (dur || Infinity);
        const aOk = aTime >= loopStart && aTime < endV && videoA.readyState >= 2 && !videoA.seeking;
        const bOk = bTime >= loopStart && bTime < endV && videoB.readyState >= 2 && !videoB.seeking;

        if (aOk && bOk) {
          video = (aTime - loopStart) > (bTime - loopStart) ? videoA : videoB;
        } else if (aOk) {
          video = videoA;
        } else if (bOk) {
          video = videoB;
        } else {
          video = videoA; // fallback
        }
      } else {
        video = videoA;
        // Non-loop: stop at end
        if (!loopEnabled && video.readyState >= 2) {
          const end = loopEnd > 0 ? loopEnd : video.duration;
          if (end > 0 && !isNaN(end) && !video.paused && video.currentTime >= end) {
            video.currentTime = end;
            video.pause();
          }
        }
        // Full-video loop: native `loop` attribute handles it, nothing to do.
      }

      if (activeVideoRefLatest.current) activeVideoRefLatest.current.current = video;

      // Draw from live video, fall back to cached loop-start frame during seeks
      const hasLiveFrame = video.readyState >= 2 && video.videoWidth > 0;
      const drawSource: CanvasImageSource | null = hasLiveFrame ? video : loopFrameRef.current;
      const vw = hasLiveFrame ? video.videoWidth : (loopFrameRef.current?.width ?? 0);
      const vh = hasLiveFrame ? video.videoHeight : (loopFrameRef.current?.height ?? 0);
      if (drawSource && vw > 0 && vh > 0) {
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }
        ctx.clearRect(0, 0, vw, vh);
        ctx.drawImage(drawSource, 0, 0);

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
  }, [fileUrl, maskUrls.join(','), layer.x, layer.y, configWidth, configHeight, loopEnabled, loopStart, loopEnd, hasCustomLoop]);

  return (
    <div
      style={{
        position: 'absolute',
        left: layer.x ?? 0,
        top: layer.y ?? 0,
        transform: `scale(${layer.scale ?? 1})`,
        transformOrigin: 'top left',
        opacity: layer.opacity ?? 1,
        filter: cssFilter,
        pointerEvents: isMaskMode ? 'none' : 'auto',
        cursor: layer.locked ? 'default' : 'move',
        outline: selected ? '2px solid #3b82f6' : 'none',
      }}
    >
      <video
        ref={videoARef}
        src={fileUrl}
        muted
        autoPlay
        playsInline
        preload="auto"
        loop={loopEnabled && !hasCustomLoop}
        style={{ position: 'absolute', top: 0, left: 0, opacity: 0.01, pointerEvents: 'none' }}
      />
      <video
        ref={videoBRef}
        src={fileUrl}
        muted
        playsInline
        preload="auto"
        style={{ position: 'absolute', top: 0, left: 0, opacity: 0.01, pointerEvents: 'none' }}
      />
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
}
