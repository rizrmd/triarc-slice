import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Search, Plus, Trash, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { AnimapConfig, AnimapLayer } from '@/types';

type AnimapListItem = {
  slug: string;
  config: AnimapConfig | null;
};

function buildCssFilter(layer: AnimapLayer): string | undefined {
  const parts: string[] = [];
  if (layer.hue !== undefined && layer.hue !== 0) parts.push(`hue-rotate(${layer.hue}deg)`);
  if (layer.saturation !== undefined && layer.saturation !== 100) parts.push(`saturate(${layer.saturation}%)`);
  if (layer.lightness !== undefined && layer.lightness !== 100) parts.push(`brightness(${layer.lightness}%)`);
  if (layer.brightness !== undefined && layer.brightness !== 100) parts.push(`brightness(${layer.brightness}%)`);
  if (layer.contrast !== undefined && layer.contrast !== 100) parts.push(`contrast(${layer.contrast}%)`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function VideoThumbnail({ src, alt }: { src: string; alt: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const seekToThumbnailFrame = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        video.currentTime = 0;
        return;
      }
      video.currentTime = Math.min(0.1, video.duration);
    };

    const handleLoadedMetadata = () => {
      seekToThumbnailFrame();
    };

    const handleSeeked = () => {
      video.pause();
    };

    video.pause();
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      preload="metadata"
      aria-label={alt}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        pointerEvents: 'none',
      }}
    />
  );
}

function AnimapThumbnail({ slug, config }: { slug: string; config: AnimapConfig | null }) {
  if (!config) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/20 text-xs text-muted-foreground">
        No preview
      </div>
    );
  }

  const visibleLayers = config.layers.filter((layer) => layer.visible && layer.type !== 'mask' && layer.file);
  const aspectRatio = `${config.width} / ${config.height}`;

  return (
    <div className="relative w-full overflow-hidden rounded-md bg-black/20" style={{ aspectRatio }}>
      <div className="absolute inset-0 bg-[repeating-conic-gradient(#1a1a2e_0%_25%,#16162a_0%_50%)] bg-[length:14px_14px]" />
      <div className="absolute inset-0">
        {visibleLayers.length === 0 && (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No layers
          </div>
        )}
        {visibleLayers.map((layer) => {
          const fileUrl = `/data/animap/${slug}/${layer.file}`;
          const style: React.CSSProperties = {
            position: 'absolute',
            left: layer.x ?? 0,
            top: layer.y ?? 0,
            transform: `scale(${layer.scale ?? 1})`,
            transformOrigin: 'top left',
            opacity: layer.opacity ?? 1,
            filter: buildCssFilter(layer),
            pointerEvents: 'none',
          };

          if (layer.type === 'image') {
            return (
              <img
                key={layer.id}
                src={fileUrl}
                alt={layer.name}
                draggable={false}
                style={{ ...style, display: 'block' }}
              />
            );
          }

          if (layer.type === 'video') {
            return (
              <div key={layer.id} style={style}>
                <VideoThumbnail src={fileUrl} alt={layer.name} />
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

export default function AnimapList() {
  const [animaps, setAnimaps] = useState<AnimapListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const loadAnimaps = async () => {
      try {
        const res = await fetch('/api/animaps');
        const slugs: string[] = (await res.json()) || [];
        const items = await Promise.all(
          slugs.map(async (slug) => {
            try {
              const configRes = await fetch(`/api/animap/${slug}`);
              if (!configRes.ok) throw new Error('Failed to load animap');
              const config: AnimapConfig = await configRes.json();
              return { slug, config };
            } catch {
              return { slug, config: null };
            }
          })
        );
        setAnimaps(items);
      } catch {
        setAnimaps([]);
      } finally {
        setLoading(false);
      }
    };

    void loadAnimaps();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreatingLoading(true);
    const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    const defaultConfig = {
      name: newName,
      width: 1080,
      height: 1920,
      layers: [],
    };

    try {
      const res = await fetch(`/api/animap/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultConfig),
      });
      if (!res.ok) throw new Error('Failed to create animap');
      setNewName('');
      setIsCreating(false);
      const listRes = await fetch('/api/animaps');
      const listData: string[] = await listRes.json();
      const items = await Promise.all(
        (listData || []).map(async (slug) => {
          try {
            const configRes = await fetch(`/api/animap/${slug}`);
            if (!configRes.ok) throw new Error('Failed to load animap');
            const config: AnimapConfig = await configRes.json();
            return { slug, config };
          } catch {
            return { slug, config: null };
          }
        })
      );
      setAnimaps(items);
    } catch (error) {
      alert('Failed to create animap: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setCreatingLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/animap/${itemToDelete}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete animap');
      setAnimaps(animaps.filter((a) => a.slug !== itemToDelete));
      setItemToDelete(null);
    } catch (error) {
      alert('Failed to delete: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setDeleteLoading(false);
    }
  };

  const filtered = animaps.filter(({ slug }) =>
    slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10 min-h-screen">
        <header className="flex flex-col gap-4 rounded-2xl pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Animaps</h1>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search animaps..."
                className="pl-8 w-full sm:w-[200px] lg:w-[300px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Badge variant="secondary" className="w-fit text-xs whitespace-nowrap">
                {filtered.length} Item
              </Badge>
              <Button size="sm" onClick={() => setIsCreating(true)} className="whitespace-nowrap">
                <Plus className="mr-2 h-4 w-4" />
                New Animap
              </Button>
            </div>
          </div>
        </header>

        {animaps.length === 0 ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>No animaps yet</CardTitle>
              <CardDescription>Create a new animap to get started.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Animap
              </Button>
            </CardContent>
          </Card>
        ) : (
          <section className="p-4 overflow-auto w-full flex-1 min-h-[500px] relative bg-[#1c1e24] rounded-lg">
            <div className="flex flex-wrap gap-4 items-start justify-center absolute inset-4">
              {filtered.map(({ slug, config }) => (
                <div key={slug} className="group relative w-[200px]">
                  <Link
                    to={`/animap/${slug}`}
                    className="block w-full rounded-lg border border-border bg-card p-4 hover:opacity-70 transition-opacity"
                  >
                    <div className="mb-3 overflow-hidden rounded-md border border-border/60 bg-black/10">
                      <AnimapThumbnail slug={slug} config={config} />
                    </div>
                    <div className="text-sm font-medium truncate">{slug}</div>
                  </Link>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                    onClick={(e) => {
                      e.preventDefault();
                      setItemToDelete(slug);
                    }}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {filtered.length === 0 && searchQuery && (
                <div className="col-span-full py-10 text-center text-muted-foreground w-full">
                  No animaps matching "{searchQuery}"
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <Card>
              <CardHeader>
                <CardTitle>New Animap</CardTitle>
                <CardDescription>Enter a name for the new animap.</CardDescription>
              </CardHeader>
              <form onSubmit={handleCreate}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="animap-name">Name</Label>
                    <Input
                      id="animap-name"
                      placeholder="e.g. Hero Idle Animation"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Slug: {newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}
                    </p>
                  </div>
                </CardContent>
                <div className="flex justify-end gap-3 p-6 pt-0">
                  <Button type="button" variant="ghost" onClick={() => setIsCreating(false)} disabled={creatingLoading}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!newName.trim() || creatingLoading}>
                    {creatingLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-destructive">Delete Animap</CardTitle>
                <CardDescription>
                  Are you sure you want to delete <strong>{itemToDelete}</strong>?
                  This action cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setItemToDelete(null)} disabled={deleteLoading}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
                  {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
