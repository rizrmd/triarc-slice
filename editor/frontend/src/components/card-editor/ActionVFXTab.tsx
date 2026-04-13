import { useCallback, useEffect, useState } from 'react';
import { type ActionConfig, type ActionVFXConfig, type VFXFile } from '@/types';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Zap, Target } from 'lucide-react';

interface ActionVFXTabProps {
  config: ActionConfig;
  onChange: (updater: (prev: ActionConfig) => ActionConfig) => void;
  slug: string;
}

const DEFAULT_VFX: ActionVFXConfig = {
  enabled: false,
  effect_file: '',
  targets: {
    caster: false,
    target: true,
  },
  position_offset: {
    x: 0,
    y: -50,
  },
  scale_multiplier: 1.5,
};

export function ActionVFXTab({ config, onChange, slug }: ActionVFXTabProps) {
  const [availableEffects, setAvailableEffects] = useState<VFXFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const vfx = { ...DEFAULT_VFX, ...config.vfx };

  // Scan the vfx folder for available effects
  const scanVFXXFolder = useCallback(async () => {
    setScanning(true);
    try {
      const response = await fetch(`/api/action-vfx/${slug}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableEffects(data.effects || []);
      } else {
        console.error('Failed to scan VFX folder:', response.status);
        setAvailableEffects([]);
      }
    } catch (err) {
      console.error('Error scanning VFX folder:', err);
      setAvailableEffects([]);
    } finally {
      setScanning(false);
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    void scanVFXXFolder().finally(() => setLoading(false));
  }, [scanVFXXFolder]);

  const updateVFX = <K extends keyof ActionVFXConfig>(
    key: K,
    value: ActionVFXConfig[K]
  ) => {
    onChange((prev) => ({
      ...prev,
      vfx: {
        ...DEFAULT_VFX,
        ...prev.vfx,
        [key]: value,
      },
    }));
  };

  const updateTarget = (target: 'caster' | 'target', enabled: boolean) => {
    onChange((prev) => ({
      ...prev,
      vfx: {
        ...DEFAULT_VFX,
        ...prev.vfx,
        targets: {
          ...DEFAULT_VFX.targets,
          ...prev.vfx?.targets,
          [target]: enabled,
        },
      },
    }));
  };

  const updateOffset = (axis: 'x' | 'y', value: number) => {
    onChange((prev) => ({
      ...prev,
      vfx: {
        ...DEFAULT_VFX,
        ...prev.vfx,
        position_offset: {
          ...DEFAULT_VFX.position_offset,
          ...prev.vfx?.position_offset,
          [axis]: value,
        },
      },
    }));
  };

  const selectEffect = (filename: string) => {
    updateVFX('effect_file', filename);
    updateVFX('enabled', true);
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid gap-6 md:grid-cols-2">
        {/* VFX Toggle & Effect Selection */}
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <Label className="text-base font-semibold">Visual Effects</Label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {vfx.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <Switch
                  checked={vfx.enabled}
                  onCheckedChange={(checked) => updateVFX('enabled', checked)}
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              VFX plays on the target hero when the action cast completes.
              The effect is positioned at the hero&apos;s center with optional offset.
            </p>

            {loading || scanning ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Sparkles className="h-5 w-5 mr-2 animate-pulse" />
                Scanning VFX folder...
              </div>
            ) : availableEffects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No VFX effects found in the vfx/ folder.</p>
                <p className="text-xs mt-2">
                  Add .efkefc files to data/action/{slug}/vfx/
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Available Effects</Label>
                <div className="grid grid-cols-2 gap-2">
                  {availableEffects.map((effect) => (
                    <button
                      key={effect.filename}
                      type="button"
                      onClick={() => selectEffect(effect.filename)}
                      className={`
                        flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left
                        ${vfx.effect_file === effect.filename && vfx.enabled
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent bg-muted hover:bg-accent/50'
                        }
                      `}
                    >
                      <Zap className="h-4 w-4 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {effect.name}
                        </p>
                      </div>
                      {vfx.effect_file === effect.filename && vfx.enabled && (
                        <Badge variant="secondary" className="ml-auto flex-shrink-0">
                          Active
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void scanVFXXFolder()}
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  Rescan folder
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* VFX Options (only show when enabled and effect selected) */}
        {vfx.enabled && vfx.effect_file && (
          <>
            {/* Target Selection */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="h-5 w-5 text-primary" />
                  <Label className="text-base font-semibold">VFX Targets</Label>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Caster</p>
                      <p className="text-xs text-muted-foreground">
                        Play on the hero casting
                      </p>
                    </div>
                    <Switch
                      checked={vfx.targets.caster}
                      onCheckedChange={(checked) => updateTarget('caster', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Target</p>
                      <p className="text-xs text-muted-foreground">
                        Play on the action target
                      </p>
                    </div>
                    <Switch
                      checked={vfx.targets.target}
                      onCheckedChange={(checked) => updateTarget('target', checked)}
                    />
                  </div>

                  {!vfx.targets.caster && !vfx.targets.target && (
                    <p className="text-xs text-amber-500">
                      At least one target must be selected
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Position & Scale */}
            <Card>
              <CardContent className="pt-6">
                <Label className="text-base font-semibold mb-4 block">
                  Position & Scale
                </Label>

                <div className="space-y-6">
                  {/* X Offset */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">X Offset</span>
                      <span className="text-lg font-bold text-primary">
                        {vfx.position_offset.x}
                      </span>
                    </div>
                    <Slider
                      value={[vfx.position_offset.x]}
                      min={-200}
                      max={200}
                      step={10}
                      onValueChange={([val]) => updateOffset('x', val)}
                    />
                  </div>

                  {/* Y Offset */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Y Offset</span>
                      <span className="text-lg font-bold text-primary">
                        {vfx.position_offset.y}
                      </span>
                    </div>
                    <Slider
                      value={[vfx.position_offset.y]}
                      min={-200}
                      max={50}
                      step={10}
                      onValueChange={([val]) => updateOffset('y', val)}
                    />
                  </div>

                  {/* Scale Multiplier */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Scale</span>
                      <span className="text-lg font-bold text-primary">
                        {vfx.scale_multiplier.toFixed(1)}x
                      </span>
                    </div>
                    <Slider
                      value={[vfx.scale_multiplier * 10]}
                      min={5}
                      max={50}
                      step={1}
                      onValueChange={([val]) => updateVFX('scale_multiplier', val / 10)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Adjust VFX size relative to default
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Preview Info */}
            <Card className="md:col-span-2">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Current Effect</p>
                    <p className="text-xs text-muted-foreground">
                      {vfx.effect_file}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {vfx.targets.caster && 'Caster'}
                    {vfx.targets.caster && vfx.targets.target && ' + '}
                    {vfx.targets.target && 'Target'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
