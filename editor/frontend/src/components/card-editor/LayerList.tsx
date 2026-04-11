import React from 'react';
import { Image, Layers, Sparkles, Type, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { LayerId } from '@/types';

interface LayerListProps<T extends Record<string, boolean>> {
  isAction?: boolean;
  activeLayer: LayerId;
  setActiveLayer: (layer: LayerId) => void;
  visibleLayers: T;
  setVisibleLayers: React.Dispatch<React.SetStateAction<T>>;
  canvasZoom: number;
  setCanvasZoom: (zoom: number) => void;
  setCanvasPan: (pan: { x: number; y: number }) => void;
  onResetZoom?: () => void;
  showCardLayers?: boolean;
}

export function LayerList<T extends Record<string, boolean>>({
  isAction = false,
  activeLayer,
  setActiveLayer,
  visibleLayers,
  setVisibleLayers,
  canvasZoom,
  setCanvasZoom,
  setCanvasPan,
  onResetZoom,
  showCardLayers = true,
}: LayerListProps<T>) {
  const toggleLayer = (layer: string, checked: boolean) => {
    setVisibleLayers((prev) => ({
      ...prev,
      [layer]: checked,
    }));
  };

  const renderLayerItem = (
    id: string,
    label: string,
    Icon: React.ElementType
  ) => {
      // Skip if layer doesn't exist in current visibleLayers
      if (!(id in visibleLayers)) return null;
      
      return (
        <div
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
            activeLayer === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
          }`}
          onClick={() => setActiveLayer(id as LayerId)}
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <Switch
            checked={visibleLayers[id]}
            onCheckedChange={(checked) => toggleLayer(id, checked)}
            aria-label={`Toggle ${label}`}
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      );
  };

  return (
    <Card className="rounded-2xl h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4" />
          Layers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 flex-1 overflow-y-auto">
        {/* Card Layers */}
        {showCardLayers && (
          <>
            {isAction ? (
              <>
                {renderLayerItem('name', 'Name', Type)}
                {renderLayerItem('card', 'frame', Image)}
                {renderLayerItem('char-fg', 'action fg', Sparkles)}
                {renderLayerItem('mask-fg', 'mask-fg', Image)}
                {renderLayerItem('char-bg', 'action bg', Image)}
                {renderLayerItem('mask-bg', 'mask-bg', Image)}
              </>
            ) : (
              <>
                {renderLayerItem('hp-bar', 'HP Bar', Activity)}
                {renderLayerItem('name', 'Name', Type)}
                {renderLayerItem('char-fg', 'char-fg', Sparkles)}
                {renderLayerItem('mask-fg', 'mask-fg', Image)}
                {renderLayerItem('card', 'card', Image)}
                {renderLayerItem('char-bg', 'char-bg', Image)}
                {renderLayerItem('mask-bg', 'mask-bg', Image)}
              </>
            )}
          </>
        )}

        <section className="space-y-2 rounded-lg border p-3 mt-4">
          <div className="flex items-center justify-between text-xs">
            <Button
              type="button"
              variant={activeLayer === 'canvas' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveLayer('canvas')}
            >
              Canvas
            </Button>
            <span className="font-mono text-muted-foreground">{canvasZoom}%</span>
          </div>
          <Slider
            value={[canvasZoom]}
            min={25}
            max={300}
            step={1}
            onValueChange={([value]) => setCanvasZoom(value)}
          />
          <div className="flex items-center gap-2">
            <Button 
              type="button" 
              variant="secondary" 
              size="sm" 
              onClick={() => {
                if (onResetZoom) {
                  onResetZoom();
                } else {
                  setCanvasZoom(100);
                  setCanvasPan({ x: 0, y: 0 });
                }
              }}
            >
              {isAction ? 'Fit Frame' : 'Reset Zoom'}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCanvasPan({ x: 0, y: 0 })}>
              Center Canvas
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
