import { useEffect, useRef, useState } from 'react';

interface EffekseerLayerProps {
  file: string;
  slug: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  loop: boolean;
  fileVersion: number;
  selected: boolean;
  isMaskMode: boolean;
  locked: boolean;
  onLayerRef?: (handle: { play: () => void; pause: () => void; isPlaying: () => boolean } | null) => void;
}

declare global {
  interface Window {
    effekseer: {
      initRuntime: (wasmPath: string, onload: () => void, onerror: (err: string) => void) => void;
      createContext: () => EffekseerContext | null;
    };
  }
}

interface EffekseerContext {
  init: (gl: WebGLRenderingContext) => void;
  nativeptr: number | null;
  loadEffect: (url: string, scale: number, onLoad: () => void, onError?: (err: string) => void) => EffekseerEffect;
  update: (delta: number) => void;
  draw: () => void;
  setProjectionMatrix: (m: Float32Array | number[]) => void;
  setCameraMatrix: (m: Float32Array | number[]) => void;
  setRestorationOfStatesFlag: (flag: boolean) => void;
  play: (effect: EffekseerEffect, x?: number, y?: number, z?: number) => EffekseerHandle;
}

interface EffekseerEffect {
  onerror?: (err: string) => void;
}
interface EffekseerHandle {
  setLocation: (x: number, y: number, z: number) => void;
  setScale: (x: number, y: number, z: number) => void;
  setAllColor: (r: number, g: number, b: number, a: number) => void;
  setPaused: (paused: boolean) => void;
  stop: () => void;
}

function makePerspectiveMatrix(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fov * Math.PI / 360);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function makeLookAtMatrix(eye: number[], center: number[], up: number[]): Float32Array {
  const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let len = Math.sqrt(zx * zx + zy * zy + zz * zz);
  const z = [zx / len, zy / len, zz / len];
  const xx = up[1] * z[2] - up[2] * z[1];
  const xy = up[2] * z[0] - up[0] * z[2];
  const xz = up[0] * z[1] - up[1] * z[0];
  len = Math.sqrt(xx * xx + xy * xy + xz * xz);
  const x = [xx / len, xy / len, xz / len];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

// Shared Effekseer runtime init (one-time WASM load)
let effekseerReady = false;
let effekseerError: string | null = null;
const effekseerReadyListeners: ((ready: boolean) => void)[] = [];

function initEffekseer() {
  if (window.effekseer) {
    effekseerReady = true;
    effekseerReadyListeners.forEach(l => l(true));
    return;
  }
  if (effekseerError) return;

  const script = document.createElement('script');
  script.src = '/effekseer/effekseer.min.js';
  script.async = true;
  script.onload = () => {
    if (window.effekseer) {
      window.effekseer.initRuntime(
        '/effekseer/effekseer.wasm',
        () => {
          effekseerReady = true;
          effekseerReadyListeners.forEach(l => l(true));
        },
        (err) => {
          effekseerError = 'Effekseer WASM failed: ' + err;
          effekseerReadyListeners.forEach(l => l(false));
        }
      );
    }
  };
  script.onerror = () => {
    effekseerError = 'Failed to load Effekseer script';
    effekseerReadyListeners.forEach(l => l(false));
  };
  document.head.appendChild(script);
}

initEffekseer();

export function EffekseerLayer({
  file,
  slug,
  x,
  y,
  scale,
  opacity,
  loop,
  fileVersion,
  selected,
  isMaskMode,
  locked,
  onLayerRef,
}: EffekseerLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<EffekseerContext | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const effectRef = useRef<EffekseerEffect | null>(null);
  const handleRef = useRef<EffekseerHandle | null>(null);
  const animationRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const onLayerRefRef = useRef(onLayerRef);
  onLayerRefRef.current = onLayerRef;

  const imperativeHandle = {
    play: () => {
      if (!effectRef.current || !contextRef.current) return;
      if (pausedRef.current) {
        pausedRef.current = false;
        if (handleRef.current) handleRef.current.setPaused(false);
      } else {
        if (handleRef.current) handleRef.current.stop();
        handleRef.current = contextRef.current.play(effectRef.current, 0, 0, 0);
      }
    },
    pause: () => {
      if (!effectRef.current) return;
      pausedRef.current = true;
      if (handleRef.current) handleRef.current.setPaused(true);
    },
    isPlaying: () => !pausedRef.current,
  };

  useEffect(() => {
    if (onLayerRefRef.current) onLayerRefRef.current(imperativeHandle);
    return () => { if (onLayerRefRef.current) onLayerRefRef.current(null); };
  }, []);

  // Wait for Effekseer runtime
  useEffect(() => {
    if (effekseerError) { setError(effekseerError); return; }
    if (effekseerReady) return;
    const listener = (ready: boolean) => {
      if (!ready && effekseerError) setError(effekseerError);
    };
    effekseerReadyListeners.push(listener);
    return () => {
      const idx = effekseerReadyListeners.indexOf(listener);
      if (idx >= 0) effekseerReadyListeners.splice(idx, 1);
    };
  }, []);

  // Setup WebGL context + Effekseer + animation loop
  useEffect(() => {
    if (!canvasRef.current || !file || !effekseerReady) return;

    const canvas = canvasRef.current;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
      desynchronized: true,
    });
    if (!gl) { setError('WebGL not available'); return; }
    glRef.current = gl;

    const ctx = window.effekseer!.createContext();
    if (!ctx) { setError('Failed to create Effekseer context'); return; }
    ctx.init(gl);
    if (!ctx.nativeptr) { setError('Effekseer init failed'); return; }
    ctx.setRestorationOfStatesFlag(false);
    contextRef.current = ctx;

    // Camera matrices
    const projectionMatrix = makePerspectiveMatrix(30, 1, 1, 1000);
    const cameraMatrix = makeLookAtMatrix([20, 20, 20], [0, 0, 0], [0, 1, 0]);
    ctx.setProjectionMatrix(projectionMatrix);
    ctx.setCameraMatrix(cameraMatrix);

    // Load effect
    const effectUrl = `/data/animap/${slug}/${file}?v=${fileVersion}`;
    setIsLoading(true);

    const onLoad = () => {
      setIsLoading(false);
      setIsReady(true);
      if (effectRef.current) {
        handleRef.current = ctx.play(effectRef.current, 0, 0, 0);
        if (!loop && handleRef.current) {
          handleRef.current.setPaused(true);
          pausedRef.current = true;
        }
      }
    };
    const onError = (err: string) => {
      setIsLoading(false);
      setError('Failed to load effect: ' + err);
    };

    if (effectRef.current) {
      onLoad();
    } else {
      effectRef.current = ctx.loadEffect(effectUrl, 1.0, onLoad, onError);
    }

    // RAF loop
    let lastTime = performance.now();
    let running = true;
    const animate = (timestamp: number) => {
      if (!running) return;
      animationRef.current = requestAnimationFrame(animate);

      // Skip GPU work when hidden (save CPU/GPU)
      if (!document.hidden) {
        const delta = Math.min((timestamp - lastTime) / 1000, 0.1);
        lastTime = timestamp;
        ctx.update(delta * 60.0);
        ctx.setProjectionMatrix(projectionMatrix);
        ctx.setCameraMatrix(cameraMatrix);
        ctx.draw();
      } else {
        // Still advance time when hidden so effects don't freeze
        lastTime = timestamp;
      }
    };
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(animationRef.current);
      if (handleRef.current) { handleRef.current.stop(); handleRef.current = null; }
      effectRef.current = null;
      if (contextRef.current) { contextRef.current = null; }
      if (glRef.current) { glRef.current = null; }
    };
  }, [file, slug, fileVersion, effekseerReady]);

  // Update position
  useEffect(() => {
    if (!handleRef.current) return;
    handleRef.current.setLocation(0, 0, 0);
  }, [x, y]);

  // Update scale
  useEffect(() => {
    if (!handleRef.current) return;
    handleRef.current.setScale(scale, scale, scale);
  }, [scale]);

  // Update opacity
  useEffect(() => {
    if (!handleRef.current) return;
    handleRef.current.setAllColor(1, 1, 1, opacity);
  }, [opacity]);

  // Handle loop prop change
  useEffect(() => {
    pausedRef.current = false;
  }, [loop]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        pointerEvents: isMaskMode ? 'none' : 'auto',
        cursor: locked ? 'default' : 'move',
        outline: selected ? '2px solid #3b82f6' : 'none',
        opacity: isReady ? 1 : 0.5,
      }}
    >
      <canvas
        ref={canvasRef}
        width={256}
        height={256}
        style={{ display: 'block', background: 'transparent', position: 'absolute', inset: 0 }}
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded">
          <div className="text-xs text-white">Loading...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
          <div className="text-xs text-red-400 text-center p-2">{error}</div>
        </div>
      )}
      {!file && (
        <div
          className="flex flex-col items-center justify-center rounded border-2 border-dashed border-primary/40 bg-primary/5"
          style={{ width: 128, height: 128 }}
        >
          <div className="text-2xl">✨</div>
          <div className="text-[10px] text-muted-foreground mt-1 text-center px-1">Upload .efkefc or .zip (with textures)</div>
        </div>
      )}
    </div>
  );
}
