import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

export interface AnimapPlayerProps {
  slug: string;
  stateId?: string;
  panX?: number;
}

export function AnimapPlayer({ slug, stateId = 'default', panX = 0.5 }: AnimapPlayerProps) {
  const [config, setConfig] = useState<any>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    fetch(`/data/animap/${slug}/animap.json`)
      .then(res => res.json())
      .then(setConfig)
      .catch(console.error);
  }, [slug]);

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const effectiveLayers = useMemo(() => {
    if (!config) return [];
    const state = config.states?.find((s: any) => s.id === stateId) || config.states?.[0];
    return config.layers.map((layer: any) => {
      const override = state?.layer_overrides?.[layer.id];
      return override ? { ...layer, ...override } : layer;
    });
  }, [config, stateId]);

  const maskLookup = useMemo(() => {
    const lookup: Record<string, string[]> = {};
    effectiveLayers.forEach((layer: any) => {
      if (layer.type === 'mask' && layer.visible && layer.file && layer.targets) {
        for (const targetId of layer.targets) {
          if (!lookup[targetId]) lookup[targetId] = [];
          lookup[targetId].push(`/data/animap/${slug}/${layer.file}`);
        }
      }
    });
    return lookup;
  }, [effectiveLayers, slug]);

  if (!config) return null;

  const scaleFactor = size.height / config.height;
  const excessX = config.width * scaleFactor - size.width;
  const offsetX = -panX * excessX;
  const offsetY = (size.height - config.height * scaleFactor) * 0.5;

  const renderableLayers = effectiveLayers.filter((layer: any) => layer.visible && layer.type !== 'mask' && (layer.type === 'text' || !!layer.file));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        width: config.width,
        height: config.height,
        transformOrigin: 'top left',
        transform: `translate(${offsetX}px, ${offsetY}px) scale(${scaleFactor})`,
      }}>
        {renderableLayers.map((layer: any) => {
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

          const style: CSSProperties = {
            position: 'absolute',
            left: layer.x ?? 0,
            top: layer.y ?? 0,
            ...(layer.width ? { width: layer.width } : {}),
            ...(layer.height ? { height: layer.height } : {}),
            maxWidth: 'none',
            maxHeight: 'none',
            transform: `scale(${layer.scale ?? 1})`,
            transformOrigin: 'top left',
            opacity: layer.opacity ?? 1,
            pointerEvents: 'none',
            objectFit: 'cover',
            ...maskStyle,
          };

          if (layer.type === 'image') {
            return <img key={layer.id} src={`/data/animap/${slug}/${layer.file}`} style={style} alt="" />;
          }

          if (layer.type === 'video') {
            return (
              <video
                key={layer.id}
                src={`/data/animap/${slug}/${layer.file}`}
                muted autoPlay loop={layer.loop !== false} playsInline
                style={style}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
