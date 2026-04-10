import { type ActionConfig, type ActionGameplay, type ActionTargeting, type EffectKind, type StatusKind, type TargetScope, type TargetSelection, type TargetSide } from '@/types';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { normalizeTargeting, targetingToTargetRule } from '@/lib/targeting';

interface ActionStatsTabProps {
  config: ActionConfig;
  onChange: (updater: (prev: ActionConfig) => ActionConfig) => void;
}

const ELEMENTS = [
  { key: 'fire', label: 'Fire', color: 'bg-red-500', text: 'text-red-500', border: 'border-red-500' },
  { key: 'ice', label: 'Ice', color: 'bg-cyan-500', text: 'text-cyan-500', border: 'border-cyan-500' },
  { key: 'earth', label: 'Earth', color: 'bg-amber-700', text: 'text-amber-700', border: 'border-amber-700' },
  { key: 'wind', label: 'Wind', color: 'bg-green-500', text: 'text-green-500', border: 'border-green-500' },
  { key: 'light', label: 'Light', color: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500' },
  { key: 'shadow', label: 'Shadow', color: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500' },
] as const;

const EFFECT_KINDS: { value: EffectKind; label: string }[] = [
  { value: 'damage', label: 'Damage' },
  { value: 'heal', label: 'Heal' },
  { value: 'shield', label: 'Shield' },
  { value: 'status', label: 'Status' },
  { value: 'damage_and_status', label: 'Damage + Status' },
  { value: 'cleanse', label: 'Cleanse' },
];

const STATUS_KINDS: { value: StatusKind | ''; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'stun', label: 'Stun' },
  { value: 'shield', label: 'Shield Buff' },
  { value: 'attack_buff', label: 'Attack Buff' },
  { value: 'defense_buff', label: 'Defense Buff' },
  { value: 'dot', label: 'Damage over Time' },
  { value: 'hot', label: 'Heal over Time' },
];

const DEFAULT_GAMEPLAY: ActionGameplay = {
  casting_time_ms: 1000,
  effect_kind: 'damage',
  base_power: 10,
  status_kind: null,
  status_duration_ms: 0,
  status_value: 0,
};

export function ActionStatsTab({ config, onChange }: ActionStatsTabProps) {
  const updateField = <K extends keyof ActionConfig>(key: K, value: ActionConfig[K]) => {
    onChange((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateTargeting = <K extends keyof ActionTargeting>(key: K, value: ActionTargeting[K]) => {
    const targeting = {
      ...normalizeTargeting(config.targeting, config.target_rule),
      [key]: value,
    };
    onChange((prev) => ({
      ...prev,
      targeting,
      target_rule: targetingToTargetRule(targeting),
    }));
  };

  const gameplay = { ...DEFAULT_GAMEPLAY, ...config.gameplay };

  const updateGameplay = <K extends keyof ActionGameplay>(key: K, value: ActionGameplay[K]) => {
    onChange((prev) => ({
      ...prev,
      gameplay: { ...DEFAULT_GAMEPLAY, ...prev.gameplay, [key]: value },
    }));
  };

  const selectedElements = Array.isArray(config.element) ? config.element : [];
  const targeting = normalizeTargeting(config.targeting, config.target_rule);

  const hasStatus = gameplay.effect_kind === 'status' || gameplay.effect_kind === 'damage_and_status';

  const toggleElement = (elementKey: string) => {
    const nextElements = selectedElements.includes(elementKey)
      ? selectedElements.filter((key) => key !== elementKey)
      : [...selectedElements, elementKey];

    updateField('element', nextElements);
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Cost & Element */}
        <Card>
          <CardContent className="space-y-6 pt-6">
            {/* Energy Cost */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">Energy Cost</Label>
                <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-primary">{config.cost || 0}</span>
                    <span className="text-xs text-muted-foreground uppercase">Energy</span>
                </div>
              </div>
              <Slider
                value={[config.cost || 0]}
                min={0}
                max={10}
                step={1}
                onValueChange={([val]) => updateField('cost', val)}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground px-1">
                <span>0</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>

            {/* Element Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-base font-semibold">Element</Label>
                <span className="text-xs uppercase text-muted-foreground">
                  {selectedElements.length} selected
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ELEMENTS.map((el) => {
                  const isSelected = selectedElements.includes(el.key);
                  return (
                    <button
                      key={el.key}
                      type="button"
                      onClick={() => toggleElement(el.key)}
                      className={`
                        relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all
                        ${isSelected ? `${el.border} bg-accent` : 'border-transparent bg-muted hover:bg-accent/50'}
                      `}
                    >
                      <div className={`w-3 h-3 rounded-full mb-2 ${el.color}`} />
                      <span className={`text-sm font-medium ${isSelected ? el.text : 'text-muted-foreground'}`}>
                        {el.label}
                      </span>
                      {isSelected && (
                        <div className={`absolute inset-0 rounded-lg ring-2 ring-offset-2 ${el.border} opacity-20`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Targeting & Description */}
        <Card>
          <CardContent className="flex flex-col pt-6 space-y-4">
            <div className="space-y-3">
              <Label className="text-base font-semibold">Targeting</Label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs uppercase text-muted-foreground">Side</span>
                  <select
                    value={targeting.side}
                    onChange={(e) => updateTargeting('side', e.target.value as TargetSide)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="enemy">Enemy</option>
                    <option value="ally">Ally</option>
                    <option value="any">Any</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase text-muted-foreground">Selection</span>
                  <select
                    value={targeting.selection}
                    onChange={(e) => updateTargeting('selection', e.target.value as TargetSelection)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="manual">Manual</option>
                    <option value="auto">Auto</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase text-muted-foreground">Scope</span>
                  <select
                    value={targeting.scope}
                    onChange={(e) => updateTargeting('scope', e.target.value as TargetScope)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="single">Single</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(targeting.allow_self)}
                    onChange={(e) => updateTargeting('allow_self', e.target.checked)}
                  />
                  <span>Allow self target</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Wire format rule: <code>{targetingToTargetRule(targeting)}</code>
              </p>
            </div>
            <div className="flex flex-1 flex-col space-y-2">
              <Label className="text-base font-semibold">Description</Label>
              <Textarea
                value={config.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe the action's effect..."
                className="min-h-0 flex-1 w-full resize-none"
              />
              <p className="text-xs text-muted-foreground">
                This text appears on the card tooltip in-game.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Gameplay Stats */}
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <Label className="text-base font-semibold mb-4 block">Gameplay</Label>
            <div className="grid gap-6 md:grid-cols-3">
              {/* Effect Kind */}
              <label className="space-y-2">
                <span className="text-xs uppercase text-muted-foreground">Effect Kind</span>
                <select
                  value={gameplay.effect_kind}
                  onChange={(e) => updateGameplay('effect_kind', e.target.value as EffectKind)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {EFFECT_KINDS.map((ek) => (
                    <option key={ek.value} value={ek.value}>{ek.label}</option>
                  ))}
                </select>
              </label>

              {/* Base Power */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase text-muted-foreground">Base Power</span>
                  <span className="text-lg font-bold text-primary">{gameplay.base_power}</span>
                </div>
                <Slider
                  value={[gameplay.base_power]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([val]) => updateGameplay('base_power', val)}
                  className="py-2"
                />
              </div>

              {/* Casting Time */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase text-muted-foreground">Casting Time</span>
                  <span className="text-lg font-bold text-primary">{(gameplay.casting_time_ms / 1000).toFixed(1)}s</span>
                </div>
                <Slider
                  value={[gameplay.casting_time_ms]}
                  min={0}
                  max={5000}
                  step={100}
                  onValueChange={([val]) => updateGameplay('casting_time_ms', val)}
                  className="py-2"
                />
              </div>

              {/* Status Kind */}
              <label className="space-y-2">
                <span className="text-xs uppercase text-muted-foreground">Status Kind</span>
                <select
                  value={gameplay.status_kind || ''}
                  onChange={(e) => updateGameplay('status_kind', (e.target.value || null) as StatusKind | null)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {STATUS_KINDS.map((sk) => (
                    <option key={sk.value} value={sk.value}>{sk.label}</option>
                  ))}
                </select>
              </label>

              {/* Status Duration */}
              {hasStatus && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase text-muted-foreground">Status Duration</span>
                    <span className="text-lg font-bold text-primary">{(gameplay.status_duration_ms / 1000).toFixed(1)}s</span>
                  </div>
                  <Slider
                    value={[gameplay.status_duration_ms]}
                    min={0}
                    max={10000}
                    step={500}
                    onValueChange={([val]) => updateGameplay('status_duration_ms', val)}
                    className="py-2"
                  />
                </div>
              )}

              {/* Status Value */}
              {hasStatus && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase text-muted-foreground">Status Value</span>
                    <span className="text-lg font-bold text-primary">{gameplay.status_value}</span>
                  </div>
                  <input
                    type="number"
                    value={gameplay.status_value}
                    onChange={(e) => updateGameplay('status_value', parseInt(e.target.value) || 0)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Negative values debuff the target.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
