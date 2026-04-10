import { Image, Film, Layers, Type, Plus, Trash2, ChevronUp, ChevronDown, Lock, LockOpen, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AnimapConfig, AnimapLayer } from '@/types';
import { useState } from 'react';
import { addAnimapState, DEFAULT_STATE_ID, deleteAnimapState, normalizeAnimapConfig, renameAnimapState } from '@/lib/animap-state';
import { toKebabCase } from '@/lib/utils';

interface AnimapLayerPanelProps {
<<<<<<< HEAD
=======
  slug: string;
>>>>>>> origin/main
  config: AnimapConfig;
  selectedLayerId: string | null;
  selectedStateId: string;
  setSelectedStateId: (id: string) => void;
  setSelectedLayerId: (id: string | null) => void;
  commitConfig: (updater: (prev: AnimapConfig) => AnimapConfig) => void;
  canvasZoom: number;
  setCanvasZoom: (zoom: number) => void;
  setCanvasPan: (pan: { x: number; y: number }) => void;
}

const typeIcons = {
  image: Image,
  video: Film,
  mask: Layers,
  text: Type,
};

export function AnimapLayerPanel({
<<<<<<< HEAD
=======
  slug,
>>>>>>> origin/main
  config,
  selectedLayerId,
  selectedStateId,
  setSelectedStateId,
  setSelectedLayerId,
  commitConfig,
  canvasZoom,
  setCanvasZoom,
  setCanvasPan,
}: AnimapLayerPanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerType, setNewLayerType] = useState<'image' | 'video' | 'mask' | 'text'>('image');
  const [newStateName, setNewStateName] = useState('');
  const states = normalizeAnimapConfig(config).states ?? [];

  const addLayer = () => {
    if (!newLayerName.trim()) return;
    const kebabName = toKebabCase(newLayerName);
    if (!kebabName) return;
    const id = `layer-${Date.now()}`;
    const layer: AnimapLayer = {
      id,
      name: kebabName,
      type: newLayerType,
      file: '',
      visible: true,
      ...(newLayerType !== 'mask' ? { opacity: 1.0, x: 0, y: 0, scale: 1.0 } : {}),
      ...(newLayerType === 'text' ? { text: newLayerName, font_size: 96, color: '#ffffff', text_align: 'left', width: 480, height: 160 } : {}),
      ...(newLayerType === 'video' ? { loop: true, loop_start: 0, loop_end: 0 } : {}),
      ...(newLayerType === 'mask' ? { targets: [] } : {}),
    };
    commitConfig((prev) => ({
      ...prev,
      layers: [...prev.layers, layer],
    }));
    setSelectedLayerId(id);
    setNewLayerName('');
    setIsAdding(false);
  };

  const deleteLayer = (id: string) => {
<<<<<<< HEAD
=======
    const layer = config.layers.find((l) => l.id === id);
    if (layer?.file && slug) {
      const baseName = layer.file.replace(/\.[^.]+$/, '');
      fetch(`/api/animap-layer/${slug}/${baseName}`, { method: 'DELETE' }).catch(() => {});
    }
>>>>>>> origin/main
    commitConfig((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== id),
    }));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const moveLayer = (id: string, direction: -1 | 1) => {
    commitConfig((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.layers.length) return prev;
      const layers = [...prev.layers];
      [layers[idx], layers[newIdx]] = [layers[newIdx], layers[idx]];
      return { ...prev, layers };
    });
  };

  const toggleVisibility = (id: string) => {
    commitConfig((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    }));
  };

  const toggleLocked = (id: string) => {
    commitConfig((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    }));
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-3 py-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span className="text-sm font-semibold">States</span>
          </div>
          {selectedStateId !== DEFAULT_STATE_ID && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                commitConfig((prev) => deleteAnimapState(prev, selectedStateId));
                setSelectedStateId(DEFAULT_STATE_ID);
              }}
              title="Delete state"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
        <select
          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
          value={selectedStateId}
          onChange={(e) => setSelectedStateId(e.target.value)}
        >
          {states.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
            </option>
          ))}
        </select>
        {selectedStateId !== DEFAULT_STATE_ID && (
          <Input
            className="h-7 text-xs"
            value={states.find((s) => s.id === selectedStateId)?.name ?? ''}
            onChange={(e) => commitConfig((prev) => renameAnimapState(prev, selectedStateId, e.target.value))}
            placeholder="State name"
          />
        )}
        <div className="flex gap-1">
          <Input
            placeholder="New state"
            value={newStateName}
            onChange={(e) => setNewStateName(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newStateName.trim()) {
                const result = addAnimapState(config, newStateName);
                commitConfig(() => result.config);
                setSelectedStateId(result.stateId);
                setNewStateName('');
              }
            }}
          />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!newStateName.trim()}
            onClick={() => {
              const result = addAnimapState(config, newStateName);
              commitConfig(() => result.config);
              setSelectedStateId(result.stateId);
              setNewStateName('');
            }}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4" />
          <span className="text-sm font-semibold">Layers</span>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsAdding(!isAdding)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Add layer form */}
      {isAdding && (
        <div className="px-2 py-2 border-b space-y-2">
          <div className="flex gap-1">
            <Input
              placeholder="Layer name"
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              autoFocus
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === 'Enter' && addLayer()}
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={addLayer} disabled={!newLayerName.trim()}>
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 px-0"
              onClick={() => setIsAdding(false)}
              title="Close add layer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {(['image', 'video', 'mask', 'text'] as const).map((t) => {
              const Icon = typeIcons[t];
              return (
                <Button
                  key={t}
                  size="sm"
                  variant={newLayerType === t ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs justify-start"
                  onClick={() => setNewLayerType(t)}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {t}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Layer stack */}
      <div className="flex-1 overflow-y-auto">
        {[...config.layers].reverse().map((layer) => {
          const Icon = typeIcons[layer.type] || Image;
          const idx = config.layers.findIndex((l) => l.id === layer.id);
          const isSelected = selectedLayerId === layer.id;

          return (
            <div
              key={layer.id}
              className={`flex items-center h-10 px-1 border-b cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-primary/15 border-l-2 border-l-primary'
                  : 'hover:bg-muted/40'
              } ${!layer.visible ? 'opacity-50' : ''}`}
              onClick={() => setSelectedLayerId(layer.id)}
            >
              {/* Eye toggle */}
              <button
                className="flex items-center justify-center w-7 h-7 hover:bg-muted rounded flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id); }}
                title={layer.visible ? 'Hide' : 'Show'}
              >
                {layer.visible
                  ? <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  : <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40" />
                }
              </button>

              {/* Type icon */}
              <div className="flex items-center justify-center w-6 h-7 flex-shrink-0">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>

              {/* Name */}
              <span className="text-xs truncate flex-1 min-w-0 px-1">{layer.name}</span>

              {/* Reorder */}
              <button
                className="flex items-center justify-center w-6 h-7 hover:bg-muted rounded flex-shrink-0 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, -1); }}
                disabled={idx <= 0}
                title="Move down"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                className="flex items-center justify-center w-6 h-7 hover:bg-muted rounded flex-shrink-0 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 1); }}
                disabled={idx >= config.layers.length - 1}
                title="Move up"
              >
                <ChevronUp className="h-3 w-3" />
              </button>

              {/* Lock */}
              <button
                className="flex items-center justify-center w-6 h-7 hover:bg-muted rounded flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); toggleLocked(layer.id); }}
                title={layer.locked ? 'Unlock' : 'Lock'}
              >
                {layer.locked
                  ? <Lock className="h-3 w-3" />
                  : <LockOpen className="h-3 w-3 text-muted-foreground/40" />
                }
              </button>

              {/* Delete */}
              <button
                className="flex items-center justify-center w-6 h-7 hover:bg-destructive/10 rounded flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                title="Delete"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Zoom controls */}
      <div className="border-t px-3 py-2 space-y-1">
        <Label className="text-xs text-muted-foreground">Zoom {canvasZoom}%</Label>
        <div className="flex items-center gap-2">
          <Slider
            value={[canvasZoom]}
            onValueChange={([v]) => setCanvasZoom(v)}
            min={10}
            max={400}
            step={5}
            className="flex-1"
          />
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-6 px-2"
            onClick={() => { setCanvasZoom(100); setCanvasPan({ x: 0, y: 0 }); }}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
