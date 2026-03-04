import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AssetPickerTarget, AssetItem } from '@/types';

interface AssetPickerProps {
  target: AssetPickerTarget;
  onSelect: (item: AssetItem) => void;
  onClose: () => void;
  applying: boolean;
}

export function AssetPicker({ target, onSelect, onClose, applying }: AssetPickerProps) {
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    const category = target === 'card' ? 'ui' : 'characters';
    setLoading(true);
    setError(null);
    
    fetch(`/api/assets/${category}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load assets');
        return res.json() as Promise<AssetItem[]>;
      })
      .then((data) => {
        setItems(data);
      })
      .catch((err: Error) => {
        setItems([]);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [target]);

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="flex h-full max-h-[80vh] w-full max-w-5xl flex-col rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            {target === 'card' ? 'Pilih Card Image dari assets/ui' : 'Pilih Character dari assets/characters'}
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={applying}>
            Tutup
          </Button>
        </div>
        <ScrollArea className="h-full">
          <div className="grid gap-3 p-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {loading ? (
              <div className="col-span-full flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat aset...
              </div>
            ) : error ? (
              <div className="col-span-full text-sm text-red-500">{error}</div>
            ) : items.length === 0 ? (
              <div className="col-span-full text-sm text-muted-foreground">Aset tidak ditemukan.</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => onSelect(item)}
                  disabled={applying}
                  className="group relative overflow-hidden rounded-lg border text-left transition hover:border-primary hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="aspect-square w-full overflow-hidden bg-muted">
                    <img 
                      src={item.url} 
                      alt={item.name} 
                      className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105" 
                    />
                  </div>
                  <div className="truncate border-t px-2 py-2 text-xs text-muted-foreground font-medium bg-card/50">
                    {item.name}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
