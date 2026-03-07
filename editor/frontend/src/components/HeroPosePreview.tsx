import { useEffect, useRef, useState } from 'react';
import type { HeroConfig } from '@/types';

interface HeroPosePreviewProps {
  slug: string;
}

export function HeroPosePreview({ slug }: HeroPosePreviewProps) {
  const [config, setConfig] = useState<HeroConfig | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseSize, setBaseSize] = useState({ width: 320, height: 517 }); // Default enemy box size

  // Fetch config
  useEffect(() => {
    let mounted = true;
    fetch(`/api/card/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch card');
        return res.json();
      })
      .then((data) => {
        if (mounted) {
          setConfig(data);
        }
      })
      .catch(() => {
        // Handle error silently
      });
    return () => {
      mounted = false;
    };
  }, [slug]);

  // Update base size based on container
  useEffect(() => {
    if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
            setBaseSize({ width: clientWidth, height: clientHeight });
        }
    }
  }, []); // Run once on mount? Or observe resize? 
  // Rnd in GameLayoutEditor handles resizing, but the component inside might re-render.
  // Actually, we can use 100% width/height of the canvas and scale the content.

  // Render to canvas
  useEffect(() => {
    if (!config) return;
    
    // We need to know the container size to center/scale the pose relative to it.
    // However, the pose config (x, y) is relative to the "enemy2" box usually.
    // If we put it in ANY box, we should assume the box dimensions are the reference.
    
    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use container dimensions if available, otherwise default
    const w = containerRef.current?.clientWidth || baseSize.width;
    const h = containerRef.current?.clientHeight || baseSize.height;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load images
    // Add timestamp to bypass cache if needed, but here we assume static for preview
    const timestamp = Date.now(); // Maybe unnecessary for layout editor
    const poseFgUrl = `/api/card-char/${slug}/pose-char-fg`;
    const poseShadowUrl = `/api/card-char/${slug}/pose-shadow`;
    const maskFgUrl = `/data/hero/${slug}/img/pose-mask-fg.webp?t=${timestamp}`;

    const loadImg = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
    });

    Promise.all([
      loadImg(poseFgUrl),
      loadImg(poseShadowUrl),
      loadImg(maskFgUrl)
    ]).then((results) => {
      if (!mounted) return;
      const [fgImg, shadowImg, maskImg] = results;

      ctx.clearRect(0, 0, w, h);

      // Pose config defaults
      const charFgPos = config.pose?.char_fg_pos || { x: 0, y: 0 };
      const charFgScale = config.pose?.char_fg_scale || 100;
      const shadowPos = config.pose?.shadow_pos || { x: 0, y: 0 };
      const shadowScale = config.pose?.shadow_scale || 100;

      // Draw Shadow
      if (shadowImg) {
          const shadowW = w * (shadowScale / 100);
          const shadowH = h * (shadowScale / 100);
          const sx = (w / 2) + shadowPos.x - (shadowW / 2);
          const sy = (h / 2) + shadowPos.y - (shadowH / 2);
          
          ctx.drawImage(shadowImg, sx, sy, shadowW, shadowH);
      }

      // Draw FG with Mask
      if (fgImg) {
          const fgW = w * (charFgScale / 100);
          const fgH = h * (charFgScale / 100);
          const fx = (w / 2) + charFgPos.x - (fgW / 2);
          const fy = (h / 2) + charFgPos.y - (fgH / 2);

          // Use a scratch canvas for masking
          const scratchCanvas = document.createElement('canvas');
          scratchCanvas.width = w;
          scratchCanvas.height = h;
          const scratchCtx = scratchCanvas.getContext('2d');
          
          if (scratchCtx) {
              // Draw FG
              scratchCtx.drawImage(fgImg, fx, fy, fgW, fgH);
              
              // Apply Mask
              if (maskImg) {
                  scratchCtx.globalCompositeOperation = 'destination-out';
                  // Mask should be drawn at same position/scale as FG?
                  // In PoseCanvas, mask canvas is same size as container and positioned with FG?
                  // No, mask canvas in PoseCanvas is absolute positioned with FG.
                  // So mask image matches FG image dimensions?
                  // Usually mask image is 1:1 with the container or the layer?
                  // In HeroPoseTab, MaskedImage receives width={fgW} height={fgH}.
                  // And maskCanvasRef is drawn into it.
                  // The mask canvas (editing) is typically same size as FG layer.
                  // So we draw mask stretched to fgW/fgH.
                  
                  scratchCtx.drawImage(maskImg, fx, fy, fgW, fgH);
              }
              
              ctx.drawImage(scratchCanvas, 0, 0);
          }
      }
    });

    return () => {
      mounted = false;
    };
  }, [config, slug, baseSize]); // Re-render if size changes

  // Observer for resize?
  useEffect(() => {
      if (!containerRef.current) return;
      const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
              setBaseSize({ width: entry.contentRect.width, height: entry.contentRect.height });
          }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full object-contain" />
    </div>
  );
}
