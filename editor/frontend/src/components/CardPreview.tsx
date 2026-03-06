import { useEffect, useRef, useState } from 'react';
import type { HeroConfig } from '@/types';
import frameImage from '../assets/ui/hero-frame.webp';

interface CardPreviewProps {
  slug: string;
  transparent?: boolean;
}

export function CardPreview({ slug, transparent }: CardPreviewProps) {
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
            name_pos: data.name_pos || { x: 0, y: 0 },
            name_scale: typeof data.name_scale === 'number' && data.name_scale > 0 ? data.name_scale : 40,
            tint: typeof data.tint === 'string' ? data.tint : '',
          };

          const frameSrc = frameImage;
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
    
    // Add timestamp to bypass browser cache for static mask files
    const timestamp = Date.now();
    const maskBgUrl = `/data/hero/${slug}/img/mask-bg.webp?t=${timestamp}`;
    const maskFgUrl = `/data/hero/${slug}/img/mask-fg.webp?t=${timestamp}`;

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
      loadImg(frameImage),
      loadImg(bgUrl),
      loadImg(fgUrl),
      loadImg(maskBgUrl),
      loadImg(maskFgUrl)
    ]).then((results) => {
      if (!mounted) return;

      const [frameImg, defaultFrameImg, bgImg, fgImg, maskBgImg, maskFgImg] = results;

      const activeFrame = frameImg && frameImg.naturalWidth > 0 ? frameImg : defaultFrameImg;
      const cardW = activeFrame?.naturalWidth && activeFrame.naturalWidth > 0 ? activeFrame.naturalWidth : baseSize.width;
      const cardH = activeFrame?.naturalHeight && activeFrame.naturalHeight > 0 ? activeFrame.naturalHeight : baseSize.height;

      if (activeFrame && activeFrame.naturalWidth > 0 && activeFrame.naturalHeight > 0) {
        setBaseSize({ width: activeFrame.naturalWidth, height: activeFrame.naturalHeight });
      }

      canvas.width = cardW;
      canvas.height = cardH;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      const scratchCanvas = document.createElement('canvas');

      const drawLayer = (img: HTMLImageElement | null, mask: HTMLImageElement | null, configPos: { x: number; y: number; scale: number }) => {
        if (!img) return;
        const lw = cardW * (configPos.scale / 100);
        const lh = cardH * (configPos.scale / 100);

        const x = cx + configPos.x - lw / 2;
        const y = cy + configPos.y - lh / 2;

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
        const fx = cx - cardW / 2;
        const fy = cy - cardH / 2;
        
        ctx.save();
        if (config.tint) {
          ctx.shadowColor = config.tint;
          ctx.shadowBlur = 10;
        }
        ctx.drawImage(frameImg, fx, fy, cardW, cardH);
        ctx.restore();

        if (config.tint) {
          const scratchCtx = scratchCanvas.getContext('2d');
          if (scratchCtx) {
            scratchCanvas.width = cardW;
            scratchCanvas.height = cardH;
            scratchCtx.clearRect(0, 0, cardW, cardH);
            scratchCtx.drawImage(frameImg, 0, 0, cardW, cardH);
            scratchCtx.globalCompositeOperation = 'source-in';
            scratchCtx.fillStyle = config.tint;
            scratchCtx.fillRect(0, 0, cardW, cardH);

            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(scratchCanvas, fx, fy, cardW, cardH);
            ctx.restore();
          }
        }
      }

      drawLayer(fgImg, maskFgImg, {
        x: config.char_fg_pos.x,
        y: config.char_fg_pos.y,
        scale: config.char_fg_scale
      });

      if (config.full_name) {
        ctx.save();
        ctx.fillStyle = 'white';
        const fontSize = config.name_scale || 40;
        ctx.font = `${fontSize}px "Vollkorn", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textX = cx + (config.name_pos?.x || 0);
        const textY = cy + (config.name_pos?.y || 0);

        // Draw shadow around text manually (stroke-like effect)
        ctx.shadowColor = 'transparent'; // Disable standard shadow
        ctx.lineWidth = 3;
        ctx.strokeStyle = config.text_shadow_color || 'rgba(0, 0, 0, 0.5)';
        ctx.strokeText(config.full_name, textX, textY);
        
        ctx.fillText(config.full_name, textX, textY);
        ctx.restore();
      }

    });

    return () => {
      mounted = false;
    };
  }, [config, slug]); // Removed baseSize from dependency array to prevent infinite loop

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${transparent ? 'bg-transparent' : 'bg-[#1b1e25]'} flex items-center justify-center`}
    >
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain'
        }}
      />
    </div>
  );
}
