import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { AnimapConfig, AnimapLayer } from '@/types';
import { getEffectiveLayers } from '@/lib/animap-state';

type FillMode = 'contain' | 'cover' | 'stretch' | 'none';

interface AnimapPreviewProps {
  slug: string;
  fill?: FillMode;
  stateId?: string;
  fallbackLabel?: string;
  panX?: number;
  runtimeBehavior?: 'gameplay-time';
}

type LayerBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function buildCssFilter(layer: AnimapLayer): string | undefined {
  const parts: string[] = [];
  if (layer.hue !== undefined && layer.hue !== 0) parts.push(`hue-rotate(${layer.hue}deg)`);
  if (layer.saturation !== undefined && layer.saturation !== 100) parts.push(`saturate(${layer.saturation}%)`);
  if (layer.lightness !== undefined && layer.lightness !== 100) parts.push(`brightness(${layer.lightness}%)`);
  if (layer.brightness !== undefined && layer.brightness !== 100) parts.push(`brightness(${layer.brightness}%)`);
  if (layer.contrast !== undefined && layer.contrast !== 100) parts.push(`contrast(${layer.contrast}%)`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function AnimapPreview({
  slug,
  fill = 'contain',
  stateId = 'default',
  fallbackLabel,
  panX = 0.5,
  runtimeBehavior,
}: AnimapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<AnimapConfig | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [mediaSizes, setMediaSizes] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => {
    let cancelled = false;
    setConfig(null);
    setMediaSizes({});

    fetch(`/api/animap/${slug}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch animap');
        }
        return res.json();
      })
      .then((data: AnimapConfig) => {
        if (!cancelled) {
          setConfig(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfig(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const updateSize = (width: number, height: number) => {
      setContainerSize({
        width: Math.max(0, width),
        height: Math.max(0, height),
      });
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateSize(entry.contentRect.width, entry.contentRect.height);
      }
    });

    resizeObserver.observe(containerRef.current);
    updateSize(containerRef.current.clientWidth, containerRef.current.clientHeight);

    return () => resizeObserver.disconnect();
  }, []);

  const effectiveLayers = useMemo(
    () => (config ? getEffectiveLayers(config, stateId) : []),
    [config, stateId]
  );

  const maskLookup = useMemo(() => {
    const lookup: Record<string, string[]> = {};

    effectiveLayers.forEach((layer) => {
      if (layer.type === 'mask' && layer.visible && layer.file && layer.targets) {
        for (const targetId of layer.targets) {
          if (!lookup[targetId]) {
            lookup[targetId] = [];
          }
          lookup[targetId].push(`/data/animap/${slug}/${layer.file}`);
        }
      }
    });

    return lookup;
  }, [effectiveLayers, slug]);

  const renderableLayers = useMemo(
    () => effectiveLayers.filter((layer) => layer.visible && layer.type !== 'mask' && (layer.type === 'text' || !!layer.file)),
    [effectiveLayers]
  );

  const gameplayTimeTextLayer = useMemo(() => {
    if (runtimeBehavior !== 'gameplay-time') {
      return null;
    }

    return effectiveLayers.find((layer) => layer.type === 'text') ?? null;
  }, [effectiveLayers, runtimeBehavior]);

  const gameplayTimeColonWidth = useMemo(() => {
    if (!gameplayTimeTextLayer) {
      return 0;
    }

    if (typeof document === 'undefined') {
      return Math.max(1, (gameplayTimeTextLayer.font_size ?? 96) * 0.35);
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return Math.max(1, (gameplayTimeTextLayer.font_size ?? 96) * 0.35);
    }

    const fontSize = gameplayTimeTextLayer.font_size ?? 96;
    ctx.font = `${fontSize}px Volkhov`;
    return Math.max(1, ctx.measureText(':').width);
  }, [gameplayTimeTextLayer]);

  const contentBounds = useMemo<LayerBounds | null>(() => {
    let bounds: LayerBounds | null = null;

    renderableLayers.forEach((layer) => {
      let baseWidth = 0;
      let baseHeight = 0;

      if (layer.type === 'text') {
        baseWidth = layer.width ?? 480;
        baseHeight = layer.height ?? 160;
      } else if (layer.width && layer.height) {
        baseWidth = layer.width;
        baseHeight = layer.height;
      } else {
        const mediaSize = mediaSizes[layer.id];
        if (!mediaSize || mediaSize.width <= 0 || mediaSize.height <= 0) {
          return;
        }
        baseWidth = mediaSize.width;
        baseHeight = mediaSize.height;
      }

      const scale = layer.scale ?? 1;
      const rect: LayerBounds = {
        x: layer.x ?? 0,
        y: layer.y ?? 0,
        width: baseWidth * scale,
        height: baseHeight * scale,
      };

      if (!bounds) {
        bounds = rect;
        return;
      }

      const minX = Math.min(bounds.x, rect.x);
      const minY = Math.min(bounds.y, rect.y);
      const maxX = Math.max(bounds.x + bounds.width, rect.x + rect.width);
      const maxY = Math.max(bounds.y + bounds.height, rect.y + rect.height);

      bounds = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    });

    return bounds;
  }, [mediaSizes, renderableLayers]);

  const stageStyle = useMemo<CSSProperties>(() => {
    if (!config) {
      return {};
    }

    const { width, height } = containerSize;
    if (width <= 0 || height <= 0 || config.width <= 0 || config.height <= 0) {
      return {
        width: config.width,
        height: config.height,
      };
    }

    let scaleX = 1;
    let scaleY = 1;
    let x = 0;
    let y = 0;

    const bounds = contentBounds;
    const hasContentBounds = !!bounds && bounds.width > 0 && bounds.height > 0;

    switch (fill) {
      case 'stretch':
        if (hasContentBounds && bounds) {
          scaleX = width / bounds.width;
          scaleY = height / bounds.height;
          x = -bounds.x * scaleX;
          y = -bounds.y * scaleY;
          break;
        }
        // Match Godot: if contain/stretch has no measurable content, fall back to cover behavior.
        break;
      case 'contain':
        if (hasContentBounds && bounds) {
          const scale = Math.min(width / bounds.width, height / bounds.height);
          const scaledWidth = bounds.width * scale;
          const scaledHeight = bounds.height * scale;
          const offsetX = (width - scaledWidth) * 0.5;
          const offsetY = (height - scaledHeight) * 0.5;
          scaleX = scale;
          scaleY = scale;
          x = offsetX - bounds.x * scale;
          y = offsetY - bounds.y * scale;
          break;
        }
        // Match Godot: if contain/stretch has no measurable content, fall back to cover behavior.
        break;
      case 'none':
        break;
      case 'cover':
      default: {
        const scale = height / config.height;
        const excessX = config.width * scale - width;
        scaleX = scale;
        scaleY = scale;
        x = -panX * excessX;
        y = (height - config.height * scale) * 0.5;
        break;
      }
    }
    return {
      position: 'absolute',
      left: x,
      top: y,
      width: config.width,
      height: config.height,
      transform: `scale(${scaleX}, ${scaleY})`,
      transformOrigin: 'top left',
    };
  }, [config, containerSize, contentBounds, fill, panX]);

  const setLayerMediaSize = (layerId: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) {
      return;
    }

    setMediaSizes((prev) => {
      const existing = prev[layerId];
      if (existing && existing.width === width && existing.height === height) {
        return prev;
      }
      return {
        ...prev,
        [layerId]: { width, height },
      };
    });
  };

  const renderLayer = (layer: AnimapLayer) => {
    if (!layer.visible) {
      return null;
    }

    if (runtimeBehavior === 'gameplay-time' && gameplayTimeTextLayer?.id === layer.id) {
      return null;
    }

    const cssFilter = buildCssFilter(layer);
    const maskUrls = maskLookup[layer.id];
    const maskStyle: CSSProperties = maskUrls?.length
      ? {
          WebkitMaskImage: maskUrls.map((url) => `url(${url})`).join(', '),
          maskImage: maskUrls.map((url) => `url(${url})`).join(', '),
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }
      : {};

    const baseStyle: CSSProperties = {
      position: 'absolute',
      left: layer.x ?? 0,
      top: layer.y ?? 0,
      transform: `scale(${layer.scale ?? 1})`,
      transformOrigin: 'top left',
      opacity: layer.opacity ?? 1,
      filter: cssFilter,
      pointerEvents: 'none',
      maxWidth: 'none',
      maxHeight: 'none',
      ...maskStyle,
    };

    if (layer.type === 'image' && layer.file) {
      const imgStyle: CSSProperties = { ...baseStyle, display: 'block' };
      if (layer.width) imgStyle.width = layer.width;
      if (layer.height) imgStyle.height = layer.height;
      return (
        <img
          key={layer.id}
          src={`/data/animap/${slug}/${layer.file}`}
          alt={layer.name}
          draggable={false}
          onLoad={(event) => {
            setLayerMediaSize(layer.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
          }}
          style={imgStyle}
        />
      );
    }

    if (layer.type === 'video' && layer.file) {
      return (
        <video
          key={layer.id}
          src={`/api/animap-preview/${slug}/${layer.file}`}
          muted
          autoPlay
          loop={layer.loop !== false}
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            console.log("AnimapPreview video loaded metadata", layer.id, event.currentTarget.videoWidth, event.currentTarget.videoHeight);
            setLayerMediaSize(layer.id, event.currentTarget.videoWidth, event.currentTarget.videoHeight);
          }}
          style={{ ...baseStyle, display: 'block' }}
        />
      );
    }

    if (layer.type === 'text') {
      return (
        <div
          key={layer.id}
          style={{
            ...baseStyle,
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
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {layer.text || layer.name}
        </div>
      );
    }

    return null;
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {config ? (
        <div style={stageStyle}>
          {effectiveLayers.map(renderLayer)}
          {gameplayTimeTextLayer && (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: (gameplayTimeTextLayer.x ?? 0) + (gameplayTimeTextLayer.width ?? 480) / 2 - gameplayTimeColonWidth / 2 - (gameplayTimeTextLayer.width ?? 480) * 0.05,
                  top: (gameplayTimeTextLayer.y ?? 0) - (gameplayTimeTextLayer.height ?? 160) * 0.06,
                  width: gameplayTimeColonWidth,
                  height: gameplayTimeTextLayer.height ?? 160,
                  transform: `scale(${gameplayTimeTextLayer.scale ?? 1})`,
                  transformOrigin: 'top left',
                  color: gameplayTimeTextLayer.color ?? '#ffffff',
                  fontSize: `${gameplayTimeTextLayer.font_size ?? 96}px`,
                  fontFamily: 'Volkhov, serif',
                  fontWeight: 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'pre',
                  pointerEvents: 'none',
                }}
              >
                :
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: (gameplayTimeTextLayer.x ?? 0) - (gameplayTimeTextLayer.width ?? 480) * 0.02,
                  top: gameplayTimeTextLayer.y ?? 0,
                  width: (gameplayTimeTextLayer.width ?? 480) / 2 - gameplayTimeColonWidth / 2,
                  height: gameplayTimeTextLayer.height ?? 160,
                  transform: `scale(${gameplayTimeTextLayer.scale ?? 1})`,
                  transformOrigin: 'top left',
                  color: gameplayTimeTextLayer.color ?? '#ffffff',
                  fontSize: `${gameplayTimeTextLayer.font_size ?? 96}px`,
                  fontFamily: 'Volkhov, serif',
                  fontWeight: 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  whiteSpace: 'pre',
                  pointerEvents: 'none',
                }}
              >
                00
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: (gameplayTimeTextLayer.x ?? 0) + (gameplayTimeTextLayer.width ?? 480) / 2 + gameplayTimeColonWidth / 2 - (gameplayTimeTextLayer.width ?? 480) * 0.03,
                  top: gameplayTimeTextLayer.y ?? 0,
                  width: (gameplayTimeTextLayer.width ?? 480) / 2 - gameplayTimeColonWidth / 2,
                  height: gameplayTimeTextLayer.height ?? 160,
                  transform: `scale(${gameplayTimeTextLayer.scale ?? 1})`,
                  transformOrigin: 'top left',
                  color: gameplayTimeTextLayer.color ?? '#ffffff',
                  fontSize: `${gameplayTimeTextLayer.font_size ?? 96}px`,
                  fontFamily: 'Volkhov, serif',
                  fontWeight: 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  whiteSpace: 'pre',
                  pointerEvents: 'none',
                }}
              >
                00
              </div>
            </>
          )}
          {renderableLayers.length === 0 && (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              {fallbackLabel || slug}
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          {fallbackLabel || slug}
        </div>
      )}
    </div>
  );
}
