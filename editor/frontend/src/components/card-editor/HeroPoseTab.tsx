import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { HeroConfig, LayerId, PoseLayer, MaskLayer, PoseVisibleLayers, GameLayout, AssetPickerTarget, CharProperty } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PoseLayerControls } from './PoseLayerControls';
import { PoseCanvas, MaskedImage } from './PoseCanvas';
import { LayerList } from './LayerList';
import { Loader2 } from 'lucide-react';

function resolveBgVariant(name: string, suffix: '-narrow' | '-wide'): string {
  if (!name) return name;
  // Strip any extension and existing -wide/-narrow suffix, then apply new suffix
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '.webp';
  const base = (ext ? name.slice(0, name.lastIndexOf('.')) : name)
    .replace(/-wide$/, '').replace(/-narrow$/, '');
  return base + suffix + '.webp';
}

interface HeroPoseTabProps {
  config: HeroConfig;
  onChange: (updater: (prev: HeroConfig) => HeroConfig) => void;
  
  // Props from HeroEditor
  updateLayerScale: (layer: PoseLayer, scale: number) => void;
  updateLayerPosition: (layer: PoseLayer, dx: number, dy: number) => void;
  applyLayerState: (layer: PoseLayer, state: { x: number; y: number; scale: number }) => void;
  copyAllLayerProperties: (layer: PoseLayer) => void;
  pasteAllLayerProperties: (layer: PoseLayer) => void;
  resetAllLayerProperties: (layer: PoseLayer) => void;
  copySingleProperty: (layer: PoseLayer, property: CharProperty) => void;
  pasteSingleProperty: (layer: PoseLayer, property: CharProperty) => void;
  resetLayerProperty: (layer: PoseLayer, property: CharProperty) => void;
  handleLayerUpload: (layer: PoseLayer, file: File | null) => void;
  uploadingLayer: PoseLayer | null;
  setAssetPickerTarget: (target: AssetPickerTarget) => void;
  layerClipboard: { x: number; y: number; scale: number } | null;
  propertyClipboard: { property: CharProperty; value: number } | null;
  
  brushSize: number;
  setBrushSize: (size: number) => void;
  brushOpacity: number;
  setBrushOpacity: (opacity: number) => void;
  brushHardness: number;
  setBrushHardness: (hardness: number) => void;
  brushMode: 'erase' | 'restore';
  setBrushMode: (mode: 'erase' | 'restore') => void;
  clearMaskLayer: (layer: MaskLayer) => void;
  poseShadowCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  poseMaskFgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  poseFgUrl: string;
  poseShadowUrl: string;
  onMaskChange: () => void;
}

export function HeroPoseTab({
  config,
  onChange,
  updateLayerScale,
  updateLayerPosition,
  applyLayerState,
  copyAllLayerProperties,
  pasteAllLayerProperties,
  resetAllLayerProperties,
  copySingleProperty,
  pasteSingleProperty,
  resetLayerProperty,
  handleLayerUpload,
  uploadingLayer,
  brushSize,
  setBrushSize,
  brushOpacity,
  setBrushOpacity,
  brushHardness,
  setBrushHardness,
  brushMode,
  setBrushMode,
  clearMaskLayer,
  poseShadowCanvasRef,
  poseMaskFgCanvasRef,
  poseFgUrl,
  poseShadowUrl,
  layerClipboard,
  propertyClipboard,
  onMaskChange,
  setAssetPickerTarget,
}: HeroPoseTabProps) {
  const [activeTab, setActiveTab] = useState("canvas");
  const [activeLayer, setActiveLayer] = useState<LayerId>('pose-char-fg');
  const [visibleLayers, setVisibleLayers] = useState<PoseVisibleLayers>({
    'pose-frame': true,
    'pose-char-fg': true,
    'pose-mask-fg': true,
    'pose-shadow': true,
  });
  const [poseShadowPreviewUrl, setPoseShadowPreviewUrl] = useState('');
  
  const [canvasZoom, setCanvasZoom] = useState(100);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [canvasPanning, setCanvasPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);

  const [previewZoom, setPreviewZoom] = useState(40);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [previewPanning, setPreviewPanning] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  
  const [layout, setLayout] = useState<GameLayout | null>(null);
  
  useEffect(() => {
<<<<<<< HEAD
    fetch('/api/game-layout')
=======
    fetch('/api/scene/gameplay/layout')
>>>>>>> origin/main
      .then(res => res.json())
      .then(setLayout)
      .catch(err => console.error("Failed to fetch game layout", err));
  }, []);

  // Removed unused background dimension logic
  /*
  useEffect(() => {
    if (layout?.background) {
      const img = new Image();
      img.src = `/assets/places/${layout.background}`;
      img.onload = () => {
         // setBgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
    }
  }, [layout?.background]);
  */

  useEffect(() => {
    const canvas = poseShadowCanvasRef.current;
    if (!canvas) return;
    canvas.width = 320;
    canvas.height = 517;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!poseShadowUrl) {
      requestAnimationFrame(() => setPoseShadowPreviewUrl(''));
      return;
    }
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setPoseShadowPreviewUrl(canvas.toDataURL('image/png'));
    };
    image.src = poseShadowUrl;
  }, [poseShadowUrl, poseShadowCanvasRef]);

  // Keyboard shortcuts (subset of HeroEditor)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handlePreviewWheel = useCallback((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    setPreviewZoom((prev) => Math.max(10, Math.min(300, Math.round(prev - event.deltaY * 0.08))));
  }, []);

  const handlePreviewPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    setPreviewPanning(true);
    const startX = event.clientX;
    const startY = event.clientY;
    const startPan = { ...previewPan };
    const onPointerMove = (moveEvent: PointerEvent) => {
      setPreviewPan({
        x: startPan.x + (moveEvent.clientX - startX),
        y: startPan.y + (moveEvent.clientY - startY),
      });
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setPreviewPanning(false);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleCanvasWheel = useCallback((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasZoom((prev) => Math.max(25, Math.min(300, Math.round(prev - event.deltaY * 0.08))));
  }, []);

  useEffect(() => {
    const element = previewContainerRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => handlePreviewWheel(event);
    element.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [handlePreviewWheel]);

  const handleCanvasPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!spacePressed) return;

    event.preventDefault();
    setCanvasPanning(true);
    const startX = event.clientX;
    const startY = event.clientY;
    const startPan = { ...canvasPan };
    const onPointerMove = (moveEvent: PointerEvent) => {
      setCanvasPan({
        x: startPan.x + (moveEvent.clientX - startX),
        y: startPan.y + (moveEvent.clientY - startY),
      });
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setCanvasPanning(false);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleLayerPointerDown = (layer: PoseLayer, event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (spacePressed) return;
    event.preventDefault();
    setActiveLayer(layer);
    
    let startX = event.clientX;
    let startY = event.clientY;
    
    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = Math.round(moveEvent.clientX - startX);
      const deltaY = Math.round(moveEvent.clientY - startY);
      updateLayerPosition(layer, deltaX, deltaY);
      startX = moveEvent.clientX;
      startY = moveEvent.clientY;
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleResizePointerDown = (
    layer: PoseLayer,
    corner: 'nw' | 'ne' | 'sw' | 'se',
    event: React.PointerEvent
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveLayer(layer);

    const baseWidth = baseSize.width;
    const baseHeight = baseSize.height;
    const layerPos = layer === 'pose-char-fg'
      ? config.pose?.char_fg_pos ?? { x: 0, y: 0 }
      : config.pose?.shadow_pos ?? { x: 0, y: 0 };
    const layerScale = layer === 'pose-char-fg'
      ? config.pose?.char_fg_scale ?? 100
      : config.pose?.shadow_scale ?? 100;

    const signX = corner === 'ne' || corner === 'se' ? 1 : -1;
    const signY = corner === 'sw' || corner === 'se' ? 1 : -1;
    const startHalfW = (baseWidth * (layerScale / 100)) / 2;
    const startHalfH = (baseHeight * (layerScale / 100)) / 2;
    const anchor = {
      x: layerPos.x - signX * startHalfW,
      y: layerPos.y - signY * startHalfH,
    };
    const startPointer = { x: event.clientX, y: event.clientY };
    const startCorner = {
      x: layerPos.x + signX * startHalfW,
      y: layerPos.y + signY * startHalfH,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const pointerDeltaX = moveEvent.clientX - startPointer.x;
      const pointerDeltaY = moveEvent.clientY - startPointer.y;
      const rawCorner = {
        x: startCorner.x + pointerDeltaX,
        y: startCorner.y + pointerDeltaY,
      };

      const rawWidth = Math.abs(rawCorner.x - anchor.x);
      const rawHeight = Math.abs(rawCorner.y - anchor.y);
      const constrainedWidth = Math.max(rawWidth, rawHeight * (baseWidth / baseHeight), 40);
      const newScale = (constrainedWidth / baseWidth) * 100;
      const clampedScale = Math.max(10, Math.min(300, Math.round(newScale)));
      const clampedWidth = (baseWidth * clampedScale) / 100;
      const clampedHeight = (baseHeight * clampedScale) / 100;
      const normalizedCorner = {
        x: anchor.x + signX * clampedWidth,
        y: anchor.y + signY * clampedHeight,
      };
      const newCenter = {
        x: (anchor.x + normalizedCorner.x) / 2,
        y: (anchor.y + normalizedCorner.y) / 2,
      };

      applyLayerState(layer, {
        x: Math.round(newCenter.x),
        y: Math.round(newCenter.y),
        scale: clampedScale,
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const drawOnCanvas = (
      _layer: 'pose-mask-fg',
      canvas: HTMLCanvasElement,
      event: React.PointerEvent,
      onStrokeEnd?: () => void
  ) => {
      if (spacePressed) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      canvas.setPointerCapture(event.pointerId);
      const context = canvas.getContext('2d');
      if (!context) return;

      const getPoint = (e: PointerEvent | React.PointerEvent) => {
          const rect = canvas.getBoundingClientRect();
          return {
              x: ((e.clientX - rect.left) / rect.width) * canvas.width,
              y: ((e.clientY - rect.top) / rect.height) * canvas.height,
          };
      };

      const draw = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
          const alpha = brushOpacity / 100;
          const brushColor = `rgba(0, 0, 0, ${alpha})`;
          context.save();
          context.globalCompositeOperation = brushMode === 'erase'
              ? 'source-over'
              : 'destination-out';
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.strokeStyle = brushColor;
          context.fillStyle = brushColor;
          context.lineWidth = brushSize;
          
          if (brushHardness < 100) {
              const blurAmount = (brushSize / 2) * ((100 - brushHardness) / 100);
              context.shadowBlur = blurAmount;
              context.shadowColor = brushColor;
          } else {
              context.shadowBlur = 0;
          }
          context.beginPath();
          context.moveTo(p1.x, p1.y);
          context.lineTo(p2.x, p2.y);
          context.stroke();
          context.beginPath();
          context.arc(p2.x, p2.y, Math.max(brushSize / 2, 0.5), 0, Math.PI * 2);
          context.fill();
          context.restore();
      };

      let lastPoint = getPoint(event);
      draw(lastPoint, lastPoint);

      const onPointerMove = (moveEvent: PointerEvent) => {
          const nextPoint = getPoint(moveEvent);
          draw(lastPoint, nextPoint);
          lastPoint = nextPoint;
      };
      
      const onPointerUp = (e: PointerEvent) => {
          canvas.releasePointerCapture(e.pointerId);
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          onStrokeEnd?.();
          onMaskChange();
      };
      
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
  };

  const handleMaskPointerDown = (layer: MaskLayer, event: React.PointerEvent) => {
      if (layer !== 'pose-mask-fg') return;
      setActiveLayer(layer);
      const canvas = poseMaskFgCanvasRef.current;
      if (!canvas) return;
      drawOnCanvas('pose-mask-fg', canvas, event);
  };

  const defaultBoxes = layout?.boxes || {};
  const enemy2Box = defaultBoxes['enemy2'];
  const baseSize = useMemo(
    () => (enemy2Box ? { width: enemy2Box.width, height: enemy2Box.height } : { width: 320, height: 517 }),
    [enemy2Box?.width, enemy2Box?.height],
  );
  const PREVIEW_VIEWPORT_SIZE = useMemo(() => ({ width: 1080, height: 1920 }), []);

  const fitZoom = useCallback(
    (
      container: HTMLDivElement | null,
      contentSize: { width: number; height: number },
      setZoom: React.Dispatch<React.SetStateAction<number>>,
      setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>,
      minZoom: number,
      maxZoom: number,
      fillPercent: number,
    ) => {
      if (!container || contentSize.width <= 0 || contentSize.height <= 0) {
        setPan({ x: 0, y: 0 });
        return;
      }

      const { width, height } = container.getBoundingClientRect();
      const scaleX = width / contentSize.width;
      const scaleY = height / contentSize.height;
      const scale = Math.min(scaleX, scaleY) * fillPercent;

      setZoom(Math.max(minZoom, Math.min(maxZoom, Math.floor(scale))));
      setPan({ x: 0, y: 0 });
    },
    [],
  );

  const handleFitCanvas = useCallback(() => {
    fitZoom(canvasContainerRef.current, baseSize, setCanvasZoom, setCanvasPan, 25, 300, 90);
  }, [baseSize, fitZoom]);

  const handleFitPreview = useCallback(() => {
    fitZoom(previewContainerRef.current, PREVIEW_VIEWPORT_SIZE, setPreviewZoom, setPreviewPan, 10, 300, 95);
  }, [fitZoom]);

  const handleResetZoom = useCallback(() => {
    if (activeTab === 'preview') {
      handleFitPreview();
      return;
    }
    handleFitCanvas();
  }, [activeTab, handleFitCanvas, handleFitPreview]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      handleFitCanvas();
    }, 100);

    return () => window.clearTimeout(timer);
  }, [handleFitCanvas]);

  // Preview logic
  const renderPreview = () => {
      if (!layout) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;
      
      const VIEWPORT_W = PREVIEW_VIEWPORT_SIZE.width;
      const VIEWPORT_H = PREVIEW_VIEWPORT_SIZE.height;
      // const bgW = bgDimensions.width || 1640;
      // const bgH = bgDimensions.height || 2460;
      // const scaleX = VIEWPORT_W / bgW;
      // const scaleY = VIEWPORT_H / bgH;
      // const scale = Math.max(scaleX, scaleY);
      
      // Calculate enemy2 position
      // enemy2Box has x, y in pixels relative to viewport
      const boxX = enemy2Box ? enemy2Box.x : 160;
      const boxY = enemy2Box ? enemy2Box.y : 50;
      
      // Pose config
      const charFgPos = config.pose?.char_fg_pos || { x: 0, y: 0 };
      const charFgScale = config.pose?.char_fg_scale || 100;
      const shadowPos = config.pose?.shadow_pos || { x: 0, y: 0 };
      const shadowScale = config.pose?.shadow_scale || 100;
      
      // Base dimensions (enemy2 box)
      const w = baseSize.width;
      const h = baseSize.height;
      
      const fgW = w * (charFgScale / 100);
      const fgH = h * (charFgScale / 100);
      const shadowW = w * (shadowScale / 100);
      const shadowH = h * (shadowScale / 100);

      return (
          <div 
              ref={previewContainerRef}
              className={`relative w-full h-full flex items-center justify-center overflow-hidden bg-black select-none ${previewPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
              onPointerDown={handlePreviewPointerDown}
          >
              <div 
                  className="absolute overflow-hidden border border-gray-800 shadow-2xl origin-center"
                  style={{ 
                      width: `${VIEWPORT_W}px`, 
                      height: `${VIEWPORT_H}px`,
                      transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom / 100})`,
                  }}
              >
                  {/* Background */}
                  <div
                      className="absolute inset-0 bg-no-repeat bg-center bg-cover"
                      style={{ backgroundImage: layout.background ? `url(/assets/places/${resolveBgVariant(layout.background, '-narrow')})` : undefined }}
                  />
                  
                  {/* Hero in Enemy2 Box */}
                  <div 
                      className={`absolute ${visibleLayers['pose-frame'] ? 'border border-red-500/50' : ''}`}
                      style={{
                          left: `${boxX}px`,
                          top: `${boxY}px`,
                          width: `${w}px`,
                          height: `${h}px`,
                      }}
                  >
                      {/* Shadow */}
                      {visibleLayers['pose-shadow'] && poseShadowPreviewUrl && (
                        <img
                          src={poseShadowPreviewUrl}
                          className="absolute z-0 max-w-none pointer-events-none"
                          style={{
                            left: '50%',
                            top: '50%',
                            width: `${shadowW}px`,
                            height: `${shadowH}px`,
                            transform: `translate(calc(-50% + ${shadowPos.x}px), calc(-50% + ${shadowPos.y}px))`,
                          }}
                        />
                      )}
                      <div className="absolute inset-0 overflow-hidden">
                        {visibleLayers['pose-char-fg'] && poseFgUrl && (
                          <MaskedImage
                            src={poseFgUrl}
                            maskCanvasRef={poseMaskFgCanvasRef}
                            width={fgW}
                            height={fgH}
                            className="absolute z-10 max-w-none pointer-events-none"
                            style={{
                              left: '50%',
                              top: '50%',
                              transform: `translate(calc(-50% + ${charFgPos.x}px), calc(-50% + ${charFgPos.y}px))`,
                            }}
                          />
                        )}
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="flex h-full min-h-0 flex-col flex-1">
       <div className="grid flex-1 min-h-0 grid-cols-[320px_1fr_auto] gap-4">
          <PoseLayerControls 
            activeLayer={activeLayer}
            config={config}
            commitConfig={onChange}
            updateLayerScale={updateLayerScale}
            updateLayerPosition={updateLayerPosition} // Need to adapt signature? updateLayerPosition expects LayerId, PoseLayerControls passes PoseLayer. Correct.
            setLayerPosition={(layer, x, y) => applyLayerState(layer, { x, y, scale: (layer === 'pose-char-fg' ? config.pose?.char_fg_scale : config.pose?.shadow_scale) || 100 })}
            copyAllLayerProperties={copyAllLayerProperties}
            pasteAllLayerProperties={pasteAllLayerProperties}
            resetAllLayerProperties={resetAllLayerProperties}
            copySingleProperty={copySingleProperty}
            pasteSingleProperty={pasteSingleProperty}
            resetLayerProperty={resetLayerProperty}
            handleLayerUpload={handleLayerUpload}
            uploadingLayer={uploadingLayer}
            setAssetPickerTarget={setAssetPickerTarget}
            layerClipboard={layerClipboard}
            propertyClipboard={propertyClipboard}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            brushOpacity={brushOpacity}
            setBrushOpacity={setBrushOpacity}
            brushHardness={brushHardness}
            setBrushHardness={setBrushHardness}
            brushMode={brushMode}
            setBrushMode={setBrushMode}
            clearMaskLayer={clearMaskLayer}
            layerUrls={{
                'pose-char-fg': poseFgUrl,
                'pose-shadow': poseShadowPreviewUrl || poseShadowUrl,
            }}
          />
          <div className="relative flex-1 min-h-0 overflow-hidden border bg-gray-900">
             <Tabs defaultValue="canvas" value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 w-full flex-col">
                <div className="absolute top-4 right-4 z-10 bg-card rounded-md p-1 border shadow-sm">
                    <TabsList>
                        <TabsTrigger value="canvas">Canvas</TabsTrigger>
                        <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                </div>
                
                <TabsContent value="canvas" forceMount className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden">
                   <PoseCanvas 
                      activeLayer={activeLayer}
                      setActiveLayer={setActiveLayer}
                      config={config}
                      visibleLayers={visibleLayers}
                      canvasZoom={canvasZoom}
                      canvasPan={canvasPan}
                      canvasPanning={canvasPanning}
                      spacePressed={spacePressed}
                      shadowCanvasRef={poseShadowCanvasRef}
                      maskFgCanvasRef={poseMaskFgCanvasRef}
                      fgUrl={poseFgUrl}
                      onCanvasPointerDown={handleCanvasPointerDown}
                      onCanvasWheel={handleCanvasWheel}
                      onLayerPointerDown={handleLayerPointerDown}
                      onMaskPointerDown={handleMaskPointerDown}
                      onResizePointerDown={handleResizePointerDown}
                      brushSize={brushSize}
                      baseSize={baseSize}
                      containerRef={canvasContainerRef}
                   />
                </TabsContent>
                <TabsContent value="preview" className="mt-0 flex-1 min-h-0 data-[state=inactive]:hidden">
                   {renderPreview()}
                </TabsContent>
             </Tabs>
          </div>
          <div className="w-[280px]">
             <LayerList 
                activeLayer={activeLayer}
                setActiveLayer={setActiveLayer}
                visibleLayers={visibleLayers}
                setVisibleLayers={setVisibleLayers}
                canvasZoom={activeTab === 'preview' ? previewZoom : canvasZoom}
                setCanvasZoom={activeTab === 'preview' ? setPreviewZoom : setCanvasZoom}
                setCanvasPan={activeTab === 'preview' ? setPreviewPan : setCanvasPan}
                onResetZoom={handleResetZoom}
                showCardLayers={false}
             />
          </div>
       </div>
    </div>
  );
}
