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

// Per-slug shared state — one WebGL context + matrices for all layers in the same animap
interface SharedState {
  ctx: EffekseerContext;
  gl: WebGLRenderingContext;
  refcount: number;
  // Perspective camera matrices (position: 20,20,20 looking at origin)
  projectionMatrix: Float32Array;
  cameraMatrix: Float32Array;
  // Combined animation loop handle
  rafHandle: number;
  timerRef: { current: { update: (ts: number) => void; getDelta: () => number } };
  effects: Set<{ handle: EffekseerHandle | null; paused: boolean }>;
}

const sharedStates = new Map<string, SharedState>();

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

// LookAt matrix: camera at eye looking at center
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

function getOrCreateSharedState(slug: string, canvas: HTMLCanvasElement): SharedState | null {
  const existing = sharedStates.get(slug);
  if (existing) {
    existing.refcount++;
    return existing;
  }

  if (!window.effekseer) return null;

  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
    desynchronized: true, // Reduce latency
  });
  if (!gl) return null;

  const ctx = window.effekseer.createContext();
  if (!ctx) return null;

  ctx.init(gl);
  if (!ctx.nativeptr) return null;
  ctx.setRestorationOfStatesFlag(false);

  // Perspective camera: FOV 30, aspect 1, near 1, far 1000, position (20,20,20) looking at origin
  const projectionMatrix = makePerspectiveMatrix(30, 1, 1, 1000);
  const cameraMatrix = makeLookAtMatrix([20, 20, 20], [0, 0, 0], [0, 1, 0]);

  const timer = { current: { update: (_ts: number) => {}, getDelta: () => 0 } };
  const lastTimestamp = { value: 0 };
  timer.current.update = (ts: number) => { lastTimestamp.value = ts; };
  timer.current.getDelta = () => {
    const now = performance.now() / 1000;
    const delta = Math.min(now - lastTimestamp.value, 0.1); // Cap at 100ms
    return delta;
  };

  const effects = new Set<{ handle: EffekseerHandle | null; paused: boolean }>();

  // Single RAF loop for the entire slug — iterates all active effects
  let running = true;
  const animate = (timestamp: number) => {
    if (!running) return;
    // Skip rendering when tab is hidden
    if (!document.hidden) {
      timer.current.update(timestamp);
      const delta = timer.current.getDelta();
      ctx.update(delta * 60.0);
      ctx.setProjectionMatrix(projectionMatrix);
      ctx.setCameraMatrix(cameraMatrix);
      ctx.draw();
    }
    // Schedule next frame regardless of visibility (effects need update even when hidden)
    requestAnimationFrame(animate);
  };

  const rafHandle = requestAnimationFrame(animate);

  const state: SharedState = {
    ctx, gl, refcount: 1,
    projectionMatrix, cameraMatrix,
    rafHandle, timerRef: timer, effects,
  };
  sharedStates.set(slug, state);
  return state;
}

function releaseSharedState(slug: string) {
  const state = sharedStates.get(slug);
  if (!state) return;
  state.refcount--;
  if (state.refcount <= 0) {
    cancelAnimationFrame(state.rafHandle);
    sharedStates.delete(slug);
  }
}

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
  const effectRef = useRef<EffekseerEffect | null>(null);
  const handleRef = useRef<EffekseerHandle | null>(null);
  const stateRef = useRef<SharedState | null>(null);
  const effectEntryRef = useRef<{ handle: EffekseerHandle | null; paused: boolean } | null>(null);
  const pausedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isEffekseerReady, setIsEffekseerReady] = useState(false);
  const onLayerRefRef = useRef(onLayerRef);
  onLayerRefRef.current = onLayerRef;

  const imperativeHandle = {
    play: () => {
      if (!effectRef.current || !stateRef.current) return;
      if (pausedRef.current) {
        pausedRef.current = false;
        if (handleRef.current) handleRef.current.setPaused(false);
        if (effectEntryRef.current) effectEntryRef.current.paused = false;
      } else {
        if (handleRef.current) handleRef.current.stop();
        handleRef.current = stateRef.current.ctx.play(effectRef.current, 0, 0, 0);
        if (effectEntryRef.current) effectEntryRef.current.handle = handleRef.current;
      }
    },
    pause: () => {
      if (!effectRef.current) return;
      pausedRef.current = true;
      if (handleRef.current) handleRef.current.setPaused(true);
      if (effectEntryRef.current) effectEntryRef.current.paused = true;
    },
    isPlaying: () => !pausedRef.current,
  };

  useEffect(() => {
    if (onLayerRefRef.current) onLayerRefRef.current(imperativeHandle);
    return () => { if (onLayerRefRef.current) onLayerRefRef.current(null); };
  }, []);

  // Load Effekseer script once globally
  useEffect(() => {
    if (window.effekseer) {
      setIsEffekseerReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = '/effekseer/effekseer.min.js';
    script.async = true;

    script.onload = () => {
      if (window.effekseer) {
        window.effekseer.initRuntime(
          '/effekseer/effekseer.wasm',
          () => setIsEffekseerReady(true),
          (err) => setError('Effekseer WASM failed to load: ' + err)
        );
      }
    };
    script.onerror = () => setError('Failed to load Effekseer script');
    document.head.appendChild(script);
  }, []);

  // Setup: shared state, load effect, register with the RAF loop
  useEffect(() => {
    if (!canvasRef.current || !file || !isEffekseerReady) return;

    const state = getOrCreateSharedState(slug, canvasRef.current);
    if (!state) {
      setError('Failed to create Effekseer context');
      return;
    }
    stateRef.current = state;

    const effectEntry = { handle: null as EffekseerHandle | null, paused: false as boolean };
    effectEntryRef.current = effectEntry;
    state.effects.add(effectEntry);

    const effectUrl = `/data/animap/${slug}/${file}?v=${fileVersion}`;
    setIsLoading(true);

    const onLoad = () => {
      setIsLoading(false);
      setIsReady(true);
      if (effectRef.current) {
        handleRef.current = state.ctx.play(effectRef.current, 0, 0, 0);
        effectEntry.handle = handleRef.current;
        if (!loop && handleRef.current) {
          handleRef.current.setPaused(true);
          pausedRef.current = true;
          effectEntry.paused = true;
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
      effectRef.current = state.ctx.loadEffect(effectUrl, 1.0, onLoad, onError);
    }

    return () => {
      if (handleRef.current) {
        handleRef.current.stop();
        handleRef.current = null;
      }
      if (effectEntryRef.current) {
        state.effects.delete(effectEntryRef.current);
        effectEntryRef.current = null;
      }
      effectRef.current = null;
      stateRef.current = null;
      releaseSharedState(slug);
    };
  }, [file, slug, fileVersion, isEffekseerReady]);

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
      {/* Single small canvas — shared WebGL context across all Effekseer layers in this slug */}
      <canvas
        ref={canvasRef}
        width={128}
        height={128}
        style={{
          display: 'block',
          background: 'transparent',
          position: 'absolute',
          inset: 0,
          imageRendering: 'auto',
        }}
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
