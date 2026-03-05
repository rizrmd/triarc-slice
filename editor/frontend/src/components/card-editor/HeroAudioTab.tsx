import { type HeroConfig } from '@/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Music } from 'lucide-react';

interface HeroAudioTabProps {
  config: HeroConfig;
  onChange: (updater: (prev: HeroConfig) => HeroConfig) => void;
}

export function HeroAudioTab({ config, onChange }: HeroAudioTabProps) {
  const handleAudioChange = (key: string, value: string) => {
    onChange((prev) => ({
      ...prev,
      audio: {
        ...prev.audio,
        [key]: value,
      },
    }));
  };

  const addAudio = () => {
    onChange((prev) => ({
      ...prev,
      audio: {
        ...prev.audio,
        'New Action': '',
      },
    }));
  };

  const removeAudio = (key: string) => {
    onChange((prev) => {
      const newAudio = { ...prev.audio };
      delete newAudio[key];
      return { ...prev, audio: newAudio };
    });
  };

  const renameAudioKey = (oldKey: string, newKey: string) => {
    onChange((prev) => {
      const audio = prev.audio || {};
      const value = audio[oldKey];
      const newAudio = { ...audio };
      delete newAudio[oldKey];
      newAudio[newKey] = value;
      return { ...prev, audio: newAudio };
    });
  };

  const audioMap = config.audio || {};

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Audio Responses</Label>
          <Button variant="outline" size="sm" onClick={addAudio}>
            <Plus className="mr-2 h-4 w-4" /> Add Audio
          </Button>
        </div>
        
        <div className="space-y-2">
          {Object.entries(audioMap).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <Input
                value={key}
                onChange={(e) => renameAudioKey(key, e.target.value)}
                className="w-1/3"
                placeholder="Action (e.g. Attack)"
              />
              <div className="relative flex-1">
                <Music className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={value}
                  onChange={(e) => handleAudioChange(key, e.target.value)}
                  className="pl-9"
                  placeholder="Audio file path..."
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeAudio(key)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {Object.keys(audioMap).length === 0 && (
            <div className="text-sm text-muted-foreground italic">No audio responses defined.</div>
          )}
        </div>
      </div>
    </div>
  );
}
