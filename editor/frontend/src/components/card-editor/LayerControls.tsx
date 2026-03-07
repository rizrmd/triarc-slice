import { useState, useRef } from 'react';
import { Brush, ClipboardPaste, Copy, Eraser, Image, Loader2, RotateCcw, Upload, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ensureHexColor } from '@/lib/utils';
import type { HeroConfig, LayerId, CharLayer, MaskLayer, TextLayer, BarLayer, CharProperty, AssetPickerTarget, PoseLayer } from '@/types';

interface LayerControlsProps {
  activeLayer: LayerId;
  config: HeroConfig;
  commitConfig: (updater: (prev: HeroConfig) => HeroConfig) => void;
  setAssetPickerTarget: (target: AssetPickerTarget) => void;
  
  // Char Layer Props
  copyAllLayerProperties: (layer: CharLayer | TextLayer | BarLayer) => void;
  pasteAllLayerProperties: (layer: CharLayer | TextLayer | BarLayer) => void;
  resetAllLayerProperties: (layer: CharLayer | TextLayer | BarLayer) => void;
  copySingleProperty: (layer: CharLayer | TextLayer | BarLayer, property: CharProperty) => void;
  pasteSingleProperty: (layer: CharLayer | TextLayer | BarLayer, property: CharProperty) => void;
  resetLayerProperty: (layer: CharLayer | TextLayer | BarLayer, property: CharProperty) => void;
  applyLayerProperty: (layer: CharLayer | TextLayer | BarLayer, property: CharProperty, value: number) => void;
  updateLayerScale: (layer: CharLayer | TextLayer | BarLayer, scale: number) => void;
  handleCharUpload: (layer: CharLayer, file: File | null) => void;
  uploadingCharLayer: CharLayer | PoseLayer | null;
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
  
  // Image URLs for preview
  charLayerUrls: Record<CharLayer, string>;
  
  onRename: (newName: string) => void;
}

export function LayerControls({
  activeLayer,
  config,
  commitConfig,
  setAssetPickerTarget,
  copyAllLayerProperties,
  pasteAllLayerProperties,
  resetAllLayerProperties,
  copySingleProperty,
  pasteSingleProperty,
  resetLayerProperty,
  applyLayerProperty,
  updateLayerScale,
  handleCharUpload,
  uploadingCharLayer,
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
  charLayerUrls,
  onRename,
}: LayerControlsProps) {
  const charBgUploadRef = useRef<HTMLInputElement | null>(null);
  const charFgUploadRef = useRef<HTMLInputElement | null>(null);
  
  const [localName, setLocalName] = useState(config.full_name);
  const [prevName, setPrevName] = useState(config.full_name);

  if (prevName !== config.full_name) {
    setPrevName(config.full_name);
    setLocalName(config.full_name);
  }

  const handleSaveName = () => {
    if (!localName.trim()) {
      alert("Nama tidak boleh kosong");
      return;
    }
    onRename(localName);
  };

  const renderCharControls = (layer: CharLayer) => {
    const uploadRef = layer === 'char-bg' ? charBgUploadRef : charFgUploadRef;
    const pos = layer === 'char-bg' ? config.char_bg_pos : config.char_fg_pos;
    const scale = layer === 'char-bg' ? config.char_bg_scale : config.char_fg_scale;
    const imageUrl = charLayerUrls[layer];

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
          <Label>Gambar {layer}</Label>
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
                  handleCharUpload(layer, file);
                  event.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => uploadRef.current?.click()}
                disabled={uploadingCharLayer === layer}
              >
                {uploadingCharLayer === layer ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="truncate">Mengunggah...</span>
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    <span className="truncate">Unggah</span>
                  </>
                )}
              </Button>
              <Button 
                type="button" 
                variant="secondary" 
                size="sm"
                className="w-full justify-start"
                onClick={() => setAssetPickerTarget(layer)}
              >
                <Image className="mr-2 h-4 w-4" />
                <span className="truncate">Pilih Aset</span>
              </Button>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Label>X (center)</Label>
            <span className="font-mono text-muted-foreground">{pos.x}px</span>
          </div>
          <Slider
            value={[pos.x]}
            min={-200}
            max={200}
            step={1}
            onValueChange={([value]) => applyLayerProperty(layer, 'x', value)}
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
            <span className="font-mono text-muted-foreground">{pos.y}px</span>
          </div>
          <Slider
            value={[pos.y]}
            min={-200}
            max={200}
            step={1}
            onValueChange={([value]) => applyLayerProperty(layer, 'y', value)}
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
            <span className="font-mono text-muted-foreground">{scale}%</span>
          </div>
          <Slider
            value={[scale]}
            min={40}
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

  const renderNameControls = () => {
    const layer = 'name';
    const pos = config.name_pos;
    const scale = config.name_scale;

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
          <div className="flex items-center justify-between text-xs">
            <Label>X (center)</Label>
            <span className="font-mono text-muted-foreground">{pos.x}px</span>
          </div>
          <Slider
            value={[pos.x]}
            min={-200}
            max={200}
            step={1}
            onValueChange={([value]) => applyLayerProperty(layer, 'x', value)}
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
            <span className="font-mono text-muted-foreground">{pos.y}px</span>
          </div>
          <Slider
            value={[pos.y]}
            min={-200}
            max={200}
            step={1}
            onValueChange={([value]) => applyLayerProperty(layer, 'y', value)}
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
            <Label>Font Size</Label>
            <span className="font-mono text-muted-foreground">{scale}px</span>
          </div>
          <Slider
            value={[scale]}
            min={30}
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

        <div className="space-y-2">
          <Label>Text Shadow Color</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={ensureHexColor(config.text_shadow_color)}
              onChange={(e) => commitConfig((prev) => ({ ...prev, text_shadow_color: e.target.value }))}
              className="h-10 w-12 rounded-md border bg-transparent"
            />
            <Input
              type="text"
              value={config.text_shadow_color || '#000000'}
              onChange={(e) => commitConfig((prev) => ({ ...prev, text_shadow_color: e.target.value }))}
              className="font-mono uppercase"
            />
          </div>
        </div>
      </section>
    );
  };

  const renderHpBarControls = () => {
    const layer = 'hp-bar';
    const pos = config.hp_bar_pos;
    const scale = config.hp_bar_scale;
    const current = config.hp_bar_current;
    const max = config.hp_bar_max;
    const hue = config.hp_bar_hue;
    const fontSize = config.hp_bar_font_size || 31;

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
          <div className="flex items-center justify-between text-xs">
            <Label>X (center)</Label>
            <span className="font-mono text-muted-foreground">{pos.x}px</span>
          </div>
          <Slider
            value={[pos.x]}
            min={-200}
            max={200}
            step={1}
            onValueChange={([value]) => applyLayerProperty(layer, 'x', value)}
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
            <span className="font-mono text-muted-foreground">{pos.y}px</span>
          </div>
          <Slider
            value={[pos.y]}
            min={-200}
            max={200}
            step={1}
            onValueChange={([value]) => applyLayerProperty(layer, 'y', value)}
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
            <span className="font-mono text-muted-foreground">{scale}%</span>
          </div>
          <Slider
            value={[scale]}
            min={30}
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

        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>Current Value</Label>
                <Input 
                    type="number" 
                    value={current} 
                    onChange={(e) => commitConfig(prev => ({ ...prev, hp_bar_current: parseInt(e.target.value) || 0 }))}
                />
            </div>
            <div className="space-y-2">
                <Label>Max Value</Label>
                <Input 
                    type="number" 
                    value={max} 
                    onChange={(e) => commitConfig(prev => ({ ...prev, hp_bar_max: parseInt(e.target.value) || 0 }))}
                />
            </div>
        </div>

        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
                <Label>Hue</Label>
                <span className="font-mono text-muted-foreground">{hue}°</span>
            </div>
            <Slider
                value={[hue]}
                min={0}
                max={360}
                step={1}
                onValueChange={([value]) => commitConfig(prev => ({ ...prev, hp_bar_hue: value }))}
            />
        </div>

        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
                <Label>Font Size</Label>
                <span className="font-mono text-muted-foreground">{fontSize}px</span>
            </div>
            <Slider
                value={[fontSize]}
                min={10}
                max={100}
                step={1}
                onValueChange={([value]) => commitConfig(prev => ({ ...prev, hp_bar_font_size: value }))}
            />
        </div>
      </section>
    );
  };

  return (
    <Card className="rounded-2xl">
      <ScrollArea className="h-[calc(100vh-160px)]">
        <CardContent className="space-y-6 p-4">
          <section className="space-y-2">
            <Label>Nama Hero</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveName();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleSaveName}
                title="Simpan Nama"
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Layer Aktif</Label>
              <Badge variant="outline" className="capitalize">
                {activeLayer}
              </Badge>
            </div>
          </section>

          {activeLayer === 'card' && (
            <section className="space-y-3">
              <Label>Tint Frame</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={ensureHexColor(config.tint)}
                  onChange={(e) => commitConfig((prev) => ({ ...prev, tint: e.target.value }))}
                  className="h-10 w-12 rounded-md border bg-transparent"
                />
                <Input
                  type="text"
                  value={config.tint}
                  onChange={(e) => commitConfig((prev) => ({ ...prev, tint: e.target.value }))}
                  className="font-mono uppercase"
                />
              </div>
              <Button type="button" variant="outline" onClick={() => setAssetPickerTarget('card')}>
                <Image className="mr-2 h-4 w-4" />
                Pilih Card Image
              </Button>
            </section>
          )}

          {(activeLayer === 'char-bg' || activeLayer === 'char-fg') && (
            renderCharControls(activeLayer)
          )}

          {activeLayer === 'name' && renderNameControls()}

          {activeLayer === 'hp-bar' && renderHpBarControls()}

          {(activeLayer === 'mask-bg' || activeLayer === 'mask-fg') && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Mask Layer</Label>
                <Badge variant="outline">{activeLayer}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Draw langsung pada mask. Posisi dan scale mengikuti {activeLayer === 'mask-bg' ? 'char-bg' : 'char-fg'}.
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
                  Hapus
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
              <Button type="button" variant="outline" onClick={() => clearMaskLayer(activeLayer)}>
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
