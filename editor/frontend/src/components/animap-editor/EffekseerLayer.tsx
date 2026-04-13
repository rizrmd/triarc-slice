import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

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
  // Called with the imperative handle (play/pause) when the layer mounts
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
  // init() returns undefined in effekseer.js — check nativeptr instead
  init: (gl: WebGLRenderingContext) => void;
  nativeptr: number | null;
  loadEffect: (url: string, scale: number, onLoad: () => void, onError?: (err: string) => void) => EffekseerEffect;
  update: (delta: number) => void;
  draw: () => void;
  setProjectionMatrix: (m: number[]) => void;
  setCameraMatrix: (m: number[]) => void;
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
  const effekseerCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const contextRef = useRef<EffekseerContext | null>(null);
  const effectRef = useRef<EffekseerEffect | null>(null);
  const handleRef = useRef<EffekseerHandle | null>(null);
  const timerRef = useRef(new THREE.Timer());
  const animationRef = useRef<number>(0);
  // Tracks runtime pause state (independent of config loop value)
  const pausedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isEffekseerReady, setIsEffekseerReady] = useState(false);
  const onLayerRefRef = useRef(onLayerRef);
  onLayerRefRef.current = onLayerRef;

  // Expose imperative API to parent (AnimapPropertyPanel)
  const imperativeHandle = {
    play: () => {
      if (!effectRef.current || !contextRef.current) return;
      if (pausedRef.current) {
        // Resume from paused state
        pausedRef.current = false;
        if (handleRef.current) {
          handleRef.current.setPaused(false);
        }
      } else {
        // Restart: stop any existing handle and create fresh one
        if (handleRef.current) {
          handleRef.current.stop();
        }
        handleRef.current = contextRef.current.play(effectRef.current, 0, 0, 0);
      }
    },
    pause: () => {
      if (!effectRef.current) return;
      pausedRef.current = true;
      if (handleRef.current) {
        handleRef.current.setPaused(true);
      }
    },
    isPlaying: () => {
      return !pausedRef.current;
    },
  };


  // Notify parent of the imperative handle so AnimapCanvas can store it
  useEffect(() => {
    if (onLayerRefRef.current) onLayerRefRef.current(imperativeHandle);
    return () => { if (onLayerRefRef.current) onLayerRefRef.current(null); };
  }, []);

  // Load Effekseer script once
  useEffect(() => {
    if (window.effekseer) {
      return; // Already loaded
    }

    const script = document.createElement('script');
    script.src = '/effekseer/effekseer.min.js';
    script.async = true;

    script.onload = () => {
      // Must call initRuntime to load the WASM before createContext works
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

  // Initialize Three.js + Effekseer
  useEffect(() => {
    if (!canvasRef.current || !effekseerCanvasRef.current || !file || !isEffekseerReady) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!container) return;

    const cleanup = () => {
      cancelAnimationFrame(animationRef.current);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      timerRef.current.dispose();
      contextRef.current = null;
      effectRef.current = null;
      handleRef.current = null;
    };

    const init = () => {
      if (!window.effekseer) {
        setError('Effekseer not loaded');
        return;
      }

      if (!effekseerCanvasRef.current) {
        setError('Effekseer canvas not ready');
        return;
      }

      // Three.js setup — own canvas so it owns its own WebGL context
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(256, 256);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
      camera.position.set(20, 20, 20);
      camera.lookAt(0, 0, 0);

      // Initialize Effekseer with its own canvas + its own WebGL context
      const effCtx = window.effekseer.createContext();
      if (!effCtx) {
        setError('Failed to create Effekseer context (WASM not initialized)');
        return;
      }
      const gl2 = effekseerCanvasRef.current.getContext('webgl');
      if (!gl2) {
        setError('Failed to get WebGL context for Effekseer');
        return;
      }
      // effekseer.init() returns undefined — nativeptr is the real success indicator
      effCtx.init(gl2);
      if (!effCtx.nativeptr) {
        setError('Failed to initialize Effekseer core');
        return;
      }
      effCtx.setRestorationOfStatesFlag(false);
      contextRef.current = effCtx;

      // Set projection/camera matrices
      effCtx.setProjectionMatrix(camera.projectionMatrix.elements);
      effCtx.setCameraMatrix(camera.matrixWorldInverse.elements);

      // Load effect
      const effectUrl = `/data/animap/${slug}/${file}?v=${fileVersion}`;
      setIsLoading(true);
      const onLoad = () => {
        setIsLoading(false);
        setIsReady(true);
        if (effectRef.current) {
          handleRef.current = effCtx.play(effectRef.current, 0, 0, 0);
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
        // already loaded from a previous render, just replay
        onLoad();
      } else {
        effectRef.current = effCtx.loadEffect(effectUrl, 1.0, onLoad, onError);
      }

      // Animation loop
      const animate = (timestamp: number) => {
        animationRef.current = requestAnimationFrame(animate);

        timerRef.current.update(timestamp);
        const delta = timerRef.current.getDelta();
        effCtx.update(delta * 60.0);

        renderer.render(scene, camera);

        effCtx.setProjectionMatrix(camera.projectionMatrix.elements);
        effCtx.setCameraMatrix(camera.matrixWorldInverse.elements);

        effCtx.draw();

      };
      animationRef.current = requestAnimationFrame(animate);
    };

    // Effekseer is ready once initRuntime completes (WASM loaded)
    init();

    return cleanup;
  }, [file, slug, fileVersion, isEffekseerReady]);

  // Update position
  useEffect(() => {
    if (!handleRef.current) return;
    // Effekseer uses 3D coordinates, we center at (0,0) and scale
    handleRef.current.setLocation(0, 0, 0);
  }, [x, y]);

  // Update scale
  useEffect(() => {
    if (!handleRef.current) return;
    handleRef.current.setScale(scale, scale, scale);
  }, [scale]);

  // Update opacity (via color alpha)
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
      {/* Three.js canvas — owns its own WebGL context */}
      <canvas
        ref={canvasRef}
        width={256}
        height={256}
        style={{ display: 'block', background: 'transparent', position: 'absolute', inset: 0 }}
      />
      {/* Effekseer canvas — separate canvas + separate WebGL context */}
      <canvas
        ref={effekseerCanvasRef}
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
