import { useRef } from 'react';
import { Brush, ClipboardPaste, Copy, Eraser, Image, Loader2, RotateCcw, Upload, FolderOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { HeroConfig, LayerId, PoseLayer, MaskLayer, AssetPickerTarget, CharProperty } from '@/types';

interface PoseLayerControlsProps {
  activeLayer: LayerId;
  config: HeroConfig;
  commitConfig: (updater: (prev: HeroConfig) => HeroConfig) => void;
  
  // Pose Layer Props
  updateLayerScale: (layer: PoseLayer, scale: number) => void;
  updateLayerPosition: (layer: PoseLayer, dx: number, dy: number) => void; // Delta update
  setLayerPosition: (layer: PoseLayer, x: number, y: number) => void; // Absolute update
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
  
  // Mask Layer Props
  brushSize: number;
  setBrushSize: (size: number) => void;
  brushOpacity: number;
  setBrushOpacity: (opacity: number) => void;
  brushHardness: number;
  setBrushHardness: (hardness: number) => void;
  brushMode: 'erase' | 'restore';
  setBrushMode: (mode: 'erase' | 'restore') => void;
  clearMaskLayer: (layer: MaskLayer) => void;
  
  // Image URLs
  layerUrls: Record<PoseLayer, string>;
}

export function PoseLayerControls({
  activeLayer,
  config,
  updateLayerScale,
  setLayerPosition,
  copyAllLayerProperties,
  pasteAllLayerProperties,
  resetAllLayerProperties,
  copySingleProperty,
  pasteSingleProperty,
  resetLayerProperty,
  handleLayerUpload,
  uploadingLayer,
  setAssetPickerTarget,
  layerClipboard,
  propertyClipboard,
  brushSize,
  setBrushSize,
  brushOpacity,
  setBrushOpacity,
  brushHardness,
  setBrushHardness,
  brushMode,
  setBrushMode,
  clearMaskLayer,
  layerUrls,
}: PoseLayerControlsProps) {
  const charFgUploadRef = useRef<HTMLInputElement | null>(null);
  const shadowUploadRef = useRef<HTMLInputElement | null>(null);

  const poseConfig = config.pose || {
    char_fg_pos: { x: 0, y: 0 },
    char_fg_scale: 100,
    shadow_pos: { x: 0, y: 0 },
    shadow_scale: 100,
  };

  const renderLayerControls = (layer: PoseLayer) => {
    const uploadRef = layer === 'pose-char-fg' ? charFgUploadRef : shadowUploadRef;
    const isCharFg = layer === 'pose-char-fg';
    const pos = isCharFg ? poseConfig.char_fg_pos : poseConfig.shadow_pos;
    const scale = isCharFg ? poseConfig.char_fg_scale : poseConfig.shadow_scale;
    const imageUrl = layerUrls[layer];

    const safePos = pos || { x: 0, y: 0 };
    const safeScale = scale || 100;

    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => copyAllLayerProperties(layer)}
            aria-label={`Copy ${layer}`}
            title="Copy"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => pasteAllLayerProperties(layer)}
            disabled={!layerClipboard}
            aria-label={`Paste ${layer}`}
            title="Paste"
          >
            <ClipboardPaste className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => resetAllLayerProperties(layer)}
            aria-label={`Reset ${layer}`}
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Image {layer === 'pose-char-fg' ? 'Character' : 'Shadow'}</Label>
          <div className="flex gap-3">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border bg-muted/50">
              {imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt={layer} 
                  className="h-full w-full object-contain p-1" 
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Image className="h-8 w-8 opacity-20" />
                </div>
              )}
            </div>
            
            <div className="flex flex-1 flex-col gap-2 justify-center">
              <input
                ref={uploadRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  handleLayerUpload(layer, file);
                  event.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => uploadRef.current?.click()}
                disabled={uploadingLayer === layer}
              >
                {uploadingLayer === layer ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="truncate">Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    <span className="truncate">Upload</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => setAssetPickerTarget(layer)}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                <span className="truncate">Select Existing</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Label>X (center)</Label>
            <span className="font-mono text-muted-foreground">{safePos.x}px</span>
          </div>
          <Slider
            value={[safePos.x]}
            min={-200}
            max={200}
            step={1}
            onValueChange={([value]) => setLayerPosition(layer, value, safePos.y)}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => copySingleProperty(layer, 'x')}
              aria-label={`Copy X ${layer}`}
              title="Copy X"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => pasteSingleProperty(layer, 'x')}
              disabled={propertyClipboard?.property !== 'x'}
              aria-label={`Paste X ${layer}`}
              title="Paste X"
            >
              <ClipboardPaste className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => resetLayerProperty(layer, 'x')}
              aria-label={`Reset X ${layer}`}
              title="Reset X"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Label>Y (center)</Label>
            <span className="font-mono text-muted-foreground">{safePos.y}px</span>
          </div>
          <Slider
            value={[safePos.y]}
            min={-200}
            max={200}
            step={1}
            onValueChange={([value]) => setLayerPosition(layer, safePos.x, value)}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => copySingleProperty(layer, 'y')}
              aria-label={`Copy Y ${layer}`}
              title="Copy Y"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => pasteSingleProperty(layer, 'y')}
              disabled={propertyClipboard?.property !== 'y'}
              aria-label={`Paste Y ${layer}`}
              title="Paste Y"
            >
              <ClipboardPaste className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => resetLayerProperty(layer, 'y')}
              aria-label={`Reset Y ${layer}`}
              title="Reset Y"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Label>Scale</Label>
            <span className="font-mono text-muted-foreground">{safeScale}%</span>
          </div>
          <Slider
            value={[safeScale]}
            min={10}
            max={300}
            step={1}
            onValueChange={([value]) => updateLayerScale(layer, value)}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => copySingleProperty(layer, 'scale')}
              aria-label={`Copy Scale ${layer}`}
              title="Copy Scale"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => pasteSingleProperty(layer, 'scale')}
              disabled={propertyClipboard?.property !== 'scale'}
              aria-label={`Paste Scale ${layer}`}
              title="Paste Scale"
            >
              <ClipboardPaste className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => resetLayerProperty(layer, 'scale')}
              aria-label={`Reset Scale ${layer}`}
              title="Reset Scale"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    );
  };

  return (
    <Card className="h-full rounded-2xl">
      <ScrollArea className="h-full">
        <CardContent className="space-y-6 p-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Active Layer</Label>
              <Badge variant="outline" className="capitalize">
                {activeLayer}
              </Badge>
            </div>
          </section>

          {(activeLayer === 'pose-char-fg' || activeLayer === 'pose-shadow') && (
            renderLayerControls(activeLayer)
          )}

          {activeLayer === 'pose-mask-fg' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Mask Layer</Label>
                <Badge variant="outline">{activeLayer}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Draw on mask. Position/Scale follows pose-char-fg.
              </p>
              
              <div className="flex w-full items-center gap-1 rounded-lg border p-1 bg-muted/50">
                <Button
                  type="button"
                  variant={brushMode === 'erase' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setBrushMode('erase')}
                >
                  <Eraser className="mr-2 h-4 w-4" />
                  Erase
                </Button>
                <Button
                  type="button"
                  variant={brushMode === 'restore' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setBrushMode('restore')}
                >
                  <Brush className="mr-2 h-4 w-4" />
                  Restore
                </Button>
              </div>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label>Size</Label>
                    <span className="font-mono text-muted-foreground">{brushSize}px</span>
                  </div>
                  <Slider
                    value={[brushSize]}
                    min={1}
                    max={200}
                    step={1}
                    onValueChange={([value]) => setBrushSize(value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label>Opacity</Label>
                    <span className="font-mono text-muted-foreground">{brushOpacity}%</span>
                  </div>
                  <Slider
                    value={[brushOpacity]}
                    min={1}
                    max={100}
                    step={1}
                    onValueChange={([value]) => setBrushOpacity(value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label>Strength</Label>
                    <span className="font-mono text-muted-foreground">{brushHardness}%</span>
                  </div>
                  <Slider
                    value={[brushHardness]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([value]) => setBrushHardness(value)}
                  />
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => clearMaskLayer('pose-mask-fg')}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear Mask
              </Button>
            </section>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
