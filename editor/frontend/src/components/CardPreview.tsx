import { useEffect, useRef, useState } from 'react';
import type { CardConfig, VisibleLayers } from '@/types';
import { Badge } from '@/components/ui/badge';

const frameImage = '/assets/ui/hero-frame.webp';
const actionFrameImage = '/assets/ui/action-frame.webp';
const barBg = '/assets/ui/bar/bar-bg.webp';
const barFg = '/assets/ui/bar/bar-fg.webp';
const barFrame = '/assets/ui/bar/bar-frame.webp';

function isHeroConfig(config: CardConfig): config is CardConfig & {
  hp_bar_pos: { x: number; y: number };
  hp_bar_scale: number;
  hp_bar_current: number;
  hp_bar_max: number;
  hp_bar_hue: number;
  hp_bar_font_size?: number;
  pose?: object;
  audio?: Record<string, string>;
} {
  return 'hp_bar_pos' in config;
}

function getActionCost(config: CardConfig | null, isAction: boolean) {
  if (!config || !isAction || !('cost' in config)) return null;
  return typeof config.cost === 'number' ? config.cost : 0;
}

interface CardPreviewProps {
  slug: string;
  type?: 'hero' | 'action';
  transparent?: boolean;
  onAspectRatioLoaded?: (ratio: number) => void;
  showPoseBadge?: boolean;
  showSoundBadge?: boolean;
  showHoverName?: boolean;
}

export function CardPreview({ slug, type = 'hero', transparent, onAspectRatioLoaded, showPoseBadge, showSoundBadge, showHoverName }: CardPreviewProps) {
  const isAction = type === 'action';
  const [config, setConfig] = useState<CardConfig | null>(null);
  const [poseFileExists, setPoseFileExists] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseSize, setBaseSize] = useState({ width: 400, height: 600 });
  const actionCost = getActionCost(config, isAction);
  
  // Check for pose file existence if type is hero
  useEffect(() => {
    if (type !== 'hero' || !slug) return;
    
    // Reset state when slug changes
    setPoseFileExists(false);

    const img = new Image();
    img.src = `/data/hero/${slug}/img/pose-char-fg.webp`;
    img.onload = () => setPoseFileExists(true);
    img.onerror = () => setPoseFileExists(false);
  }, [slug, type]);
  
  // Notify parent of aspect ratio changes
  useEffect(() => {
    if (baseSize.width > 0 && baseSize.height > 0 && onAspectRatioLoaded) {
      onAspectRatioLoaded(baseSize.height / baseSize.width);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize.width, baseSize.height]);

  // Fetch config and preload frame
  useEffect(() => {
    let mounted = true;
    const apiEndpoint = type === 'action' ? `/api/action/${slug}` : `/api/card/${slug}`;
    const loadImageSize = (src: string) =>
      new Promise<{ width: number; height: number } | null>((resolve) => {
        if (!src) {
          resolve(null);
          return;
        }
        const img = new Image();
        img.src = src;
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
          return;
        }
        img.onload = () => resolve(
          img.naturalWidth > 0 && img.naturalHeight > 0
            ? { width: img.naturalWidth, height: img.naturalHeight }
            : null
        );
        img.onerror = () => resolve(null);
      });
    fetch(apiEndpoint)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch card');
        return res.json();
      })
      .then((data) => {
        if (mounted) {
          const defaultVisibleLayers: VisibleLayers = {
            'char-bg': true,
            'mask-bg': !isAction,
            card: true,
            'mask-fg': !isAction,
            'char-fg': !isAction,
            name: !isAction,
            'hp-bar': !isAction,
            'pose-char-fg': !isAction,
            'pose-frame': !isAction,
            'pose-mask-fg': !isAction,
            'pose-shadow': !isAction,
          };
          const normalized = {
            ...data,
            char_bg_scale: typeof data.char_bg_scale === 'number' && data.char_bg_scale > 0 ? data.char_bg_scale : 100,
            char_fg_scale: typeof data.char_fg_scale === 'number' && data.char_fg_scale > 0 ? data.char_fg_scale : 100,
            frame_image:
              typeof data.frame_image === 'string' && data.frame_image
                ? data.frame_image
                : (isAction ? actionFrameImage : frameImage),
            name_pos: data.name_pos || { x: 0, y: 0 },
            name_scale: typeof data.name_scale === 'number' && data.name_scale > 0 ? data.name_scale : 40,
            text_shadow_size: typeof data.text_shadow_size === 'number' && data.text_shadow_size >= 0 ? data.text_shadow_size : 3,
            tint: typeof data.tint === 'string' && data.tint ? data.tint : '#ffffff',
            hp_bar_pos: data.hp_bar_pos || { x: 0, y: (data.name_pos?.y || 0) + 60 },
            hp_bar_scale: typeof data.hp_bar_scale === 'number' && data.hp_bar_scale > 0 ? data.hp_bar_scale : 250,
            hp_bar_current: typeof data.hp_bar_current === 'number' ? data.hp_bar_current : (data.stats?.max_hp > 0 ? data.stats.max_hp : 100),
            hp_bar_max: typeof data.hp_bar_max === 'number' ? data.hp_bar_max : (data.stats?.max_hp > 0 ? data.stats.max_hp : 100),
            hp_bar_hue: typeof data.hp_bar_hue === 'number' ? data.hp_bar_hue : 0,
            hp_bar_font_size: typeof data.hp_bar_font_size === 'number' ? data.hp_bar_font_size : 31,
            visible_layers: {
              ...defaultVisibleLayers,
              ...(data.visible_layers && typeof data.visible_layers === 'object' ? data.visible_layers : {}),
            },
          };

          const sizeCandidates = isAction
            ? [`/api/action-char/${slug}/char-bg?size=${Date.now()}`, normalized.frame_image || '']
            : [normalized.frame_image || frameImage];

          return sizeCandidates.reduce<Promise<boolean>>(
            (chain, src) =>
              chain.then((loaded) => {
                if (loaded || !src) return loaded;
                return loadImageSize(src).then((size) => {
                  if (!size) return false;
                  setBaseSize(size);
                  return true;
                });
              }),
            Promise.resolve(false)
          ).then(() => {
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
  }, [isAction, slug, type]);

  // Render to canvas
  useEffect(() => {
    if (!config) return;

    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const activeFrameSrc = isAction ? (config.frame_image || actionFrameImage) : (config.frame_image || frameImage);
    const bgUrl = type === 'action' ? `/api/action-char/${slug}/char-bg` : `/api/card-char/${slug}/char-bg`;
    const fgUrl = type === 'action' ? `/api/action-char/${slug}/char-fg` : `/api/card-char/${slug}/char-fg`;
    
    // Add timestamp to bypass browser cache for static mask files
    const timestamp = Date.now();
    const maskBgUrl = type === 'action' ? `/data/action/${slug}/img/mask-bg.webp?t=${timestamp}` : `/data/hero/${slug}/img/mask-bg.webp?t=${timestamp}`;
    const maskFgUrl = type === 'action' ? `/data/action/${slug}/img/mask-fg.webp?t=${timestamp}` : `/data/hero/${slug}/img/mask-fg.webp?t=${timestamp}`;

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
      loadImg(maskFgUrl),
      loadImg(barBg),
      loadImg(barFg),
      loadImg(barFrame)
    ]).then((results) => {
      if (!mounted) return;
      const heroConfig = isHeroConfig(config) ? config : null;

      const [frameImg, defaultFrameImg, bgImg, fgImg, maskBgImg, maskFgImg, barBgImg, barFgImg, barFrameImg] = results;

      const activeFrame = isAction
        ? frameImg
        : (frameImg && frameImg.naturalWidth > 0 ? frameImg : defaultFrameImg);
      const sizeSource = isAction
        ? (activeFrame && activeFrame.naturalWidth > 0 ? activeFrame : bgImg)
        : activeFrame;
      const cardW = sizeSource?.naturalWidth && sizeSource.naturalWidth > 0 ? sizeSource.naturalWidth : baseSize.width;
      const cardH = sizeSource?.naturalHeight && sizeSource.naturalHeight > 0 ? sizeSource.naturalHeight : baseSize.height;
      const scratchCanvas = document.createElement('canvas');
      const visibleLayers = config.visible_layers;
      const cx = cardW / 2;
      const cy = cardH / 2;

      const drawLayer = (
        img: HTMLImageElement | null,
        mask: HTMLImageElement | null,
        configPos: { x: number; y: number; scale: number },
        preserveAspectRatio: boolean,
        offsetX: number,
        offsetY: number
      ) => {
        if (!img) return;
        const lw = cardW * (configPos.scale / 100);
        const lh = preserveAspectRatio
          ? lw / (img.naturalWidth / img.naturalHeight)
          : cardH * (configPos.scale / 100);

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

        ctx.drawImage(scratchCanvas, x + offsetX, y + offsetY, lw, lh);

        return { x, y, width: lw, height: lh };
      };

      if (sizeSource && sizeSource.naturalWidth > 0 && sizeSource.naturalHeight > 0) {
        setBaseSize({ width: sizeSource.naturalWidth, height: sizeSource.naturalHeight });
      }

      canvas.width = cardW;
      canvas.height = cardH;
      ctx.clearRect(0, 0, cardW, cardH);

      const offsetX = 0;
      const offsetY = 0;

      if (isAction) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, cardW, cardH);
        ctx.clip();
      }

      if (visibleLayers?.['char-bg']) {
        drawLayer(bgImg, maskBgImg, {
          x: config.char_bg_pos.x,
          y: config.char_bg_pos.y,
          scale: config.char_bg_scale
        }, isAction, offsetX, offsetY);
      }

      if (visibleLayers?.card && activeFrame) {
        const fx = cx - cardW / 2 + offsetX;
        const fy = cy - cardH / 2 + offsetY;
        
        ctx.save();
        if (config.tint) {
          ctx.shadowColor = config.tint;
          ctx.shadowBlur = 10;
        }
        ctx.drawImage(activeFrame, fx, fy, cardW, cardH);
        ctx.restore();

        if (config.tint) {
          const scratchCtx = scratchCanvas.getContext('2d');
          if (scratchCtx) {
            scratchCanvas.width = cardW;
            scratchCanvas.height = cardH;
            scratchCtx.clearRect(0, 0, cardW, cardH);
            scratchCtx.drawImage(activeFrame, 0, 0, cardW, cardH);
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

      if (visibleLayers?.['char-fg']) {
        drawLayer(fgImg, maskFgImg, {
          x: config.char_fg_pos.x,
          y: config.char_fg_pos.y,
          scale: config.char_fg_scale
        }, isAction, offsetX, offsetY);
      }

      if (visibleLayers?.name && config.full_name) {
        ctx.save();
        ctx.fillStyle = 'white';
        const fontSize = config.name_scale || 40;
        ctx.font = `${fontSize}px "Vollkorn", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textX = cx + (config.name_pos?.x || 0) + offsetX;
        const textY = cy + (config.name_pos?.y || 0) + offsetY;

        // Draw shadow around text manually (stroke-like effect)
        ctx.shadowColor = 'transparent'; // Disable standard shadow
        ctx.lineWidth = config.text_shadow_size ?? 3;
        ctx.strokeStyle = config.text_shadow_color || 'rgba(0, 0, 0, 0.5)';
        ctx.strokeText(config.full_name, textX, textY);
        
        ctx.fillText(config.full_name, textX, textY);
        ctx.restore();
      }

      if (visibleLayers?.['hp-bar'] && heroConfig?.hp_bar_pos && barBgImg && barFgImg && barFrameImg) {
        const barScale = (heroConfig.hp_bar_scale || 100) / 100;
        // The HP bar width is 33% of the card frame width (standard reference)
        const baseWidth = cardW * 0.33;
        const aspectRatio = barBgImg.naturalWidth / barBgImg.naturalHeight;
        
        const barW = baseWidth * barScale;
        const barH = barW / aspectRatio;
        
        const barX = cx + heroConfig.hp_bar_pos.x - barW / 2 + offsetX;
        const barY = cy + heroConfig.hp_bar_pos.y - barH / 2 + offsetY;
        
        // Draw Bar BG
        ctx.drawImage(barBgImg, barX, barY, barW, barH);
        
        // Draw Bar FG (Clipped & Hue Rotated)
        const current = heroConfig.hp_bar_current || 0;
        const max = heroConfig.hp_bar_max || 100;
        const percentage = Math.max(0, Math.min(100, (current / max) * 100));
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(barX, barY, barW * (percentage / 100), barH);
        ctx.clip();
        
        if (heroConfig.hp_bar_hue) {
           ctx.filter = `hue-rotate(${heroConfig.hp_bar_hue}deg)`;
        }
        ctx.drawImage(barFgImg, barX, barY, barW, barH);
        ctx.restore();
        
        // Draw Bar Frame
        ctx.drawImage(barFrameImg, barX, barY, barW, barH);
        
        // Draw Text
        ctx.save();
        ctx.fillStyle = 'white';
        // Match font size and family to Bar component
        // Using a relative size to card width to handle high-res exports better
        // Default size is 20px for editor at standard scale, convert to ratio
        const baseFontSize = heroConfig.hp_bar_font_size || 20;
        // 471 is typical card width. 20/471 ~= 0.0425
        const fontSizeRatio = baseFontSize / 471;
        const fontSize = Math.max(12, Math.round(cardW * fontSizeRatio));
        
        ctx.font = `${fontSize}px "Vollkorn", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;
        ctx.fillText(`${current} / ${max}`, barX + barW / 2, barY + barH / 2);
        ctx.restore();
      }

      if (isAction) {
        ctx.restore();
      }

    });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize.height, baseSize.width, config, isAction, slug, type]);

  return (
    <div
      ref={containerRef}
      className={`group relative h-full w-full overflow-hidden ${transparent ? 'bg-transparent' : 'bg-[#1b1e25]'} flex items-center justify-center`}
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
      {actionCost !== null && (
        <div
          className="pointer-events-none absolute left-[10px] top-3 z-20 rounded-md border border-black/40 bg-black/75 px-2 py-1 text-[19px] font-bold leading-none text-white shadow-lg"
          style={{ fontFamily: '"Vollkorn", serif' }}
        >
          {actionCost}
        </div>
      )}
      {showHoverName && config?.full_name && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 translate-y-2 rounded-md bg-black/80 px-3 py-2 text-center text-sm font-medium text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          {config.full_name}
        </div>
      )}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end pointer-events-none">
        {showPoseBadge && ((config && isHeroConfig(config) && config.pose) || poseFileExists) && (
          <Badge 
            className="bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md"
          >
            POSE
          </Badge>
        )}
        {showSoundBadge && config && isHeroConfig(config) && config.audio && Object.keys(config.audio).length > 0 && (
          <Badge 
            className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-md"
          >
            SOUND
          </Badge>
        )}
      </div>
    </div>
  );
}
