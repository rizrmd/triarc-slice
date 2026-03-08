import { type HeroConfig } from '@/types';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Music, Play, Pause, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';

interface HeroAudioTabProps {
  config: HeroConfig;
  onChange: (updater: (prev: HeroConfig) => HeroConfig) => void;
  slug: string;
}

const STANDARD_AUDIO_KEYS = [
  'CastingLowAffinity',
  'CastingHighAffinity',
  'DamageNormal',
  'DamageCritical',
  'DamageBlocked',
  'Die',
  'ActionReject',
];

export function HeroAudioTab({ config, onChange, slug }: HeroAudioTabProps) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleFileUpload = async (key: string, file: File) => {
    if (!slug) return;
    setUploadingKey(key);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/card-audio/${slug}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      
      onChange((prev) => {
        const newAudio = { ...(prev.audio || {}) };
        newAudio[key] = data.path;
        return {
          ...prev,
          audio: newAudio,
        };
      });
    } catch (error) {
      console.error('Failed to upload audio:', error);
      alert('Failed to upload audio file');
    } finally {
      setUploadingKey(null);
    }
  };

  const togglePlay = (key: string, path: string) => {
    if (playingKey === key) {
      audioRef.current?.pause();
      setPlayingKey(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(path);
    audioRef.current = audio;
    audio.onended = () => setPlayingKey(null);
    audio.play().catch((err) => {
      console.error('Failed to play audio:', err);
      setPlayingKey(null);
    });
    setPlayingKey(key);
  };

  const audioMap = config.audio || {};

  return (
    <div className="space-y-8 p-4">
      {/* Standard Audio Reactions */}
      <div className="space-y-4">
        <Label className="text-lg font-semibold">Standard Reactions</Label>
        <div className="grid gap-4">
          {STANDARD_AUDIO_KEYS.map((key) => (
            <div key={key} className="grid grid-cols-[150px_1fr_auto] items-center gap-4">
              <Label htmlFor={`audio-${key}`} className="text-right text-muted-foreground">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </Label>
              
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <div className="flex items-center h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
                        <Music className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate text-foreground flex-1 font-medium">
                            {audioMap[key] ? audioMap[key].split('/').pop() : 'Click to upload audio...'}
                        </span>
                    </div>
                    <input
                        id={`audio-${key}`}
                        type="file"
                        accept=".wav,.mp3,.ogg"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(key, file);
                            // Reset value so same file can be selected again if needed
                            e.target.value = '';
                        }}
                        disabled={uploadingKey === key}
                    />
                </div>
              </div>

              <div className="flex items-center gap-2">
                 {uploadingKey === key ? (
                    <Button variant="ghost" size="icon" disabled>
                        <Loader2 className="h-4 w-4 animate-spin" />
                    </Button>
                 ) : (
                    <Button
                        variant="ghost" 
                        size="icon"
                        disabled={!audioMap[key]}
                        onClick={() => audioMap[key] && togglePlay(key, audioMap[key])}
                        className={playingKey === key ? "text-primary" : ""}
                    >
                        {playingKey === key ? (
                            <Pause className="h-4 w-4" />
                        ) : (
                            <Play className="h-4 w-4" />
                        )}
                    </Button>
                 )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
