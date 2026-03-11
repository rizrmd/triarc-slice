import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { HeroConfig, LayerId, VisibleLayers, CharLayer, MaskLayer, TextLayer, BarLayer } from '@/types';
import { Bar } from '../Bar';

interface MaskedImageProps {
  src: string;
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
  onPointerDown?: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onClick?: () => void;
}

function MaskedImage({
  src,
  maskCanvasRef,
  width,
  height,
  className,
  style,
  onPointerDown,
  onClick,
}: MaskedImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(new Image());

  useEffect(() => {
    const img = imageRef.current;
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = width;
      canvasRef.current.height = height;
    }
  }, [width, height]);

  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      const img = imageRef.current;

      if (canvas && width > 0 && height > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.clearRect(0, 0, width, height);
          
          if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, 0, 0, width, height);
          }

          if (maskCanvas) {
            ctx.globalCompositeOperation = 'destination-out';
            // Draw the mask canvas scaled to fit the display canvas
            ctx.drawImage(maskCanvas, 0, 0, width, height);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [width, height, maskCanvasRef]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      onPointerDown={onPointerDown}
      onClick={onClick}
    />
  );
}

interface CardCanvasProps {
  activeLayer: LayerId;
  setActiveLayer: (layer: LayerId) => void;
  config: HeroConfig;
  visibleLayers: VisibleLayers;
  canvasZoom: number;
  canvasPan: { x: number; y: number };
  canvasPanning: boolean;
  spacePressed: boolean;
  cardBaseSize: { width: number; height: number };
  cardFrameRef: RefObject<HTMLDivElement | null>;
  maskBgCanvasRef: RefObject<HTMLCanvasElement | null>;
  maskFgCanvasRef: RefObject<HTMLCanvasElement | null>;
  activeFrameSrc: string;
  bgUrl: string;
  fgUrl: string;
  
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasWheel: (event: WheelEvent) => void;
  onLayerPointerDown: (layer: CharLayer | TextLayer | BarLayer, event: ReactPointerEvent<HTMLElement>) => void;
  onMaskPointerDown: (layer: MaskLayer, event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onResizePointerDown: (
    layer: CharLayer | BarLayer,
    corner: 'nw' | 'ne' | 'sw' | 'se',
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void;
  brushSize: number;
  containerRef?: RefObject<HTMLDivElement | null>;
  layerAspectRatios?: Record<string, number>;
  isAction?: boolean;
}

export function CardCanvas({
  activeLayer,
  setActiveLayer,
  config,
  visibleLayers,
  canvasZoom,
  canvasPan,
  canvasPanning,
  cardBaseSize,
  cardFrameRef,
  maskBgCanvasRef,
  maskFgCanvasRef,
  activeFrameSrc,
  bgUrl,
  fgUrl,
  onCanvasPointerDown,
  onCanvasWheel,
  onLayerPointerDown,
  onMaskPointerDown,
  onResizePointerDown,
  brushSize,
  spacePressed,
  containerRef,
  layerAspectRatios = {},
  isAction = false,
}: CardCanvasProps) {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardWidth = cardBaseSize.width;
  const cardHeight = cardBaseSize.height;
  
  // For actions, preserve original image aspect ratio
  const bgAspectRatio = layerAspectRatios['char-bg'];
  const fgAspectRatio = layerAspectRatios['char-fg'];
  
  const bgWidth = cardWidth * (config.char_bg_scale / 100);
  const bgHeight = (isAction && bgAspectRatio) 
    ? bgWidth / bgAspectRatio 
    : cardHeight * (config.char_bg_scale / 100);
    
  const fgWidth = cardWidth * (config.char_fg_scale / 100);
  const fgHeight = (isAction && fgAspectRatio)
    ? fgWidth / fgAspectRatio
    : cardHeight * (config.char_fg_scale / 100);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeLayer !== 'mask-bg' && activeLayer !== 'mask-fg') {
      if (cursorPos) setCursorPos(null);
      return;
    }
    const frame = cardFrameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const x = (event.clientX - rect.left) / (canvasZoom / 100);
    const y = (event.clientY - rect.top) / (canvasZoom / 100);
    setCursorPos({ x, y });
  };

  const handlePointerLeave = () => {
    setCursorPos(null);
  };

  const activeScale =
    activeLayer === 'mask-bg'
      ? config.char_bg_scale
      : activeLayer === 'mask-fg'
      ? config.char_fg_scale
      : 100;
  const visualBrushSize = brushSize * (activeScale / 100);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => onCanvasWheel(event);
    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [onCanvasWheel]);

  return (
    <Card className="bg-[#14161b] border-0 h-full flex flex-1 flex-col rounded-none">
      <CardContent className="flex flex-1 items-center justify-center p-6">
        <div
          ref={(node) => {
            rootRef.current = node;
            if (containerRef) {
              containerRef.current = node;
            }
          }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          className={`relative h-full w-full overflow-hidden select-none ${
            canvasPanning
              ? 'cursor-grabbing'
              : (activeLayer === 'mask-bg' || activeLayer === 'mask-fg') && !spacePressed
              ? 'cursor-default'
              : 'cursor-grab'
          }`}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(calc(-50% + ${canvasPan.x}px), calc(-50% + ${canvasPan.y}px)) scale(${
                canvasZoom / 100
              })`,
              transformOrigin: 'center',
            }}
          >
            <div className={`relative ${isAction ? 'overflow-visible' : 'overflow-hidden'}`}>
              <div
                ref={cardFrameRef}
                className="relative bg-background shadow-2xl"
                style={{ width: `${cardBaseSize.width}px`, height: `${cardBaseSize.height}px` }}
              >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, rgba(255,255,255,0.035) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.035) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.035) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.035) 75%)',
                  backgroundSize: '24px 24px',
                  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
                  backgroundColor: '#1b1e25',
                }}
              />
              <div className={`absolute inset-0 ${isAction ? '' : 'overflow-hidden'}`}>
                {visibleLayers['char-bg'] && (
                  <MaskedImage
                    src={bgUrl}
                    maskCanvasRef={maskBgCanvasRef}
                    width={bgWidth}
                    height={bgHeight}
                    className={`absolute max-w-none ${
                      activeLayer === 'char-bg' ? 'cursor-move' : 'cursor-default'
                    } ${activeLayer === 'mask-bg' || spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                    onPointerDown={(event) => onLayerPointerDown('char-bg', event)}
                    onClick={() => {
                      if (activeLayer === 'canvas') return;
                      setActiveLayer('char-bg');
                    }}
                    style={{
                      left: '50%',
                      top: '50%',
                      transform: `translate(calc(-50% + ${config.char_bg_pos.x}px), calc(-50% + ${config.char_bg_pos.y}px))`,
                    }}
                  />
                )}
                {visibleLayers['mask-bg'] && (
                  <canvas
                    ref={maskBgCanvasRef}
                    className={`absolute max-w-none opacity-0 ${
                      activeLayer === 'mask-bg' && !spacePressed ? 'cursor-crosshair' : 'pointer-events-none'
                    }`}
                    onPointerDown={(event) => onMaskPointerDown('mask-bg', event)}
                    onClick={() => {
                      if (activeLayer === 'canvas') return;
                      setActiveLayer('mask-bg');
                    }}
                    style={{
                      left: '50%',
                      top: '50%',
                      width: `${bgWidth}px`,
                      height: `${bgHeight}px`,
                      transform: `translate(calc(-50% + ${config.char_bg_pos.x}px), calc(-50% + ${config.char_bg_pos.y}px))`,
                      zIndex: 1,
                      touchAction: 'none',
                    }}
                  />
                )}
                {visibleLayers.card && (
                  <div className="absolute inset-0 z-10 pointer-events-none isolate">
                    <img
                      src={activeFrameSrc}
                      alt="Frame"
                      className="h-full w-full object-contain"
                      style={{
                        filter: config.tint ? `drop-shadow(0 0 10px ${config.tint})` : undefined,
                      }}
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundColor: config.tint,
                        mixBlendMode: 'multiply',
                        WebkitMaskImage: `url(${activeFrameSrc})`,
                        maskImage: `url(${activeFrameSrc})`,
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                      }}
                    />
                  </div>
                )}
                {visibleLayers['char-fg'] && (
                  <MaskedImage
                    src={fgUrl}
                    maskCanvasRef={maskFgCanvasRef}
                    width={fgWidth}
                    height={fgHeight}
                    className={`absolute z-20 max-w-none ${
                      activeLayer === 'char-fg' ? 'cursor-move' : 'cursor-default'
                    } ${
                      activeLayer === 'mask-fg'
                        ? 'pointer-events-none opacity-50'
                        : activeLayer === 'mask-bg' || spacePressed || canvasPanning
                        ? 'pointer-events-none'
                        : ''
                    }`}
                    onPointerDown={(event) => onLayerPointerDown('char-fg', event)}
                    onClick={() => {
                      if (activeLayer === 'canvas') return;
                      setActiveLayer('char-fg');
                    }}
                    style={{
                      left: '50%',
                      top: '50%',
                      transform: `translate(calc(-50% + ${config.char_fg_pos.x}px), calc(-50% + ${config.char_fg_pos.y}px))`,
                    }}
                  />
                )}
                {visibleLayers['mask-fg'] && (
                  <canvas
                    ref={maskFgCanvasRef}
                    className={`absolute max-w-none opacity-0 ${
                      activeLayer === 'mask-fg' && !spacePressed
                        ? 'z-[21] cursor-crosshair'
                        : 'z-[21] pointer-events-none'
                    }`}
                    onPointerDown={(event) => onMaskPointerDown('mask-fg', event)}

                    onClick={() => {
                      if (activeLayer === 'canvas') return;
                      setActiveLayer('mask-fg');
                    }}
                    style={{
                      left: '50%',
                      top: '50%',
                      width: `${fgWidth}px`,
                      height: `${fgHeight}px`,
                      transform: `translate(calc(-50% + ${config.char_fg_pos.x}px), calc(-50% + ${config.char_fg_pos.y}px))`,
                      touchAction: 'none',
                    }}
                  />
                )}
                {visibleLayers.name && (
                  <div
                    className={`absolute z-[25] whitespace-nowrap text-white ${
                      activeLayer === 'name' ? 'cursor-move select-none' : 'cursor-default select-none'
                    } ${
                      activeLayer === 'mask-fg' || activeLayer === 'mask-bg' || spacePressed || canvasPanning
                        ? 'pointer-events-none'
                        : ''
                    }`}
                    style={{
                      left: '50%',
                      top: '50%',
                      transform: `translate(calc(-50% + ${config.name_pos?.x ?? 0}px), calc(-50% + ${config.name_pos?.y ?? 0}px))`,
                      fontSize: `${config.name_scale ?? 40}px`,
                      fontFamily: '"Vollkorn", serif',
                      lineHeight: 1,
                      textShadow: `
                        -1px -1px 0 ${config.text_shadow_color || 'rgba(0, 0, 0, 0.5)'},
                        1px -1px 0 ${config.text_shadow_color || 'rgba(0, 0, 0, 0.5)'},
                        -1px 1px 0 ${config.text_shadow_color || 'rgba(0, 0, 0, 0.5)'},
                        1px 1px 0 ${config.text_shadow_color || 'rgba(0, 0, 0, 0.5)'}
                      `,
                    }}
                    onPointerDown={(event) => onLayerPointerDown('name', event)}
                    onClick={() => {
                      if (activeLayer === 'canvas') return;
                      setActiveLayer('name');
                    }}
                  >
                    {config.full_name}
                  </div>
                )}
                {visibleLayers['hp-bar'] && (
                  <div
                    className={`absolute z-[28] ${
                      activeLayer === 'hp-bar' ? 'cursor-move' : 'cursor-default'
                    } ${
                      activeLayer === 'mask-fg' || activeLayer === 'mask-bg' || spacePressed || canvasPanning
                        ? 'pointer-events-none'
                        : ''
                    }`}
                    style={{
                      left: '50%',
                      top: '50%',
                      // Transform position only, size is handled by width/height directly
                      transform: `translate(calc(-50% + ${config.hp_bar_pos?.x ?? 0}px), calc(-50% + ${config.hp_bar_pos?.y ?? 0}px))`,
                      width: `${(config.hp_bar_scale / 100) * 33}%`, // Scale relative to card width (reference: 33% of card width at scale 100)
                      height: 'auto', 
                    }}
                    onPointerDown={(event) => onLayerPointerDown('hp-bar', event)}
                    onClick={() => {
                      if (activeLayer === 'canvas') return;
                      setActiveLayer('hp-bar');
                    }}
                  >
                    <Bar
                      current={config.hp_bar_current}
                      max={config.hp_bar_max}
                      hue={config.hp_bar_hue}
                      fontSize={config.hp_bar_font_size}
                      className="h-auto w-full"
                    />
                  </div>
                )}
              </div>
              {visibleLayers['char-bg'] && activeLayer === 'char-bg' && (
                <>
                  <div
                    className="absolute z-30 pointer-events-none border border-cyan-300/90"
                    style={{
                      left: '50%',
                      top: '50%',
                      width: `${bgWidth}px`,
                      height: `${bgHeight}px`,
                      transform: `translate(calc(-50% + ${config.char_bg_pos.x}px), calc(-50% + ${config.char_bg_pos.y}px))`,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Resize char-bg nw"
                    onPointerDown={(event) => onResizePointerDown('char-bg', 'nw', event)}
                    className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full bg-cyan-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                    style={{
                      left: `calc(50% + ${config.char_bg_pos.x - bgWidth / 2}px)`,
                      top: `calc(50% + ${config.char_bg_pos.y - bgHeight / 2}px)`,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Resize char-bg ne"
                    onPointerDown={(event) => onResizePointerDown('char-bg', 'ne', event)}
                    className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-full bg-cyan-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                    style={{
                      left: `calc(50% + ${config.char_bg_pos.x + bgWidth / 2}px)`,
                      top: `calc(50% + ${config.char_bg_pos.y - bgHeight / 2}px)`,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Resize char-bg sw"
                    onPointerDown={(event) => onResizePointerDown('char-bg', 'sw', event)}
                    className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-full bg-cyan-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                    style={{
                      left: `calc(50% + ${config.char_bg_pos.x - bgWidth / 2}px)`,
                      top: `calc(50% + ${config.char_bg_pos.y + bgHeight / 2}px)`,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Resize char-bg se"
                    onPointerDown={(event) => onResizePointerDown('char-bg', 'se', event)}
                    className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full bg-cyan-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                    style={{
                      left: `calc(50% + ${config.char_bg_pos.x + bgWidth / 2}px)`,
                      top: `calc(50% + ${config.char_bg_pos.y + bgHeight / 2}px)`,
                    }}
                  />
                </>
              )}
              {visibleLayers['char-fg'] && activeLayer === 'char-fg' && (
                <>
                  <div
                    className="absolute z-30 pointer-events-none border border-emerald-300/90"
                    style={{
                      left: '50%',
                      top: '50%',
                      width: `${fgWidth}px`,
                      height: `${fgHeight}px`,
                      transform: `translate(calc(-50% + ${config.char_fg_pos.x}px), calc(-50% + ${config.char_fg_pos.y}px))`,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Resize char-fg nw"
                    onPointerDown={(event) => onResizePointerDown('char-fg', 'nw', event)}
                    className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full bg-emerald-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                    style={{
                      left: `calc(50% + ${config.char_fg_pos.x - fgWidth / 2}px)`,
                      top: `calc(50% + ${config.char_fg_pos.y - fgHeight / 2}px)`,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Resize char-fg ne"
                    onPointerDown={(event) => onResizePointerDown('char-fg', 'ne', event)}
                    className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-full bg-emerald-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                    style={{
                      left: `calc(50% + ${config.char_fg_pos.x + fgWidth / 2}px)`,
                      top: `calc(50% + ${config.char_fg_pos.y - fgHeight / 2}px)`,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Resize char-fg sw"
                    onPointerDown={(event) => onResizePointerDown('char-fg', 'sw', event)}
                    className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-full bg-emerald-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                    style={{
                      left: `calc(50% + ${config.char_fg_pos.x - fgWidth / 2}px)`,
                      top: `calc(50% + ${config.char_fg_pos.y + fgHeight / 2}px)`,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Resize char-fg se"
                    onPointerDown={(event) => onResizePointerDown('char-fg', 'se', event)}
                    className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full bg-emerald-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                    style={{
                      left: `calc(50% + ${config.char_fg_pos.x + fgWidth / 2}px)`,
                      top: `calc(50% + ${config.char_fg_pos.y + fgHeight / 2}px)`,
                    }}
                  />
                </>
              )}
              {cursorPos && (activeLayer === 'mask-bg' || activeLayer === 'mask-fg') && (
                <div
                  className="absolute pointer-events-none rounded-full border border-white shadow-[0_0_2px_rgba(0,0,0,0.8)] z-50"
                  style={{
                    width: `${visualBrushSize}px`,
                    height: `${visualBrushSize}px`,
                    left: `${cursorPos.x - visualBrushSize / 2}px`,
                    top: `${cursorPos.y - visualBrushSize / 2}px`,
                  }}
                />
              )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
