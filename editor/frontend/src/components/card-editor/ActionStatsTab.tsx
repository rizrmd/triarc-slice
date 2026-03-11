import { type ActionConfig, type TargetRule } from '@/types';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface ActionStatsTabProps {
  config: ActionConfig;
  onChange: (updater: (prev: ActionConfig) => ActionConfig) => void;
}

const TARGET_RULES: { value: TargetRule; label: string; desc: string }[] = [
  { value: 'enemy_single', label: 'Single Enemy', desc: 'Targets one enemy unit' },
  { value: 'ally_single', label: 'Single Ally', desc: 'Targets one ally unit' },
  { value: 'self', label: 'Self', desc: 'Targets the caster' },
];

const ELEMENTS = [
  { key: 'fire', label: 'Fire', color: 'bg-red-500', text: 'text-red-500', border: 'border-red-500' },
  { key: 'ice', label: 'Ice', color: 'bg-cyan-500', text: 'text-cyan-500', border: 'border-cyan-500' },
  { key: 'earth', label: 'Earth', color: 'bg-amber-700', text: 'text-amber-700', border: 'border-amber-700' },
  { key: 'wind', label: 'Wind', color: 'bg-green-500', text: 'text-green-500', border: 'border-green-500' },
  { key: 'light', label: 'Light', color: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500' },
  { key: 'shadow', label: 'Shadow', color: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500' },
] as const;

export function ActionStatsTab({ config, onChange }: ActionStatsTabProps) {
  const updateField = <K extends keyof ActionConfig>(key: K, value: ActionConfig[K]) => {
    onChange((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div className="space-y-6 p-4 max-w-4xl mx-auto">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Cost & Element */}
        <Card>
          <CardContent className="pt-6 space-y-6">
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
              <Label className="text-base font-semibold">Element</Label>
              <div className="grid grid-cols-3 gap-2">
                {ELEMENTS.map((el) => {
                  const isSelected = config.element === el.key;
                  return (
                    <button
                      key={el.key}
                      type="button"
                      onClick={() => updateField('element', el.key)}
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
          <CardContent className="pt-6 space-y-6">
            {/* Target Rule */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Targeting Rule</Label>
              <div className="grid gap-2">
                {TARGET_RULES.map((rule) => {
                  const isSelected = config.target_rule === rule.value;
                  return (
                    <button
                      key={rule.value}
                      type="button"
                      onClick={() => updateField('target_rule', rule.value)}
                      className={`
                        flex items-center justify-between p-3 rounded-lg border text-left transition-all
                        ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent'}
                      `}
                    >
                      <div>
                        <div className={`font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                          {rule.label}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {rule.desc}
                        </div>
                      </div>
                      {isSelected && <Badge variant="default">Active</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Description</Label>
              <Textarea
                value={config.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe the action's effect..."
                className="min-h-[100px] resize-none"
              />
              <p className="text-xs text-muted-foreground">
                This text appears on the card tooltip in-game.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
