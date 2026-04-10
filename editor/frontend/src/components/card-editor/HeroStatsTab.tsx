import { type HeroConfig, type HeroStats } from '@/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { GameMechanics } from '@/lib/game-mechanics';

interface HeroStatsTabProps {
  config: HeroConfig;
  onChange: (updater: (prev: HeroConfig) => HeroConfig) => void;
}

const DEFAULT_STATS: HeroStats = {
  max_hp: 0,
  attack: 0,
  defense: 0,
  element_affinity: {
    fire: 0,
    ice: 0,
    earth: 0,
    wind: 0,
    light: 0,
    shadow: 0,
  },
};

const ELEMENTS = [
  { key: 'fire', label: 'Fire', color: 'text-red-500' },
  { key: 'ice', label: 'Ice', color: 'text-cyan-500' },
  { key: 'earth', label: 'Earth', color: 'text-amber-700' },
  { key: 'wind', label: 'Wind', color: 'text-green-500' },
  { key: 'light', label: 'Light', color: 'text-yellow-500' },
  { key: 'shadow', label: 'Shadow', color: 'text-purple-500' },
] as const;

export function HeroStatsTab({ config, onChange }: HeroStatsTabProps) {
  const stats = config.stats || DEFAULT_STATS;

  // Simulator state
  const [simSkillPower, setSimSkillPower] = useState(100);
  const [simTargetDefense, setSimTargetDefense] = useState(50);
  const [simTargetAffinity, setSimTargetAffinity] = useState(0);
  const [simElement, setSimElement] = useState<keyof HeroStats['element_affinity']>('fire');

  const updateStat = (key: keyof HeroStats, value: number) => {
    onChange((prev) => {
      const currentStats = prev.stats || DEFAULT_STATS;
      
      const nextConfig = {
        ...prev,
        stats: {
          ...currentStats,
          [key]: value,
        },
      };

      if (key === 'max_hp' && value > 0) {
        nextConfig.hp_bar_max = value;
        nextConfig.hp_bar_current = value;
      }

      return nextConfig;
    });
  };

  const updateAffinity = (element: keyof HeroStats['element_affinity'], value: number) => {
    onChange((prev) => {
      const currentStats = prev.stats || DEFAULT_STATS;
      return {
        ...prev,
        stats: {
          ...currentStats,
          element_affinity: {
            ...currentStats.element_affinity,
            [element]: value,
          },
        },
      };
    });
  };

  const calculatedDamage = GameMechanics.calculateFinalElementalDamage(
    simSkillPower,
    stats.attack,
    stats.element_affinity?.[simElement] ?? 0,
    simTargetDefense,
    simTargetAffinity
  );

  return (
    <div className="space-y-8 p-4 max-w-4xl mx-auto">
      <TooltipProvider>
        <div className="grid gap-6 md:grid-cols-3">
          {/* Base Stats */}
          <Card className="md:col-span-3">
            <CardContent className="pt-6 grid gap-6 md:grid-cols-3">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold">Max HP</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{GameMechanics.descriptions.max_hp}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number"
                    value={stats.max_hp}
                    onChange={(e) => updateStat('max_hp', Number(e.target.value))}
                    className="w-20 h-8 text-right"
                  />
                </div>
                <Slider
                  value={[stats.max_hp]}
                  min={0}
                  max={5000}
                  step={10}
                  onValueChange={([val]) => updateStat('max_hp', val)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold">Attack</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{GameMechanics.descriptions.attack}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number"
                    value={stats.attack}
                    onChange={(e) => updateStat('attack', Number(e.target.value))}
                    className="w-20 h-8 text-right"
                  />
                </div>
                <Slider
                  value={[stats.attack]}
                  min={0}
                  max={500}
                  step={1}
                  onValueChange={([val]) => updateStat('attack', val)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold">Defense</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{GameMechanics.descriptions.defense}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number"
                    value={stats.defense}
                    onChange={(e) => updateStat('defense', Number(e.target.value))}
                    className="w-20 h-8 text-right"
                  />
                </div>
                <Slider
                  value={[stats.defense]}
                  min={0}
                  max={500}
                  step={1}
                  onValueChange={([val]) => updateStat('defense', val)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Element Affinity */}
          <div className="md:col-span-3">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold">Element Affinity</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p>{GameMechanics.descriptions.affinity}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ELEMENTS.map((element) => (
                <Card key={element.key}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-12 h-12 flex-shrink-0 bg-muted rounded-full p-2 flex items-center justify-center overflow-hidden cursor-help hover:ring-2 ring-primary/20 transition-all">
                          <img
                            src={`/assets/ui/elements/${element.key}.webp`}
                            alt={element.label}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <ul className="list-disc pl-3 space-y-1">
                          {GameMechanics.descriptions.affinity_effects(element.label).map((effect, i) => (
                            <li key={i}>{effect}</li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                    
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className={element.color}>{element.label}</Label>
                        <span className="text-sm font-mono">{stats.element_affinity?.[element.key] ?? 0}%</span>
                      </div>
                      <Slider
                        value={[stats.element_affinity?.[element.key] ?? 0]}
                        min={-100}
                        max={100}
                        step={1}
                        onValueChange={([val]) => updateAffinity(element.key, val)}
                        className={element.key === 'fire' ? '[&_.relative]:bg-red-100 [&_.absolute]:bg-red-500' : 
                                  element.key === 'ice' ? '[&_.relative]:bg-cyan-100 [&_.absolute]:bg-cyan-500' :
                                  element.key === 'earth' ? '[&_.relative]:bg-amber-100 [&_.absolute]:bg-amber-700' :
                                  element.key === 'wind' ? '[&_.relative]:bg-green-100 [&_.absolute]:bg-green-500' :
                                  element.key === 'light' ? '[&_.relative]:bg-yellow-100 [&_.absolute]:bg-yellow-500' :
                                  '[&_.relative]:bg-purple-100 [&_.absolute]:bg-purple-500'}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Combat Analysis */}
          <div className="md:col-span-3">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">Analysis:</span> Combat Impact
            </h3>
            
            <div className="grid gap-6 md:grid-cols-2">
              {/* Survivability */}
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-base font-semibold">Survivability</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Metrics derived from Max HP and Defense</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground">Damage Reduction</div>
                      <div className="text-2xl font-bold text-primary">
                        {(100 - GameMechanics.calculateDefenseMitigation(stats.defense) * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        from {stats.defense} Defense
                      </div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-sm text-muted-foreground">Effective HP</div>
                      <div className="text-2xl font-bold text-primary">
                        {GameMechanics.calculateEffectiveHP(stats.max_hp, stats.defense).toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Raw damage to kill
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Standard Attack */}
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-base font-semibold">Standard Attack</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Base output of a standard 100-power skill</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Base Skill Output</div>
                    <div className="text-2xl font-bold text-primary">
                      {GameMechanics.calculateRawActionPower(100, stats.attack).toFixed(0)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Before defense/affinity
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Elemental Impact Table */}
              <Card className="md:col-span-2">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Label className="text-base font-semibold">Elemental Impact Summary</Label>
                  </div>
                  
                  <div className="relative w-full overflow-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-muted-foreground border-b">
                        <tr>
                          <th className="pb-2 font-medium">Element</th>
                          <th className="pb-2 font-medium">Damage Output (Deal)</th>
                          <th className="pb-2 font-medium">Damage Input (Take)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {ELEMENTS.filter(el => (stats.element_affinity?.[el.key] ?? 0) !== 0).map(element => {
                          const affinity = stats.element_affinity?.[element.key] ?? 0;
                          const outMult = GameMechanics.calculateOutgoingAffinity(affinity);
                          const inMult = GameMechanics.calculateIncomingAffinity(affinity);
                          
                          return (
                            <tr key={element.key}>
                              <td className={`py-2 font-medium ${element.color}`}>
                                {element.label} ({affinity > 0 ? '+' : ''}{affinity}%)
                              </td>
                              <td className="py-2">
                                <span className={outMult > 1 ? 'text-green-600 font-medium' : outMult < 1 ? 'text-red-600' : ''}>
                                  {outMult.toFixed(2)}x
                                </span>
                                <span className="text-muted-foreground ml-2 text-xs">
                                  ({outMult > 1 ? '+' : ''}{Math.round((outMult - 1) * 100)}% Power)
                                </span>
                              </td>
                              <td className="py-2">
                                <span className={inMult < 1 ? 'text-green-600 font-medium' : inMult > 1 ? 'text-red-600' : ''}>
                                  {inMult.toFixed(2)}x
                                </span>
                                <span className="text-muted-foreground ml-2 text-xs">
                                  ({inMult > 1 ? '+' : ''}{Math.round((inMult - 1) * 100)}% Damage)
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {ELEMENTS.every(el => (stats.element_affinity?.[el.key] ?? 0) === 0) && (
                          <tr>
                            <td colSpan={3} className="py-4 text-center text-muted-foreground italic">
                              No elemental affinities configured.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Damage Simulator */}
          <Card className="md:col-span-3 border-dashed">
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-muted-foreground">Preview:</span> Damage Calculator
              </h3>
              
              <div className="grid gap-6 md:grid-cols-4 items-end">
                <div className="space-y-2">
                  <Label>Skill Power</Label>
                  <Input 
                    type="number" 
                    value={simSkillPower} 
                    onChange={(e) => setSimSkillPower(Number(e.target.value))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Element</Label>
                  <select 
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={simElement}
                    onChange={(e) => setSimElement(e.target.value as keyof HeroStats['element_affinity'])}
                  >
                    {ELEMENTS.map(el => (
                      <option key={el.key} value={el.key}>{el.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Target Defense</Label>
                  <Input 
                    type="number" 
                    value={simTargetDefense} 
                    onChange={(e) => setSimTargetDefense(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Target Affinity (%)</Label>
                  <Input 
                    type="number" 
                    value={simTargetAffinity} 
                    onChange={(e) => setSimTargetAffinity(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg flex justify-between items-center">
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>Raw Power: {GameMechanics.calculateRawActionPower(simSkillPower, stats.attack).toFixed(0)}</div>
                  <div>Outgoing Affinity: x{GameMechanics.calculateOutgoingAffinity(stats.element_affinity?.[simElement] ?? 0).toFixed(2)}</div>
                  <div>Defense Mitigation: x{GameMechanics.calculateDefenseMitigation(simTargetDefense).toFixed(2)}</div>
                  <div>Incoming Affinity: x{GameMechanics.calculateIncomingAffinity(simTargetAffinity).toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-muted-foreground">Estimated Damage</div>
                  <div className="text-3xl font-bold text-primary">{calculatedDamage.toFixed(0)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    </div>
  );
}
