import { useEffect, useRef, useState } from 'react';
import type { HeroConfig } from '@/types';
import frameImage from '../assets/frame.webp';

interface CardPreviewProps {
  slug: string;
}

export function CardPreview({ slug }: CardPreviewProps) {
  const [config, setConfig] = useState<HeroConfig | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseSize, setBaseSize] = useState({ width: 400, height: 600 });

  // Fetch config and preload frame
  useEffect(() => {
    let mounted = true;
    fetch(`/api/card/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch card');
        return res.json();
      })
      .then((data) => {
        if (mounted) {
          const normalized = {
            ...data,
            char_bg_scale: typeof data.char_bg_scale === 'number' && data.char_bg_scale > 0 ? data.char_bg_scale : 100,
            char_fg_scale: typeof data.char_fg_scale === 'number' && data.char_fg_scale > 0 ? data.char_fg_scale : 100,
            frame_image: typeof data.frame_image === 'string' ? data.frame_image : '',
          };

          const frameSrc = normalized.frame_image || frameImage;
          const img = new Image();
          img.src = frameSrc;

          return new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
              setBaseSize({ width: img.naturalWidth, height: img.naturalHeight });
              resolve();
              return;
            }
            img.onload = () => {
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setBaseSize({ width: img.naturalWidth, height: img.naturalHeight });
              }
              resolve();
            };
            img.onerror = () => {
              resolve();
            };
          }).then(() => {
            if (mounted) {
              setConfig(normalized);
            }
          });
        }
      })
      .catch(() => {
        // Handle error silently
      });
    return () => {
      mounted = false;
    };
  }, [slug]);

  // Render to canvas
  useEffect(() => {
    if (!config) return;

    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const activeFrameSrc = config.frame_image || frameImage;
    const bgUrl = `/api/card-char/${slug}/char-bg`;
    const fgUrl = `/api/card-char/${slug}/char-fg`;
    const maskBgUrl = `/cards/hero/${slug}/img/mask-bg.webp`;
    const maskFgUrl = `/cards/hero/${slug}/img/mask-fg.webp`;

    const loadImg = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;
      img.onload = () => {
        resolve(img);
      };
      img.onerror = () => {
        resolve(null);
      };
    });

    Promise.all([
      loadImg(activeFrameSrc),
      loadImg(bgUrl),
      loadImg(fgUrl),
      loadImg(maskBgUrl),
      loadImg(maskFgUrl)
    ]).then((results) => {
      if (!mounted) return;

      const [frameImg, bgImg, fgImg, maskBgImg, maskFgImg] = results;

      if (frameImg && frameImg.naturalWidth > 0 && frameImg.naturalHeight > 0) {
        setBaseSize({ width: frameImg.naturalWidth, height: frameImg.naturalHeight });
        canvas.width = frameImg.naturalWidth;
        canvas.height = frameImg.naturalHeight;
      } else {
        canvas.width = baseSize.width;
        canvas.height = baseSize.height;
      }

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      const scratchCanvas = document.createElement('canvas');

      const drawLayer = (img: HTMLImageElement | null, mask: HTMLImageElement | null, configPos: { x: number; y: number; scale: number }) => {
        if (!img) return;
        const lw = w * (configPos.scale / 100);
        const lh = h * (configPos.scale / 100);

        const x = w / 2 + configPos.x - lw / 2;
        const y = h / 2 + configPos.y - lh / 2;

        const scratchW = Math.max(1, Math.round(lw));
        const scratchH = Math.max(1, Math.round(lh));
        scratchCanvas.width = scratchW;
        scratchCanvas.height = scratchH;
        const scratchCtx = scratchCanvas.getContext('2d');
        if (!scratchCtx) return;

        scratchCtx.clearRect(0, 0, scratchW, scratchH);
        scratchCtx.globalCompositeOperation = 'source-over';
        scratchCtx.drawImage(img, 0, 0, scratchW, scratchH);

        if (mask) {
          scratchCtx.globalCompositeOperation = 'destination-out';
          scratchCtx.drawImage(mask, 0, 0, scratchW, scratchH);
          scratchCtx.globalCompositeOperation = 'source-over';
        }

        ctx.drawImage(scratchCanvas, x, y, lw, lh);
      };

      drawLayer(bgImg, maskBgImg, {
        x: config.char_bg_pos.x,
        y: config.char_bg_pos.y,
        scale: config.char_bg_scale
      });

      if (frameImg) {
        ctx.drawImage(frameImg, 0, 0, w, h);
      }

      drawLayer(fgImg, maskFgImg, {
        x: config.char_fg_pos.x,
        y: config.char_fg_pos.y,
        scale: config.char_fg_scale
      });

    });

    return () => {
      mounted = false;
    };
  }, [config, slug]); // Removed baseSize from dependency array to prevent infinite loop

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#1b1e25] flex items-center justify-center"
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      />
    </div>
  );
}
