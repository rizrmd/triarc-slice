import { type HeroConfig } from '@/types';
import { type ChangeEvent } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface HeroInfoTabProps {
  config: HeroConfig;
  onChange: (updater: (prev: HeroConfig) => HeroConfig) => void;
}

export function HeroInfoTab({ config, onChange }: HeroInfoTabProps) {
  const handleLoreChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    onChange((prev) => ({ ...prev, lore: value }));
  };

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
    </div>
  );
}
