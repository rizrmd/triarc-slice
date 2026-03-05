import { type HeroConfig } from '@/types';
import { type ChangeEvent } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';

interface HeroInfoTabProps {
  config: HeroConfig;
  onChange: (updater: (prev: HeroConfig) => HeroConfig) => void;
}

export function HeroInfoTab({ config, onChange }: HeroInfoTabProps) {
  const handleLoreChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    onChange((prev) => ({ ...prev, lore: value }));
  };

  const handleStatChange = (key: string, value: string | number) => {
    onChange((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        [key]: value,
      },
    }));
  };

  const addStat = () => {
    onChange((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        'New Stat': 0,
      },
    }));
  };

  const removeStat = (key: string) => {
    onChange((prev) => {
      const newStats = { ...prev.stats };
      delete newStats[key];
      return { ...prev, stats: newStats };
    });
  };

  const renameStat = (oldKey: string, newKey: string) => {
    onChange((prev) => {
      const stats = prev.stats || {};
      const value = stats[oldKey];
      const newStats = { ...stats };
      delete newStats[oldKey];
      newStats[newKey] = value;
      return { ...prev, stats: newStats };
    });
  };

  const stats = config.stats || {};

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-2">
        <Label htmlFor="lore">Lore</Label>
        <Textarea
          id="lore"
          placeholder="Enter hero lore..."
          value={config.lore || ''}
          onChange={handleLoreChange}
          className="min-h-[150px]"
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Stats</Label>
          <Button variant="outline" size="sm" onClick={addStat}>
            <Plus className="mr-2 h-4 w-4" /> Add Stat
          </Button>
        </div>
        
        <div className="space-y-2">
          {Object.entries(stats).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <Input
                value={key}
                onChange={(e) => renameStat(key, e.target.value)}
                className="w-1/3"
                placeholder="Stat Name"
              />
              <Input
                value={value}
                onChange={(e) => {
                    const val = e.target.value;
                    const num = parseFloat(val);
                    handleStatChange(key, isNaN(num) ? val : num);
                }}
                className="flex-1"
                placeholder="Value"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeStat(key)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {Object.keys(stats).length === 0 && (
            <div className="text-sm text-muted-foreground italic">No stats defined.</div>
          )}
        </div>
      </div>
    </div>
  );
}
