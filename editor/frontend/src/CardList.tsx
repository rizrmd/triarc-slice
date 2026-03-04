import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, Plus } from 'lucide-react';
import { CardPreview } from '@/components/CardPreview';

export default function CardList() {
  const [cards, setCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newHeroName, setNewHeroName] = useState('');
  const [creatingLoading, setCreatingLoading] = useState(false);

  useEffect(() => {
    fetch('/api/cards')
      .then((res) => res.json())
      .then((data) => {
        setCards(data || []);
        setLoading(false);
      })
      .catch(() => {
        setCards([]);
        setLoading(false);
      });
  }, []);

  const handleCreateHero = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHeroName.trim()) return;

    setCreatingLoading(true);
    const slug = newHeroName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Default config
    const defaultConfig = {
      full_name: newHeroName,
      frame_image: '',
      char_bg_pos: { x: 0, y: 0 },
      char_fg_pos: { x: 0, y: 0 },
      char_bg_scale: 100,
      char_fg_scale: 100,
      tint: '#000000'
    };

    try {
      const res = await fetch(`/api/card/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultConfig)
      });

      if (!res.ok) {
        throw new Error('Gagal membuat hero');
      }

      // Success, close modal and refresh list
      setNewHeroName('');
      setIsCreating(false);

      // Refresh list
      const listRes = await fetch('/api/cards');
      const listData = await listRes.json();
      setCards(listData || []);

    } catch (error) {
      alert('Gagal membuat hero: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setCreatingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat daftar hero...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
        <header className="flex flex-col gap-4 rounded-2xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl flex gap-4">
              <Sparkles className="h-3.5 w-3.5" />
              Hero Card Studio
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="w-fit text-xs">
              {cards.length} Hero
            </Badge>
            <Button size="sm" onClick={() => setIsCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Hero Baru
            </Button>
          </div>
        </header>

        {cards.length === 0 ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Belum ada hero</CardTitle>
              <CardDescription>Buat hero baru untuk memulai.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Buat Hero Baru
              </Button>
            </CardContent>
          </Card>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((slug) => (
              <Link key={slug} to={`/edit/${slug}`} className="group block">
                <Card className="overflow-hidden rounded-2xl border transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-lg">
                  <div className="relative aspect-[2/3] w-full bg-[#1b1e25] overflow-hidden">
                    <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105 origin-center">
                      <CardPreview slug={slug} />
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute bottom-3 left-3 right-3 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                      <div className="rounded-md bg-white/10 backdrop-blur-md border border-white/20 p-2 text-xs text-white">
                        <p className="font-medium capitalize">{slug.replace(/-/g, ' ')}</p>
                      </div>
                    </div>
                  </div>
                  <CardHeader className="pb-3 pt-3">
                    <CardTitle className="capitalize text-base">{slug.replace(/-/g, ' ')}</CardTitle>
                    <CardDescription className="text-xs">Edit posisi & tint</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </section>
        )}
      </div>

      {/* Create Hero Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <Card>
              <CardHeader>
                <CardTitle>Buat Hero Baru</CardTitle>
                <CardDescription>Masukkan nama hero untuk membuat folder baru.</CardDescription>
              </CardHeader>
              <form onSubmit={handleCreateHero}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="hero-name">Nama Hero</Label>
                    <Input
                      id="hero-name"
                      placeholder="Contoh: Dark Knight"
                      value={newHeroName}
                      onChange={(e) => setNewHeroName(e.target.value)}
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Slug akan digenerate otomatis: {newHeroName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}
                    </p>
                  </div>
                </CardContent>
                <div className="flex justify-end gap-3 p-6 pt-0">
                  <Button type="button" variant="ghost" onClick={() => setIsCreating(false)} disabled={creatingLoading}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={!newHeroName.trim() || creatingLoading}>
                    {creatingLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Buat Hero
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
