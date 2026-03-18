import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ASPECT_PRESETS } from '@/lib/godot';
import type { ViewportConfig } from '@/lib/godot';

export { ASPECT_PRESETS };
export type AspectPreset = ViewportConfig;

export default function GameLayoutPicker() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-4 p-4 border-b bg-card">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold">Game Layout Editor - Choose Aspect Ratio</h1>
      </header>
      <div className="flex-1 p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {ASPECT_PRESETS.map(preset => {
            const scale = 200 / preset.height;
            const previewW = Math.round(preset.width * scale);
            const previewH = 200;
            return (
              <Link
                key={preset.slug}
                to={`/game-layout/${preset.slug}`}
                className="group flex flex-col items-center gap-3 p-4 rounded-xl border bg-card hover:border-blue-500 hover:shadow-lg transition-all"
              >
                <div
                  className="border border-gray-600 bg-gray-900 rounded"
                  style={{ width: previewW, height: previewH }}
                />
                <div className="text-center">
                  <div className="font-bold text-sm">{preset.label}</div>
                  <div className="text-xs text-muted-foreground">{preset.desc}</div>
                  <div className="text-xs text-muted-foreground">{preset.width}x{preset.height}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
