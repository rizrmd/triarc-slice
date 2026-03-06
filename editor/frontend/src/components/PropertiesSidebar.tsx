import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Copy, Clipboard, X, Lock, Unlock } from "lucide-react";
import { useState, useRef } from "react";

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
}

export function PropertiesSidebar({ selectedBox, onUpdate, onClose, cards = [] }: PropertiesSidebarProps) {
  const [copiedProp, setCopiedProp] = useState<string | null>(null);
  const [fullBoxClipboard, setFullBoxClipboard] = useState<Partial<Box> | null>(null);

  const startXRef = useRef(0);
  const startValRef = useRef(0);
  const currentPropRef = useRef<keyof Box | null>(null);

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
    const { x, y, width, height, pivot, cardSlug } = selectedBox;
    setFullBoxClipboard({ x, y, width, height, pivot, cardSlug });
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

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={handleCopyAll}
          >
            <Copy className="mr-2 h-3 w-3" /> Copy All
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={handlePasteAll}
            disabled={!fullBoxClipboard || selectedBox.locked}
          >
            <Clipboard className="mr-2 h-3 w-3" /> Paste All
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
            {/* Godot Coordinates (Normalized) - Hidden for now
            <div className="p-2 bg-muted/30 rounded border border-dashed">
              <div className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Godot Coordinates (Normalized)</div>
              {['nx', 'ny'].map((p) => {
                const prop = p as 'nx' | 'ny';
                return (
                <div key={prop} className="flex items-center gap-2 mb-2 last:mb-0">
                  <Label 
                    className="w-8 capitalize text-xs font-mono text-blue-400"
                  >
                    {prop}
                  </Label>
                  <Input 
                    type="number" 
                    step="0.0001"
                    value={selectedBox[prop] !== undefined ? selectedBox[prop] : ''} 
                    onChange={(e) => onUpdate(selectedBox.id, { [prop]: parseFloat(e.target.value) || 0 })}
                    className="h-7 text-xs font-mono bg-background"
                    disabled={selectedBox.locked}
                  />
                </div>
              )})}
            </div>
            */}

            {['x', 'y', 'width', 'height'].map((p) => {
            const prop = p as 'x' | 'y' | 'width' | 'height';
            return (
            <div key={prop} className="flex items-center gap-2">
              <Label 
                className={`w-16 capitalize text-xs select-none ${selectedBox.locked ? 'opacity-50' : 'cursor-ew-resize hover:text-blue-500'}`}
                onMouseDown={(e) => handleLabelDragStart(e, prop, selectedBox[prop])}
              >
                {prop}
              </Label>
              <Input 
                type="number" 
                value={String(selectedBox[prop] ?? 0)} 
                onChange={(e) => onUpdate(selectedBox.id, { [prop]: parseInt(e.target.value) || 0 })}
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
