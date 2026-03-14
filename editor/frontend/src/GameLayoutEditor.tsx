import { useState, useEffect, useRef, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Minus, Plus, RefreshCcw, Maximize, Undo2, Redo2 } from 'lucide-react';
import { PropertiesSidebar } from '@/components/PropertiesSidebar';
import { Slider } from '@/components/ui/slider';
import { CardPreview } from '@/components/CardPreview';
import { HeroPosePreview } from '@/components/HeroPosePreview';
import type { Box, GameLayout } from '@/types';

const DEFAULT_BOXES = [
  { id: 'enemy1', label: 'Enemy 1' },
  { id: 'enemy2', label: 'Enemy 2' },
  { id: 'enemy3', label: 'Enemy 3' },
  { id: 'hero1', label: 'Hero 1' },
  { id: 'hero2', label: 'Hero 2' },
  { id: 'hero3', label: 'Hero 3' },
  { id: 'action1', label: 'Action 1' },
  { id: 'action2', label: 'Action 2' },
  { id: 'action3', label: 'Action 3' },
  { id: 'action4', label: 'Action 4' },
  { id: 'action5', label: 'Action 5' },
  { id: 'reroll', label: 'RE-ROLL' },
  { id: 'mana', label: 'Mana Bar' },
  { id: 'health', label: 'Health Bar' },
  { id: 'settings', label: 'Settings' },
  { id: 'clock', label: 'Clock' },
  { id: 'battery', label: 'Battery' },
];

const ZOOM_STORAGE_KEY = 'game-layout-editor-zoom';

export default function GameLayoutEditor() {
  const [layout, setLayout] = useState<GameLayout | null>(null);
  const [places, setPlaces] = useState<{ name: string; url: string }[]>([]);
  const [uiAssets, setUiAssets] = useState<{ name: string; url: string }[]>([]);
  const [charAssets, setCharAssets] = useState<{ name: string; url: string }[]>([]);
  const [cards, setCards] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastSavedLayout = useRef<string>('');

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [bgDimensions, setBgDimensions] = useState({ width: 0, height: 0 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const zoomInitializedRef = useRef(false);
  const layoutRef = useRef<GameLayout | null>(null);
  const undoStackRef = useRef<GameLayout[]>([]);
  const redoStackRef = useRef<GameLayout[]>([]);

  const cloneLayout = useCallback((value: GameLayout): GameLayout => (
    JSON.parse(JSON.stringify(value)) as GameLayout
  ), []);

  const syncHistoryState = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const replaceLayout = useCallback((
    nextLayout: GameLayout,
    options?: { recordHistory?: boolean }
  ) => {
    const currentLayout = layoutRef.current;
    const currentString = currentLayout ? JSON.stringify(currentLayout) : '';
    const nextString = JSON.stringify(nextLayout);

    if (currentString === nextString) {
      return;
    }

    if (currentLayout && options?.recordHistory !== false) {
      undoStackRef.current.push(cloneLayout(currentLayout));
      if (undoStackRef.current.length > 100) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
    }

    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    syncHistoryState();
  }, [cloneLayout, syncHistoryState]);

  const updateLayout = useCallback((
    updater: (current: GameLayout) => GameLayout,
    options?: { recordHistory?: boolean }
  ) => {
    const currentLayout = layoutRef.current;
    if (!currentLayout) {
      return;
    }

    replaceLayout(updater(currentLayout), options);
  }, [replaceLayout]);

  const undo = useCallback(() => {
    const currentLayout = layoutRef.current;
    const previousLayout = undoStackRef.current.pop();

    if (!currentLayout || !previousLayout) {
      syncHistoryState();
      return;
    }

    redoStackRef.current.push(cloneLayout(currentLayout));
    layoutRef.current = previousLayout;
    setLayout(previousLayout);
    syncHistoryState();
  }, [cloneLayout, syncHistoryState]);

  const redo = useCallback(() => {
    const currentLayout = layoutRef.current;
    const nextLayout = redoStackRef.current.pop();

    if (!currentLayout || !nextLayout) {
      syncHistoryState();
      return;
    }

    undoStackRef.current.push(cloneLayout(currentLayout));
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    syncHistoryState();
  }, [cloneLayout, syncHistoryState]);

  const getBgMetrics = useCallback(() => {
    const VIEWPORT_W = 1080;
    const VIEWPORT_H = 1920;
    const bgW = bgDimensions.width || 1640; // Default fallback
    const bgH = bgDimensions.height || 2460;
    
    const scaleX = VIEWPORT_W / bgW;
    const scaleY = VIEWPORT_H / bgH;
    const scale = Math.max(scaleX, scaleY); // Cover
    
    const scaledW = bgW * scale;
    const scaledH = bgH * scale;
    
    const offsetX = (VIEWPORT_W - scaledW) / 2;
    const offsetY = (VIEWPORT_H - scaledH) / 2;
    
    return { scaledW, scaledH, offsetX, offsetY };
  }, [bgDimensions]);

  const toNormalized = useCallback((x: number, y: number, w: number, h: number) => {
    const { scaledW, scaledH, offsetX, offsetY } = getBgMetrics();
    const cx = x + w / 2;
    const cy = y + h / 2;
    const nx = (cx - offsetX) / scaledW;
    const ny = (cy - offsetY) / scaledH;
    return { nx, ny };
  }, [getBgMetrics]);

  const toPixels = useCallback((nx: number, ny: number, w: number, h: number) => {
    const { scaledW, scaledH, offsetX, offsetY } = getBgMetrics();
    const cx = offsetX + nx * scaledW;
    const cy = offsetY + ny * scaledH;
    const x = cx - w / 2;
    const y = cy - h / 2;
    return { x, y };
  }, [getBgMetrics]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (layout?.background) {
      const img = new Image();
      img.src = `/assets/places/${layout.background}`;
      img.onload = () => {
         setBgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
    }
  }, [layout?.background]);

  // Sync nx/ny and x/y whenever layout or dimensions change
   // This ensures consistency and enforces nx/ny as truth if present
   useEffect(() => {
    if (bgDimensions.width > 0) {
      requestAnimationFrame(() => {
        updateLayout(prev => {
          const newBoxes = { ...prev.boxes };
          let changed = false;
          
          Object.keys(newBoxes).forEach(key => {
            const box = newBoxes[key];
            if (box.nx !== undefined && box.ny !== undefined) {
                // Enforce nx/ny authority
                const { x, y } = toPixels(box.nx, box.ny, box.width, box.height);
                if (Math.abs(x - box.x) > 1 || Math.abs(y - box.y) > 1) {
                   newBoxes[key] = { ...box, x: Math.round(x), y: Math.round(y) };
                   changed = true;
                }
            } else {
               const { nx, ny } = toNormalized(box.x, box.y, box.width, box.height);
               newBoxes[key] = { ...box, nx, ny };
               changed = true;
            }
          });
          
          return changed ? { ...prev, boxes: newBoxes } : prev;
        }, { recordHistory: false });
      });
    }
  }, [bgDimensions, toPixels, toNormalized, updateLayout]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tagName = element.tagName;
      return element.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !isEditableTarget(e.target)) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }

        if (key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }

      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [redo, undo]);

  const fitZoom = () => {
    if (containerRef.current) {
       const { clientWidth, clientHeight } = containerRef.current;
       const scaleX = (clientWidth - 64) / 1080;
       const scaleY = (clientHeight - 64) / 1920;
       const scale = Math.min(scaleX, scaleY);
       setZoom(Math.max(0.1, scale));
       setPan({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    // Initial zoom fit
    if (layout && containerRef.current && !initializedRef.current) {
       const savedZoom = window.localStorage.getItem(ZOOM_STORAGE_KEY);
       const parsedZoom = savedZoom ? Number.parseFloat(savedZoom) : NaN;
       if (Number.isFinite(parsedZoom)) {
         setZoom(Math.min(Math.max(0.1, parsedZoom), 3));
       } else {
         fitZoom();
       }
       zoomInitializedRef.current = true;
       initializedRef.current = true;
    }
  }, [layout]); // Run after layout is loaded/ready

  useEffect(() => {
    if (!zoomInitializedRef.current) {
      return;
    }
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
  }, [zoom]);

  useEffect(() => {
    // Fetch layout
    fetch('/api/game-layout')
      .then(res => res.json())
      .then(data => {
          if (!data.boxes || Object.keys(data.boxes).length === 0) {
             // Initialize default positions if empty
             const initialBoxes: Record<string, Box> = {};
             DEFAULT_BOXES.forEach((box, i) => {
               initialBoxes[box.id] = {
                 id: box.id,
                 x: 50 + (i % 5) * 360,
                 y: 50 + Math.floor(i / 5) * 530,
                 width: 344,
                 height: 516,
                 label: box.label,
                 pivot: 'top-left'
               };
             });
             const newLayout = { background: data.background || 'cave.webp', boxes: initialBoxes };
             layoutRef.current = newLayout;
             setLayout(newLayout);
             lastSavedLayout.current = JSON.stringify(newLayout);
             resetHistory();
          } else {
             // Merge with default boxes
             const mergedBoxes = { ...data.boxes };
             DEFAULT_BOXES.forEach((box, i) => {
               if (!mergedBoxes[box.id]) {
                  mergedBoxes[box.id] = {
                    id: box.id,
                    x: 50 + (i % 5) * 360,
                    y: 50 + Math.floor(i / 5) * 530,
                    width: 344,
                    height: 516,
                    label: box.label,
                    pivot: 'top-left'
                  };
               } else {
                 // Ensure pivot exists
                 mergedBoxes[box.id] = {
                   ...mergedBoxes[box.id],
                   pivot: mergedBoxes[box.id].pivot || 'top-left'
                 };
               }
             });
             const newLayout = { ...data, boxes: mergedBoxes };
             layoutRef.current = newLayout;
             setLayout(newLayout);
             lastSavedLayout.current = JSON.stringify(newLayout);
             resetHistory();
          }
      });

    // Fetch places
    fetch('/api/assets/places')
      .then(res => res.json())
      .then(setPlaces)
      .catch(err => console.error("Failed to fetch places", err));

    // Fetch UI assets
    fetch('/api/assets/ui')
      .then(res => res.json())
      .then(setUiAssets)
      .catch(err => console.error("Failed to fetch UI assets", err));

    // Fetch character assets
    fetch('/api/assets/characters')
      .then(res => res.json())
      .then(setCharAssets)
      .catch(err => console.error("Failed to fetch character assets", err));


    // Fetch cards
    fetch('/api/cards')
      .then(res => res.json())
      .then(setCards)
      .catch(err => console.error("Failed to fetch cards", err));

    fetch('/api/actions')
      .then(res => res.json())
      .then(setActions)
      .catch(err => console.error("Failed to fetch actions", err));
  }, []);

  // Auto-save effect
  useEffect(() => {
    if (!layout) return;

    const currentString = JSON.stringify(layout);
    if (currentString === lastSavedLayout.current) return;

    const timer = setTimeout(() => {
      setSaving(true);
      fetch('/api/game-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: currentString,
      })
      .then(() => {
        lastSavedLayout.current = currentString;
      })
      .finally(() => setSaving(false));
    }, 1000);

    return () => clearTimeout(timer);
  }, [layout]);

  const updateBox = (id: string, updates: Partial<Box>) => {
    updateLayout(prev => {
      const oldBox = prev.boxes[id];
      const newBox = { ...oldBox, ...updates };
      
      // If pixel coords or size changed, update normalized
      if ('x' in updates || 'y' in updates || 'width' in updates || 'height' in updates) {
         const { nx, ny } = toNormalized(newBox.x, newBox.y, newBox.width, newBox.height);
         newBox.nx = nx;
         newBox.ny = ny;
      } 
      // If normalized coords changed, update pixel coords
      else if ('nx' in updates || 'ny' in updates) {
         if (newBox.nx !== undefined && newBox.ny !== undefined) {
           const { x, y } = toPixels(newBox.nx, newBox.ny, newBox.width, newBox.height);
           newBox.x = Math.round(x);
           newBox.y = Math.round(y);
         }
      }
      
      return {
        ...prev,
        boxes: {
          ...prev.boxes,
          [id]: newBox
        }
      };
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.min(Math.max(0.1, zoom + delta), 3);
      setZoom(newZoom);
    } else {
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  if (!layout) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading editor...
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
       <header className="flex items-center justify-between p-4 border-b bg-card">
         <div className="flex items-center gap-4">
           <Button variant="ghost" size="icon" asChild><Link to="/"><ArrowLeft className="h-4 w-4" /></Link></Button>
           <h1 className="text-xl font-bold">Game Layout Editor</h1>
         </div>
         <div className="flex items-center gap-4">
           <div className="flex items-center gap-2">
             <label className="text-sm font-medium">Background:</label>
             <select 
               className="p-2 border rounded bg-background text-foreground"
               value={layout.background} 
               onChange={e => updateLayout(current => ({ ...current, background: e.target.value }))}
             >
               {places.length > 0 ? (
                 places.map(p => <option key={p.name} value={p.name}>{p.name}</option>)
               ) : (
                 <option value="cave.webp">cave.webp</option>
               )}
             </select>
           </div>
           <div className="flex items-center gap-1">
             <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo} title="Undo (Cmd/Ctrl+Z)">
               <Undo2 className="h-4 w-4" />
             </Button>
             <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo} title="Redo (Shift+Cmd/Ctrl+Z)">
               <Redo2 className="h-4 w-4" />
             </Button>
           </div>
          <div className="flex items-center gap-2">
            {saving ? (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving...
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Saved</span>
            )}
          </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-hidden bg-gray-900 flex">
        <div 
          className={`flex-1 overflow-hidden flex items-center justify-center relative ${isSpacePressed ? 'cursor-grab active:cursor-grabbing' : ''}`}
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={(e) => {
            // Pan if middle click OR (left click AND spacebar is pressed)
            const canPan = e.button === 1 || (e.button === 0 && isSpacePressed);

            if (canPan) {
              e.preventDefault(); // Prevent text selection etc
              const startX = e.clientX - pan.x;
              const startY = e.clientY - pan.y;
              const handleMouseMove = (moveEvent: MouseEvent) => {
                setPan({
                  x: moveEvent.clientX - startX,
                  y: moveEvent.clientY - startY
                });
              };
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }
          }}
        >
          <div 
            className="absolute transition-transform duration-75 ease-out origin-center"
            style={{ 
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              width: '1080px', 
              height: '1920px'
            }}
          >
            <div className="relative w-full h-full border border-gray-700 shadow-lg bg-black">
              <div 
                 className="absolute inset-0 bg-no-repeat pointer-events-none"
                 style={{ 
                   backgroundImage: `url(/assets/places/${layout.background})`,
                   backgroundSize: 'cover',
                   backgroundPosition: 'center'
                 }}
              />
               
               {Object.values(layout.boxes).map(box => (
                (() => {
                  const hasPreview = !!(box.cardSlug || box.actionSlug || box.poseSlug);
                  return (
                 <Rnd
                   key={box.id}
                   size={{ width: box.width, height: box.height }}
                   position={{ x: box.x, y: box.y }}
                   scale={zoom}
                   disableDragging={box.locked}
                   enableResizing={!box.locked}
                   onDragStop={(_e, d) => {
                     // Calculate relative change in position to avoid jump
                     const newX = Math.round(d.x);
                     const newY = Math.round(d.y);
                     const { nx, ny } = toNormalized(newX, newY, box.width, box.height);
                     
                     updateLayout(prev => ({
                       ...prev,
                       boxes: {
                         ...prev.boxes,
                         [box.id]: { ...box, x: newX, y: newY, nx, ny }
                       }
                     }));
                   }}
                   onResizeStop={(_e, _direction, ref, _delta, position) => {
                     const newW = Math.round(parseInt(ref.style.width));
                     const newH = Math.round(parseInt(ref.style.height));
                     const newX = Math.round(position.x);
                     const newY = Math.round(position.y);
                     const { nx, ny } = toNormalized(newX, newY, newW, newH);

                     updateLayout(prev => ({
                       ...prev,
                       boxes: {
                         ...prev.boxes,
                         [box.id]: { 
                           ...box, 
                           width: newW, 
                           height: newH,
                           x: newX,
                           y: newY,
                           nx, ny
                         }
                       }
                     }));
                   }}
                   bounds="parent"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setSelectedBox(box.id);
                  }}
                  className={`${selectedBox === box.id ? (hasPreview ? 'z-10' : 'border-2 border-blue-500 z-10') : (hasPreview ? '' : 'border-2 border-gray-400')} ${hasPreview ? 'bg-transparent' : 'bg-white/80'} ${box.locked ? 'opacity-80' : ''} flex items-center justify-center cursor-move rounded shadow-sm hover:shadow-md transition-shadow relative`}
                 >
                   {/* Pivot Indicator */}
                   {box.pivot && !box.locked && (
                     <div 
                       className="absolute w-2 h-2 bg-red-500 rounded-full z-20 pointer-events-none"
                       style={{
                         top: box.pivot.startsWith('top') ? '-4px' : box.pivot.startsWith('bottom') ? 'calc(100% - 4px)' : 'calc(50% - 4px)',
                         left: box.pivot.includes('left') ? '-4px' : box.pivot.includes('right') ? 'calc(100% - 4px)' : 'calc(50% - 4px)'
                       }}
                     />
                   )}
                   {!box.cardSlug && !box.actionSlug && !box.asset && !box.poseSlug && (
                     <div className="text-center font-bold text-xs pointer-events-none select-none p-1 break-words z-10 relative">
                       {box.label}
                     </div>
                   )}
                   
                   {box.cardSlug && (
                     <div className="absolute inset-0 pointer-events-none">
                       <CardPreview 
                         slug={box.cardSlug} 
                         transparent 
                         onAspectRatioLoaded={(ratio) => {
                            if (!box.locked) {
                               const currentRatio = box.height / box.width;
                               // Only update if difference is significant (> 1%)
                               if (Math.abs(currentRatio - ratio) > 0.01) {
                                  // Avoid state updates if component unmounted or data changed
                                  setTimeout(() => {
                                      updateLayout(prev => {
                                         const currentBox = prev.boxes[box.id];
                                         if (!currentBox) return prev;
                                         
                                         const targetHeight = Math.round(currentBox.width * ratio);
                                         if (Math.abs(currentBox.height - targetHeight) <= 1) return prev;
                                         
                                         // Also update normalized coords
                                         const { nx, ny } = toNormalized(currentBox.x, currentBox.y, currentBox.width, targetHeight);
                                         
                                         return {
                                            ...prev,
                                            boxes: {
                                               ...prev.boxes,
                                               [box.id]: {
                                                  ...currentBox,
                                                  height: targetHeight,
                                                  nx, ny
                                               }
                                            }
                                         };
                                      }, { recordHistory: false });
                                  }, 0);
                               }
                            }
                         }}
                       />
                     </div>
                   )}

                   {box.actionSlug && (
                     <div className="absolute inset-0 pointer-events-none">
                       <CardPreview
                         slug={box.actionSlug}
                         type="action"
                         transparent
                         onAspectRatioLoaded={(ratio) => {
                           if (!box.locked) {
                             const currentRatio = box.height / box.width;
                             if (Math.abs(currentRatio - ratio) > 0.01) {
                               setTimeout(() => {
                                 updateLayout(prev => {
                                   const currentBox = prev.boxes[box.id];
                                   if (!currentBox) return prev;

                                   const targetHeight = Math.round(currentBox.width * ratio);
                                   if (Math.abs(currentBox.height - targetHeight) <= 1) return prev;

                                   const { nx, ny } = toNormalized(currentBox.x, currentBox.y, currentBox.width, targetHeight);

                                   return {
                                     ...prev,
                                     boxes: {
                                       ...prev.boxes,
                                       [box.id]: {
                                         ...currentBox,
                                         height: targetHeight,
                                         nx,
                                         ny,
                                       }
                                     }
                                   };
                                 }, { recordHistory: false });
                               }, 0);
                             }
                           }
                         }}
                       />
                     </div>
                   )}

                   {box.poseSlug && (
                     <div className="absolute inset-0 pointer-events-none">
                       <HeroPosePreview slug={box.poseSlug} />
                     </div>
                   )}

                   {box.asset && (
                     <div className="absolute inset-0 pointer-events-none">
                       <img 
                         src={box.asset} 
                         className="w-full h-full object-contain" 
                         alt="" 
                         onLoad={(e) => {
                            if (!box.locked) {
                               const img = e.currentTarget;
                               const ratio = img.naturalHeight / img.naturalWidth;
                               const currentRatio = box.height / box.width;
                               // Only update if difference is significant (> 1%)
                               if (Math.abs(currentRatio - ratio) > 0.01) {
                                  // Avoid state updates if component unmounted or data changed
                                  setTimeout(() => {
                                      updateLayout(prev => {
                                         const currentBox = prev.boxes[box.id];
                                         if (!currentBox) return prev;
                                         
                                         const targetHeight = Math.round(currentBox.width * ratio);
                                         if (Math.abs(currentBox.height - targetHeight) <= 1) return prev;
                                         
                                         // Also update normalized coords
                                         const { nx, ny } = toNormalized(currentBox.x, currentBox.y, currentBox.width, targetHeight);
                                         
                                         return {
                                            ...prev,
                                            boxes: {
                                               ...prev.boxes,
                                               [box.id]: {
                                                  ...currentBox,
                                                  height: targetHeight,
                                                  nx, ny
                                               }
                                            }
                                         };
                                      }, { recordHistory: false });
                                  }, 0);
                               }
                            }
                         }}
                       />
                     </div>
                   )}
                 </Rnd>
                  );
                })()
               ))}
            </div>
          </div>

          {/* Navigator Controls */}
          <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur border rounded-lg p-2 flex flex-col gap-2 shadow-lg z-10">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}>
                <Minus className="h-3 w-3" />
              </Button>
              <Slider 
                value={[zoom]} 
                min={0.1} 
                max={3} 
                step={0.1} 
                className="w-24"
                onValueChange={([v]) => setZoom(v)}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>{Math.round(zoom * 100)}%</span>
              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={fitZoom} title="Fit to Screen">
                  <Maximize className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset to 100%">
                  <RefreshCcw className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <div className={`h-full border-l bg-card shadow-xl z-20 transition-all duration-300 ${selectedBox ? 'w-80' : 'w-0 overflow-hidden'}`}>
           {selectedBox && layout.boxes[selectedBox] && (
          <PropertiesSidebar 
              selectedBox={layout.boxes[selectedBox]}
              onUpdate={updateBox}
              onClose={() => setSelectedBox(null)}
              cards={cards}
              actions={actions}
              uiAssets={uiAssets}
              charAssets={charAssets}
              placeAssets={places}
            />
           )}
        </div>
      </div>
    </div>
  );
}
