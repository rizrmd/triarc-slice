import { CardPreview } from '@/components/CardPreview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Layout, Loader2, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function CardList() {
  const [cards, setCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newHeroName, setNewHeroName] = useState('');
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredCards = cards.filter(slug =>
    slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10 min-h-screen">
        <header className="flex flex-col gap-4 rounded-2xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl flex gap-4">
              Hero Card Studio
            </h1>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Cari hero..."
                className="pl-8 w-full sm:w-[200px] lg:w-[300px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Badge variant="secondary" className="w-fit text-xs whitespace-nowrap">
                {filteredCards.length} Hero
              </Badge>
              <Button size="sm" variant="outline" asChild className="whitespace-nowrap">
                <Link to="/game-layout">
                  <Layout className="mr-2 h-4 w-4" />
                  Game Layout
                </Link>
              </Button>
              <Button size="sm" onClick={() => setIsCreating(true)} className="whitespace-nowrap">
                <Plus className="mr-2 h-4 w-4" />
                Hero Baru
              </Button>
            </div>
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
          <section className="p-4 overflow-auto w-full flex-1 h-full relative bg-[#1c1e24] rounded-lg">
            <div className="flex flex-wrap gap-4 items-center justify-center absolute inset-4">
              {filteredCards.map((slug) => (
                <Link key={slug} to={`/edit/${slug}`} className="group block w-[200px] hover:opacity-50 transition-opacity duration-200">
                  <CardPreview slug={slug} showPoseBadge />
                </Link>
              ))}
              {filteredCards.length === 0 && searchQuery && (
                <div className="col-span-full py-10 text-center text-muted-foreground w-full">
                  Tidak ada hero yang cocok dengan pencarian "{searchQuery}"
                </div>
              )}
            </div>
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
    </>
  );
}
