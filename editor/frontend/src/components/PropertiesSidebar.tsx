import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Copy, Clipboard, X, Lock, Unlock, Move, Maximize } from "lucide-react";
import { useState, useRef, useEffect } from "react";

import type { Box } from "@/types";

const PIVOT_OPTIONS = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
];

interface PropertiesSidebarProps {
  selectedBox: Box | null;
  onUpdate: (id: string, updates: Partial<Box>) => void;
  onClose: () => void;
  cards: string[];
  actions: string[];
  animaps?: string[];
  uiAssets?: { name: string; url: string }[];
  charAssets?: { name: string; url: string }[];
  placeAssets?: { name: string; url: string }[];
  multiSelectCount?: number;
  viewport?: { width: number; height: number };
}

function PropertyInput({ value, onChange, disabled, className }: { value: number, onChange: (val: number) => void, disabled?: boolean, className?: string }) {
  const [localValue, setLocalValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);

  // Sync state from props when not editing (State derivation during render)
  if (!isEditing && String(value) !== localValue) {
    setLocalValue(String(value));
  }

  return (
    <Input
      type="number"
      value={localValue}
      onFocus={() => setIsEditing(true)}
      onBlur={() => setIsEditing(false)}
      onChange={(e) => {
        setLocalValue(e.target.value);
        const val = parseInt(e.target.value);
        if (!isNaN(val)) {
          onChange(val);
        }
      }}
      disabled={disabled}
      className={className}
    />
  );
}

function PercentInput({ value, onChange, disabled, className }: { value: number, onChange: (val: number) => void, disabled?: boolean, className?: string }) {
  const [localValue, setLocalValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing && String(value) !== localValue) {
    setLocalValue(String(value));
  }

  return (
    <div className="relative flex-1">
      <Input
        type="number"
        step="0.1"
        value={localValue}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        onChange={(e) => {
          setLocalValue(e.target.value);
          const val = parseFloat(e.target.value);
          if (!isNaN(val) && val > 0) {
            onChange(Math.round(val * 10) / 10);
          }
        }}
        disabled={disabled}
        className={`${className} pr-6 bg-blue-500/10 border-blue-500/30`}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 pointer-events-none">%</span>
    </div>
  );
}

export function PropertiesSidebar({ selectedBox, onUpdate, onClose, cards = [], actions = [], animaps = [], uiAssets = [], charAssets = [], placeAssets = [], multiSelectCount = 1, viewport = { width: 1080, height: 1920 } }: PropertiesSidebarProps) {
  const [copiedProp, setCopiedProp] = useState<string | null>(null);
  const [fullBoxClipboard, setFullBoxClipboard] = useState<Partial<Box> | null>(null);
  
  const [assetCategory, setAssetCategory] = useState<'ui' | 'characters' | 'places' | 'pose' | 'animap'>('ui');

  // Sync category with current asset if present
  useEffect(() => {
    if (selectedBox?.animapSlug) {
      setAssetCategory('animap');
    } else if (selectedBox?.poseSlug) {
      setAssetCategory('pose');
    } else if (selectedBox?.asset) {
       if (selectedBox.asset.includes('/ui/')) setAssetCategory('ui');
       else if (selectedBox.asset.includes('/characters/')) setAssetCategory('characters');
       else if (selectedBox.asset.includes('/places/')) setAssetCategory('places');
    }
  }, [selectedBox?.id, selectedBox?.asset, selectedBox?.poseSlug, selectedBox?.animapSlug]); // Run when box or asset changes

  const currentAssets = assetCategory === 'ui' ? uiAssets : assetCategory === 'characters' ? charAssets : assetCategory === 'places' ? placeAssets : [];


  const startXRef = useRef(0);
  const startValRef = useRef(0);
  const currentPropRef = useRef<keyof Box | null>(null);

  const [sizeInputValue, setSizeInputValue] = useState("");
  const [isEditingSize, setIsEditingSize] = useState(false);

  useEffect(() => {
    if (selectedBox && !isEditingSize) {
      setSizeInputValue(((selectedBox.width / 1080) * 100).toFixed(1));
    }
  }, [selectedBox?.width, isEditingSize, selectedBox]);

  if (!selectedBox) return null;

  const isHeroBox = selectedBox.id.startsWith('hero');
  const isActionBox = selectedBox.id.startsWith('action');
  const isEnemyBox = selectedBox.id.startsWith('enemy');
  const isVerticalCenterPivotCard = isHeroBox || isActionBox || isEnemyBox;

  const handleLabelDragStart = (e: React.MouseEvent, prop: keyof Box, value: number) => {
    if (selectedBox.locked) return;
    startXRef.current = e.clientX;
    startValRef.current = value;
    currentPropRef.current = prop;
    // eslint-disable-next-line
    document.body.style.cursor = 'ew-resize';
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!currentPropRef.current) return;
      const diff = moveEvent.clientX - startXRef.current;
      const newValue = Math.round(startValRef.current + diff);
      onUpdate(selectedBox.id, { [currentPropRef.current]: newValue });
    };

    const handleMouseUp = () => {
      currentPropRef.current = null;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSizeDragStart = (e: React.MouseEvent) => {
    if (selectedBox.locked) return;
    startXRef.current = e.clientX;
    // Current size percent
    startValRef.current = (selectedBox.width / 1080) * 100;
    // eslint-disable-next-line
    document.body.style.cursor = 'ew-resize';
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
       const diff = moveEvent.clientX - startXRef.current;
       // Sensitivity: 1px drag = 0.1% change
       const newPercent = Math.max(1, startValRef.current + diff * 0.1);
       const newW = (newPercent / 100) * 1080;
       const ratio = selectedBox.height / selectedBox.width;
       onUpdate(selectedBox.id, { 
         width: Math.round(newW), 
         height: Math.round(newW * ratio) 
       });
    };
    
    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleCopy = (key: keyof Box, value: string | number | undefined) => {
    navigator.clipboard.writeText(String(value));
    setCopiedProp(key);
    setTimeout(() => setCopiedProp(null), 1000);
  };

  const handlePaste = async (key: keyof Box) => {
    try {
      const text = await navigator.clipboard.readText();
      const num = parseInt(text);
      if (!isNaN(num)) {
        onUpdate(selectedBox.id, { [key]: num });
      }
    } catch (err) {
      console.error("Failed to paste:", err);
    }
  };

  const handleCopyAll = () => {
    const { x, y, width, height, pivot, fill, cardSlug, actionSlug, asset, width_percent, height_percent } = selectedBox;
    setFullBoxClipboard({ x, y, width, height, pivot, fill, cardSlug, actionSlug, asset, width_percent, height_percent });
  };

  const handleCopyPosition = () => {
    const { x, y } = selectedBox;
    setFullBoxClipboard({ x, y });
  };

  const handleCopySize = () => {
    const { width, height, width_percent, height_percent } = selectedBox;
    setFullBoxClipboard({ width, height, width_percent, height_percent });
  };

  const handlePasteAll = () => {
    if (fullBoxClipboard && !selectedBox.locked) {
      onUpdate(selectedBox.id, fullBoxClipboard);
    }
  };

  return (
    <div className="w-full h-full border-l bg-card p-3 flex flex-col gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">Properties</h2>
          {multiSelectCount > 1 && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{multiSelectCount} selected</span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-3">
        {/* Selected Element */}
        <div className="flex items-center gap-2 px-2 py-2 bg-muted/40 rounded-md">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{selectedBox.label}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{selectedBox.id}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onUpdate(selectedBox.id, { locked: !selectedBox.locked })}
            title={selectedBox.locked ? "Unlock" : "Lock"}
          >
            {selectedBox.locked ? <Lock className="h-3.5 w-3.5 text-orange-500" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />}
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground mr-0.5">Copy</span>
          <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] px-1" onClick={handleCopyPosition}>
            <Move className="mr-1 h-3 w-3" /> Pos
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] px-1" onClick={handleCopySize}>
            <Maximize className="mr-1 h-3 w-3" /> Size
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] px-1" onClick={handleCopyAll}>
            <Copy className="mr-1 h-3 w-3" /> All
          </Button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] px-1" onClick={handlePasteAll} disabled={!fullBoxClipboard || selectedBox.locked}>
            <Clipboard className="mr-1 h-3 w-3" /> Paste
          </Button>
        </div>

        {isHeroBox && (
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Card Preview</Label>
            <select
              className="w-full px-2 py-1.5 border rounded-md bg-background text-xs"
              value={selectedBox.cardSlug || ''}
              onChange={(e) => onUpdate(selectedBox.id, { cardSlug: e.target.value || undefined })}
            >
              <option value="">(None)</option>
              {cards.map(slug => (
                <option key={slug} value={slug}>{slug}</option>
              ))}
            </select>
          </div>
        )}

        {isActionBox && (
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Action Preview</Label>
            <select
              className="w-full px-2 py-1.5 border rounded-md bg-background text-xs"
              value={selectedBox.actionSlug || ''}
              onChange={(e) => onUpdate(selectedBox.id, { actionSlug: e.target.value || undefined })}
            >
              <option value="">(None)</option>
              {actions.map(slug => (
                <option key={slug} value={slug}>{slug}</option>
              ))}
            </select>
          </div>
        )}

        {!isHeroBox && !isActionBox && (
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Asset / Pose</Label>
            <div className="flex gap-1.5">
                <select
                    className="w-1/3 px-2 py-1.5 border rounded-md bg-background text-xs"
                    onChange={(e) => {
                      const newCat = e.target.value as 'ui' | 'characters' | 'places' | 'pose' | 'animap';
                      setAssetCategory(newCat);
                      if (newCat === 'animap') {
                        onUpdate(selectedBox.id, { asset: undefined, poseSlug: undefined });
                      } else if (newCat === 'pose') {
                        onUpdate(selectedBox.id, { asset: undefined, animapSlug: undefined });
                      } else {
                        onUpdate(selectedBox.id, { poseSlug: undefined, animapSlug: undefined });
                      }
                    }}
                    value={assetCategory}
                >
                    <option value="ui">UI</option>
                    <option value="characters">Char</option>
                    <option value="places">Place</option>
                    <option value="pose">Pose</option>
                    <option value="animap">Animap</option>
                </select>
                {assetCategory === 'animap' ? (
                  <select
                    className="flex-1 px-2 py-1.5 border rounded-md bg-background text-xs"
                    value={selectedBox.animapSlug || ''}
                    onChange={(e) => onUpdate(selectedBox.id, { animapSlug: e.target.value || undefined, asset: undefined, poseSlug: undefined })}
                  >
                    <option value="">(None)</option>
                    {animaps.map(slug => (
                      <option key={slug} value={slug}>{slug}</option>
                    ))}
                  </select>
                ) : assetCategory === 'pose' ? (
                  <select
                    className="flex-1 px-2 py-1.5 border rounded-md bg-background text-xs"
                    value={selectedBox.poseSlug || ''}
                    onChange={(e) => onUpdate(selectedBox.id, { poseSlug: e.target.value || undefined, asset: undefined, animapSlug: undefined })}
                  >
                    <option value="">(None)</option>
                    {cards.map(slug => (
                      <option key={slug} value={slug}>{slug}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    className="flex-1 px-2 py-1.5 border rounded-md bg-background text-xs"
                    value={selectedBox.asset || ''}
                    onChange={(e) => onUpdate(selectedBox.id, { asset: e.target.value || undefined, poseSlug: undefined, animapSlug: undefined })}
                  >
                    <option value="">(None)</option>
                    {currentAssets.map(asset => (
                      <option key={asset.url} value={asset.url}>{asset.name}</option>
                    ))}
                  </select>
                )}
            </div>
          </div>
        )}

        {/* Fill Mode */}
        <div className="space-y-1">
          <Label className="text-[11px] font-medium text-muted-foreground">Fill</Label>
          <select
            className="w-full px-2 py-1.5 border rounded-md bg-background text-xs"
            value={selectedBox.fill || 'stretch'}
            onChange={(e) => onUpdate(selectedBox.id, { fill: e.target.value as Box['fill'] })}
            disabled={selectedBox.locked}
          >
            <option value="contain">Contain</option>
            <option value="cover">Cover</option>
            <option value="stretch">Stretch</option>
            <option value="none">None</option>
          </select>
        </div>

        {!isVerticalCenterPivotCard && (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">Pivot Point</Label>
          <div className="flex items-center gap-2">
            <div className={`grid grid-cols-3 gap-0.5 w-[84px] bg-muted p-1 rounded-md shrink-0 ${selectedBox.locked ? 'opacity-50 pointer-events-none' : ''}`}>
              {PIVOT_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => onUpdate(selectedBox.id, { pivot: option })}
                  className={`
                    w-6 h-6 rounded-sm transition-all border
                    ${selectedBox.pivot === option
                      ? 'bg-primary border-primary'
                      : 'bg-background hover:bg-accent border-transparent'}
                  `}
                  title={option}
                  disabled={selectedBox.locked}
                >
                  <div className={`
                    w-1.5 h-1.5 rounded-full mx-auto
                    ${selectedBox.pivot === option ? 'bg-primary-foreground' : 'bg-muted-foreground'}
                  `} />
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground capitalize">
              {selectedBox.pivot?.replace('-', ' ')}
            </span>
          </div>
        </div>
        )}

        <div className="space-y-2">
          {/* Special Size Control for Heroes */}
          {isHeroBox && (
            <div className="flex items-center gap-1.5 mb-1">
              <Label
                className={`w-12 text-[11px] font-bold text-blue-500 select-none ${selectedBox.locked ? 'opacity-50' : 'cursor-ew-resize hover:text-blue-400'}`}
                onMouseDown={handleSizeDragStart}
              >
                Size
              </Label>
              <Input
                type="number"
                step="0.1"
                value={sizeInputValue}
                onFocus={() => setIsEditingSize(true)}
                onBlur={() => setIsEditingSize(false)}
                onChange={(e) => {
                   const valStr = e.target.value;
                   setSizeInputValue(valStr);
                   const val = parseFloat(valStr);
                   if (!isNaN(val) && val > 0) {
                      const newW = (val / 100) * 1080;
                      const ratio = selectedBox.height / selectedBox.width;
                      onUpdate(selectedBox.id, {
                        width: Math.round(newW),
                        height: Math.round(newW * ratio)
                      });
                   }
                }}
                className="h-7 text-xs font-bold bg-blue-500/10 border-blue-500/30"
                disabled={selectedBox.locked}
              />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">% width</span>
            </div>
          )}

          {(isHeroBox ? ['x', 'y'] : ['x', 'y', 'width', 'height']).map((p) => {
            const prop = p as 'x' | 'y' | 'width' | 'height';
            const isWidth = prop === 'width';
            const isHeight = prop === 'height';
            const isSizeProp = isWidth || isHeight;
            const percentKey = isWidth ? 'width_percent' : isHeight ? 'height_percent' : null;
            const isPercentMode = isSizeProp && percentKey && selectedBox[percentKey] != null;
            const vpDim = isWidth ? viewport.width : viewport.height;

            return (
              <div key={prop} className="flex items-center gap-1.5">
                <Label
                  className={`w-12 capitalize text-[11px] select-none ${selectedBox.locked ? 'opacity-50' : 'cursor-ew-resize hover:text-blue-500'}`}
                  onMouseDown={(e) => {
                    if (isPercentMode && percentKey) {
                      // Drag in percent mode
                      if (selectedBox.locked) return;
                      startXRef.current = e.clientX;
                      startValRef.current = selectedBox[percentKey]!;
                      document.body.style.cursor = 'ew-resize';
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        const diff = moveEvent.clientX - startXRef.current;
                        const newPercent = Math.max(0.1, startValRef.current + diff * 0.1);
                        const newPx = Math.round((newPercent / 100) * vpDim);
                        onUpdate(selectedBox.id, { [prop]: newPx, [percentKey]: Math.round(newPercent * 10) / 10 });
                      };
                      const handleMouseUp = () => {
                        document.body.style.cursor = '';
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                      };
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    } else {
                      handleLabelDragStart(e, prop, selectedBox[prop]);
                    }
                  }}
                >
                  {prop}
                </Label>
                {isPercentMode && percentKey ? (
                  <PercentInput
                    value={selectedBox[percentKey]!}
                    onChange={(pct) => {
                      const newPx = Math.round((pct / 100) * vpDim);
                      onUpdate(selectedBox.id, { [prop]: newPx, [percentKey]: pct });
                    }}
                    disabled={selectedBox.locked}
                    className="h-7 text-xs"
                  />
                ) : (
                  <PropertyInput
                    value={selectedBox[prop] ?? 0}
                    onChange={(val) => onUpdate(selectedBox.id, { [prop]: val })}
                    className="h-7 text-xs"
                    disabled={selectedBox.locked}
                  />
                )}
                {isSizeProp && percentKey && !isVerticalCenterPivotCard && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 shrink-0 text-[9px] font-bold ${isPercentMode ? 'text-blue-500' : 'text-muted-foreground'}`}
                    onClick={() => {
                      if (isPercentMode) {
                        // Switch to px mode: remove percent field
                        onUpdate(selectedBox.id, { [percentKey]: undefined });
                      } else {
                        // Switch to % mode: compute current percent
                        const currentPct = Math.round((selectedBox[prop] / vpDim) * 1000) / 10;
                        onUpdate(selectedBox.id, { [percentKey]: currentPct });
                      }
                    }}
                    title={isPercentMode ? "Switch to pixels" : "Switch to percent"}
                    disabled={selectedBox.locked}
                  >
                    %
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleCopy(prop, selectedBox[prop])}
                  title="Copy value"
                >
                  {copiedProp === prop ? <span className="text-[10px]">✓</span> : <Copy className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handlePaste(prop)}
                  title="Paste value"
                  disabled={selectedBox.locked}
                >
                  <Clipboard className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
