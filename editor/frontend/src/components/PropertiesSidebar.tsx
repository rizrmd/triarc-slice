import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Copy, Clipboard, X, Lock, Unlock, Move, Maximize } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nx?: number;
  ny?: number;
  label: string;
  pivot: string;
  cardSlug?: string;
  asset?: string;
  locked?: boolean;
}

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
  uiAssets?: { name: string; url: string }[];
  charAssets?: { name: string; url: string }[];
  placeAssets?: { name: string; url: string }[];
}

function PropertyInput({ value, onChange, disabled, className }: { value: number, onChange: (val: number) => void, disabled?: boolean, className?: string }) {
  const [localValue, setLocalValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setLocalValue(String(value));
    }
  }, [value, isEditing]);

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

export function PropertiesSidebar({ selectedBox, onUpdate, onClose, cards = [], uiAssets = [], charAssets = [], placeAssets = [] }: PropertiesSidebarProps) {
  const [copiedProp, setCopiedProp] = useState<string | null>(null);
  const [fullBoxClipboard, setFullBoxClipboard] = useState<Partial<Box> | null>(null);
  
  const [assetCategory, setAssetCategory] = useState<'ui' | 'characters' | 'places'>('ui');

  // Sync category with current asset if present
  useEffect(() => {
    if (selectedBox?.asset) {
       if (selectedBox.asset.includes('/ui/')) setAssetCategory('ui');
       else if (selectedBox.asset.includes('/characters/')) setAssetCategory('characters');
       else if (selectedBox.asset.includes('/places/')) setAssetCategory('places');
    }
  }, [selectedBox?.id, selectedBox?.asset]); // Run when box or asset changes

  const currentAssets = assetCategory === 'ui' ? uiAssets : assetCategory === 'characters' ? charAssets : placeAssets;


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

  const handleLabelDragStart = (e: React.MouseEvent, prop: keyof Box, value: number) => {
    if (selectedBox.locked) return;
    startXRef.current = e.clientX;
    startValRef.current = value;
    currentPropRef.current = prop;
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

  const handleCopy = (key: keyof Box, value: any) => {
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
    const { x, y, width, height, pivot, cardSlug, asset } = selectedBox;
    setFullBoxClipboard({ x, y, width, height, pivot, cardSlug, asset });
  };

  const handleCopyPosition = () => {
    const { x, y } = selectedBox;
    setFullBoxClipboard({ x, y });
  };

  const handleCopySize = () => {
    const { width, height } = selectedBox;
    setFullBoxClipboard({ width, height });
  };

  const handlePasteAll = () => {
    if (fullBoxClipboard && !selectedBox.locked) {
      onUpdate(selectedBox.id, fullBoxClipboard);
    }
  };

  return (
    <div className="w-full h-full border-l bg-card p-4 flex flex-col gap-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Properties</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-xs font-medium text-muted-foreground mb-1">Selected Element</div>
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm truncate">{selectedBox.label}</div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6" 
              onClick={() => onUpdate(selectedBox.id, { locked: !selectedBox.locked })}
              title={selectedBox.locked ? "Unlock" : "Lock"}
            >
              {selectedBox.locked ? <Lock className="h-3 w-3 text-orange-500" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground font-mono mt-1">{selectedBox.id}</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCopyPosition}
          >
            <Move className="mr-2 h-3 w-3" /> Copy Pos
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCopySize}
          >
            <Maximize className="mr-2 h-3 w-3" /> Copy Size
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCopyAll}
          >
            <Copy className="mr-2 h-3 w-3" /> Copy All
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handlePasteAll}
            disabled={!fullBoxClipboard || selectedBox.locked}
          >
            <Clipboard className="mr-2 h-3 w-3" /> Paste
          </Button>
        </div>

        {selectedBox.id.startsWith('hero') && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Card Preview</Label>
            <select 
              className="w-full p-2 border rounded bg-background text-sm"
              value={selectedBox.cardSlug || ''}
              onChange={(e) => onUpdate(selectedBox.id, { cardSlug: e.target.value || undefined })}
              disabled={selectedBox.locked}
            >
              <option value="">(None)</option>
              {cards.map(slug => (
                <option key={slug} value={slug}>{slug}</option>
              ))}
            </select>
          </div>
        )}

        {!selectedBox.id.startsWith('hero') && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Asset</Label>
            <div className="flex gap-2">
                <select 
                    className="w-1/3 p-2 border rounded bg-background text-sm"
                    onChange={(e) => setAssetCategory(e.target.value as any)}
                    value={assetCategory}
                    disabled={selectedBox.locked}
                >
                    <option value="ui">UI</option>
                    <option value="characters">Char</option>
                    <option value="places">Place</option>
                </select>
                <select 
                  className="flex-1 p-2 border rounded bg-background text-sm"
                  value={selectedBox.asset || ''}
                  onChange={(e) => onUpdate(selectedBox.id, { asset: e.target.value || undefined })}
                  disabled={selectedBox.locked}
                >
                  <option value="">(None)</option>
                  {currentAssets.map(asset => (
                    <option key={asset.url} value={asset.url}>{asset.name}</option>
                  ))}
                </select>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs font-medium">Pivot Point</Label>
          <div className={`grid grid-cols-3 gap-1 w-[120px] mx-auto bg-muted p-1 rounded-md ${selectedBox.locked ? 'opacity-50 pointer-events-none' : ''}`}>
            {PIVOT_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => onUpdate(selectedBox.id, { pivot: option })}
                className={`
                  w-8 h-8 rounded-sm transition-all border
                  ${selectedBox.pivot === option 
                    ? 'bg-primary border-primary' 
                    : 'bg-background hover:bg-accent border-transparent'}
                `}
                title={option}
                disabled={selectedBox.locked}
              >
                <div className={`
                  w-2 h-2 rounded-full mx-auto
                  ${selectedBox.pivot === option ? 'bg-primary-foreground' : 'bg-muted-foreground'}
                `} />
              </button>
            ))}
          </div>
          <div className="text-center text-xs text-muted-foreground mt-1 capitalize">
            {selectedBox.pivot?.replace('-', ' ')}
          </div>
        </div>

          <div className="space-y-3">
            {/* Special Size Control for Heroes */}
            {selectedBox.id.startsWith('hero') && (
              <div className="flex items-center gap-2 mb-2">
                <Label 
                  className={`w-16 text-xs font-bold text-blue-500 select-none ${selectedBox.locked ? 'opacity-50' : 'cursor-ew-resize hover:text-blue-400'}`}
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
                  className="h-8 text-xs font-bold bg-blue-500/10 border-blue-500/30"
                  disabled={selectedBox.locked}
                />
                <div className="w-16 text-[10px] text-muted-foreground">
                   of screen width
                </div>
              </div>
            )}

            {(selectedBox.id.startsWith('hero') ? ['x', 'y'] : ['x', 'y', 'width', 'height']).map((p) => {
            const prop = p as 'x' | 'y' | 'width' | 'height';
            return (
            <div key={prop} className="flex items-center gap-2">
              <Label 
                className={`w-16 capitalize text-xs select-none ${selectedBox.locked ? 'opacity-50' : 'cursor-ew-resize hover:text-blue-500'}`}
                onMouseDown={(e) => handleLabelDragStart(e, prop, selectedBox[prop])}
              >
                {prop}
              </Label>
              <PropertyInput 
                value={selectedBox[prop] ?? 0}
                onChange={(val) => onUpdate(selectedBox.id, { [prop]: val })}
                className="h-8 text-xs"
                disabled={selectedBox.locked}
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => handleCopy(prop, selectedBox[prop])}
                title="Copy value"
              >
                {copiedProp === prop ? <span className="text-xs">✓</span> : <Copy className="h-3 w-3" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => handlePaste(prop)}
                title="Paste value"
                disabled={selectedBox.locked}
              >
                <Clipboard className="h-3 w-3" />
              </Button>
            </div>
          )})}
        </div>
      </div>
    </div>
  );
}
