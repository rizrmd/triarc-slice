import React, { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type RefObject } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { HeroConfig, LayerId, PoseVisibleLayers, PoseLayer, MaskLayer } from '@/types';

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

export function MaskedImage({
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

interface PoseCanvasProps {
  activeLayer: LayerId;
  setActiveLayer: (layer: LayerId) => void;
  config: HeroConfig;
  visibleLayers: PoseVisibleLayers;
  canvasZoom: number;
  canvasPan: { x: number; y: number };
  canvasPanning: boolean;
  spacePressed: boolean;
  maskFgCanvasRef: RefObject<HTMLCanvasElement | null>;
  fgUrl: string;
  shadowUrl: string;
  
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onLayerPointerDown: (layer: PoseLayer, event: ReactPointerEvent<HTMLElement>) => void;
  onMaskPointerDown: (layer: MaskLayer, event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onResizePointerDown: (
    layer: PoseLayer,
    corner: 'nw' | 'ne' | 'sw' | 'se',
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void;
  brushSize: number;
  baseSize?: { width: number; height: number };
}

export function PoseCanvas({
  activeLayer,
  setActiveLayer,
  config,
  visibleLayers,
  canvasZoom,
  canvasPan,
  canvasPanning,
  maskFgCanvasRef,
  fgUrl,
  shadowUrl,
  onCanvasPointerDown,
  onCanvasWheel,
  onLayerPointerDown,
  onMaskPointerDown,
  onResizePointerDown,
  brushSize,
  spacePressed,
  baseSize = { width: 320, height: 517 },
}: PoseCanvasProps) {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  
  const baseWidth = baseSize.width;
  const baseHeight = baseSize.height;

  // Defaults if pose config is missing
  const charFgScale = config.pose?.char_fg_scale ?? 100;
  const charFgPos = config.pose?.char_fg_pos ?? { x: 0, y: 0 };
  const shadowScale = config.pose?.shadow_scale ?? 100;
  const shadowPos = config.pose?.shadow_pos ?? { x: 0, y: 0 };

  const fgWidth = baseWidth * (charFgScale / 100);
  const fgHeight = baseHeight * (charFgScale / 100);
  const shadowWidth = baseWidth * (shadowScale / 100);
  const shadowHeight = baseHeight * (shadowScale / 100);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeLayer !== 'pose-mask-fg') {
      if (cursorPos) setCursorPos(null);
      return;
    }
    const frame = document.getElementById('pose-frame');
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
    activeLayer === 'pose-mask-fg'
      ? charFgScale
      : 100;
  const visualBrushSize = brushSize * (activeScale / 100);

  return (
    <Card className="bg-[#14161b] border-0 h-full flex flex-1 flex-col rounded-none">
      <CardContent className="flex flex-1 items-center justify-center p-6">
        <div
          onPointerDown={onCanvasPointerDown}
          onWheel={onCanvasWheel}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          className={`relative h-full w-full overflow-hidden select-none ${
            canvasPanning
              ? 'cursor-grabbing'
              : !spacePressed || (activeLayer === 'pose-mask-fg' && !spacePressed)
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
            <div
              id="pose-frame"
              className="relative overflow-hidden bg-background shadow-2xl"
              style={{ width: `${baseWidth}px`, height: `${baseHeight}px` }}
            >
              {/* Checkerboard background */}
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
              
              <div className="absolute inset-0">
                {visibleLayers['pose-frame'] && (
                  <div
                    className={`absolute inset-0 z-50 pointer-events-none ${
                      activeLayer === 'pose-frame' ? 'border border-blue-300/90' : 'border border-white/20'
                    }`}
                  />
                )}
                <div className="absolute inset-0 overflow-hidden">
                  {/* Shadow Layer */}
                  {visibleLayers['pose-shadow'] && (
                      <img
                          src={shadowUrl}
                          alt="Shadow"
                          className={`absolute max-w-none ${
                              activeLayer === 'pose-shadow' ? 'cursor-move' : 'cursor-default'
                          } ${activeLayer === 'pose-mask-fg' || spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                          onPointerDown={(event) => onLayerPointerDown('pose-shadow', event)}
                          onClick={() => {
                              if (activeLayer === 'canvas') return;
                              setActiveLayer('pose-shadow');
                          }}
                          style={{
                              left: '50%',
                              top: '50%',
                              width: `${shadowWidth}px`,
                              height: `${shadowHeight}px`,
                              transform: `translate(calc(-50% + ${shadowPos.x}px), calc(-50% + ${shadowPos.y}px))`,
                          }}
                      />
                  )}

                  {/* Char FG Layer */}
                  {visibleLayers['pose-char-fg'] && (
                    <MaskedImage
                      src={fgUrl}
                      maskCanvasRef={maskFgCanvasRef}
                      width={fgWidth}
                      height={fgHeight}
                      className={`absolute z-20 max-w-none ${
                        activeLayer === 'pose-char-fg' ? 'cursor-move' : 'cursor-default'
                      } ${
                        activeLayer === 'pose-mask-fg'
                          ? 'pointer-events-none opacity-50'
                          : spacePressed || canvasPanning
                          ? 'pointer-events-none'
                          : ''
                      }`}
                      onPointerDown={(event) => onLayerPointerDown('pose-char-fg', event)}
                      onClick={() => {
                        if (activeLayer === 'canvas') return;
                        setActiveLayer('pose-char-fg');
                      }}
                      style={{
                        left: '50%',
                        top: '50%',
                        transform: `translate(calc(-50% + ${charFgPos.x}px), calc(-50% + ${charFgPos.y}px))`,
                      }}
                    />
                  )}

                  {/* Mask Layer */}
                  {visibleLayers['pose-mask-fg'] && (
                    <canvas
                      ref={maskFgCanvasRef}
                      className={`absolute max-w-none opacity-0 ${
                        activeLayer === 'pose-mask-fg' && !spacePressed
                          ? 'z-[21] cursor-crosshair'
                          : 'z-[21] pointer-events-none'
                      }`}
                      onPointerDown={(event) => onMaskPointerDown('pose-mask-fg', event)}
                      onClick={() => {
                        if (activeLayer === 'canvas') return;
                        setActiveLayer('pose-mask-fg');
                      }}
                      style={{
                        left: '50%',
                        top: '50%',
                        width: `${fgWidth}px`,
                        height: `${fgHeight}px`,
                        transform: `translate(calc(-50% + ${charFgPos.x}px), calc(-50% + ${charFgPos.y}px))`,
                        touchAction: 'none',
                      }}
                    />
                  )}
                </div>

                {/* Controls for Shadow */}
                {visibleLayers['pose-shadow'] && activeLayer === 'pose-shadow' && (
                    <>
                    <div
                        className="absolute z-30 pointer-events-none border border-purple-300/90"
                        style={{
                        left: '50%',
                        top: '50%',
                        width: `${shadowWidth}px`,
                        height: `${shadowHeight}px`,
                        transform: `translate(calc(-50% + ${shadowPos.x}px), calc(-50% + ${shadowPos.y}px))`,
                        }}
                    />
                    {['nw', 'ne', 'sw', 'se'].map((corner) => (
                        <button
                        key={corner}
                        type="button"
                        aria-label={`Resize shadow ${corner}`}
                        onPointerDown={(event) => onResizePointerDown('pose-shadow', corner as any, event)}
                        className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-${corner === 'nw' || corner === 'se' ? 'nwse' : 'nesw'}-resize rounded-full bg-purple-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                        style={{
                            left: `calc(50% + ${shadowPos.x + (corner.includes('e') ? 1 : -1) * shadowWidth / 2}px)`,
                            top: `calc(50% + ${shadowPos.y + (corner.includes('s') ? 1 : -1) * shadowHeight / 2}px)`,
                        }}
                        />
                    ))}
                    </>
                )}

                {/* Controls for Char FG */}
                {visibleLayers['pose-char-fg'] && activeLayer === 'pose-char-fg' && (
                  <>
                    <div
                      className="absolute z-30 pointer-events-none border border-emerald-300/90"
                      style={{
                        left: '50%',
                        top: '50%',
                        width: `${fgWidth}px`,
                        height: `${fgHeight}px`,
                        transform: `translate(calc(-50% + ${charFgPos.x}px), calc(-50% + ${charFgPos.y}px))`,
                      }}
                    />
                    {['nw', 'ne', 'sw', 'se'].map((corner) => (
                        <button
                        key={corner}
                        type="button"
                        aria-label={`Resize char-fg ${corner}`}
                        onPointerDown={(event) => onResizePointerDown('pose-char-fg', corner as any, event)}
                        className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-${corner === 'nw' || corner === 'se' ? 'nwse' : 'nesw'}-resize rounded-full bg-emerald-200 ${spacePressed || canvasPanning ? 'pointer-events-none' : ''}`}
                        style={{
                            left: `calc(50% + ${charFgPos.x + (corner.includes('e') ? 1 : -1) * fgWidth / 2}px)`,
                            top: `calc(50% + ${charFgPos.y + (corner.includes('s') ? 1 : -1) * fgHeight / 2}px)`,
                        }}
                        />
                    ))}
                  </>
                )}

                {cursorPos && activeLayer === 'pose-mask-fg' && (
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
