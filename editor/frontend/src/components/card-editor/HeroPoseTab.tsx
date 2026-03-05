import { type HeroConfig } from '@/types';

interface HeroPoseTabProps {
  config: HeroConfig;
  onChange: (updater: (prev: HeroConfig) => HeroConfig) => void;
}

export function HeroPoseTab({ config }: HeroPoseTabProps) {
  return (
    <div className="space-y-6 p-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Pose Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure pose settings for the character.
        </p>
        {/* Add pose controls here */}
        <div className="rounded-md border p-4">
          <pre className="text-xs">{JSON.stringify(config.pose || {}, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
