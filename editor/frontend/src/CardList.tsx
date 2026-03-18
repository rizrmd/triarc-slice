import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Search, Layout, Plus, Trash, Film } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { CardPreview } from '@/components/CardPreview';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const heroFrameImage = '/assets/ui/hero-frame.webp';
const actionFrameImage = '/assets/ui/action-frame.webp';

export default function CardList() {
  const [cards, setCards] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ slug: string, type: 'hero' | 'action' } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam === 'actions' ? 'actions' : 'heroes';

  const setActiveTab = (tab: string) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('tab', tab);
      return newParams;
    }, { replace: true });
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/cards').then((res) => res.json()),
      fetch('/api/actions').then((res) => res.json())
    ])
      .then(([cardsData, actionsData]) => {
        setCards(cardsData || []);
        setActions(actionsData || []);
        setLoading(false);
      })
      .catch(() => {
        setCards([]);
        setActions([]);
        setLoading(false);
      });
  }, []);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    setCreatingLoading(true);
    const slug = newItemName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Default config
    const isAction = activeTab === 'actions';
    const defaultConfig = {
      full_name: newItemName,
      frame_image: isAction ? actionFrameImage : heroFrameImage,
      char_bg_pos: { x: 0, y: 0 },
      char_fg_pos: { x: 0, y: 0 },
      name_scale: isAction ? 122 : 100,
      char_bg_scale: 100,
      char_fg_scale: 100,
      tint: '#ffffff'
    };

    try {
      const endpoint = activeTab === 'heroes' ? `/api/card/${slug}` : `/api/action/${slug}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultConfig)
      });

      if (!res.ok) {
        throw new Error(`Gagal membuat ${activeTab === 'heroes' ? 'hero' : 'action'}`);
      }

      // Success, close modal and refresh list
      setNewItemName('');
      setIsCreating(false);

      // Refresh list
      if (activeTab === 'heroes') {
        const listRes = await fetch('/api/cards');
        const listData = await listRes.json();
        setCards(listData || []);
      } else {
        const listRes = await fetch('/api/actions');
        const listData = await listRes.json();
        setActions(listData || []);
      }

    } catch (error) {
      alert(`Gagal membuat ${activeTab === 'heroes' ? 'hero' : 'action'}: ` + (error instanceof Error ? error.message : String(error)));
    } finally {
      setCreatingLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;

    setDeleteLoading(true);
    try {
      const endpoint = itemToDelete.type === 'hero' 
        ? `/api/card/${itemToDelete.slug}` 
        : `/api/action/${itemToDelete.slug}`;
      
      const res = await fetch(endpoint, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(`Gagal menghapus ${itemToDelete.type}`);
      }

      // Success
      if (itemToDelete.type === 'hero') {
        setCards(cards.filter(c => c !== itemToDelete.slug));
      } else {
        setActions(actions.filter(a => a !== itemToDelete.slug));
      }
      setItemToDelete(null);

    } catch (error) {
      alert(`Gagal menghapus: ` + (error instanceof Error ? error.message : String(error)));
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredCards = cards.filter(slug =>
    slug.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredActions = actions.filter(slug =>
    slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat data...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10 min-h-screen">
        <Tabs defaultValue="heroes" value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
          <header className="flex flex-col gap-4 rounded-2xl pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <TabsList className="grid w-full grid-cols-2 w-[300px]">
                <TabsTrigger value="heroes">Heroes</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={`Cari ${activeTab === 'heroes' ? 'hero' : 'action'}...`}
                  className="pl-8 w-full sm:w-[200px] lg:w-[300px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Badge variant="secondary" className="w-fit text-xs whitespace-nowrap">
                  {activeTab === 'heroes' ? filteredCards.length : filteredActions.length} Item
                </Badge>
                <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => navigate('/animaps')}>
                  <Film className="mr-2 h-4 w-4" />
                  Animaps
                </Button>
                <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => {
                  navigate(`/game-layout/${localStorage.getItem('gameLayoutLast') || 'gameplay/9-16'}`);
                }}>
                  <Layout className="mr-2 h-4 w-4" />
                  Game Layout
                </Button>
                <Button size="sm" onClick={() => setIsCreating(true)} className="whitespace-nowrap">
                  <Plus className="mr-2 h-4 w-4" />
                  Buat Baru
                </Button>
              </div>
            </div>
          </header>
          
          <TabsContent value="heroes" className="flex-1 flex flex-col mt-0 h-full">
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
              <section className="p-4 overflow-auto w-full flex-1 min-h-[500px] relative bg-[#1c1e24] rounded-lg">
                <div className="flex flex-wrap gap-4 items-center justify-center absolute inset-4">
                  {filteredCards.map((slug) => (
                    <div key={slug} className="group relative w-[200px]">
                      <Link to={`/edit/${slug}`} className="block w-full hover:opacity-50 transition-opacity duration-200">
                        <CardPreview slug={slug} showPoseBadge showSoundBadge />
                      </Link>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                        onClick={(e) => {
                          e.preventDefault();
                          setItemToDelete({ slug, type: 'hero' });
                        }}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {filteredCards.length === 0 && searchQuery && (
                    <div className="col-span-full py-10 text-center text-muted-foreground w-full">
                      Tidak ada hero yang cocok dengan pencarian "{searchQuery}"
                    </div>
                  )}
                </div>
              </section>
            )}
          </TabsContent>

          <TabsContent value="actions" className="flex-1 flex flex-col mt-0 h-full">
            {actions.length === 0 ? (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>Belum ada action</CardTitle>
                  <CardDescription>Buat action baru untuk memulai.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setIsCreating(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Buat Action Baru
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <section className="p-4 overflow-auto w-full flex-1 min-h-[500px] relative bg-[#1c1e24] rounded-lg">
                <div className="flex flex-wrap gap-4 items-center justify-center absolute inset-4">
                  {filteredActions.map((slug) => (
                    <div key={slug} className="group relative w-[200px]">
                      <Link to={`/edit/${slug}?type=action`} className="block w-full hover:opacity-50 transition-opacity duration-200">
                        <CardPreview slug={slug} type="action" showHoverName />
                      </Link>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                        onClick={(e) => {
                          e.preventDefault();
                          setItemToDelete({ slug, type: 'action' });
                        }}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {filteredActions.length === 0 && searchQuery && (
                    <div className="col-span-full py-10 text-center text-muted-foreground w-full">
                      Tidak ada action yang cocok dengan pencarian "{searchQuery}"
                    </div>
                  )}
                </div>
              </section>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Item Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <Card>
              <CardHeader>
                <CardTitle>Buat {activeTab === 'heroes' ? 'Hero' : 'Action'} Baru</CardTitle>
                <CardDescription>Masukkan nama {activeTab === 'heroes' ? 'hero' : 'action'} untuk membuat folder baru.</CardDescription>
              </CardHeader>
              <form onSubmit={handleCreateItem}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-name">Nama {activeTab === 'heroes' ? 'Hero' : 'Action'}</Label>
                    <Input
                      id="item-name"
                      placeholder={activeTab === 'heroes' ? "Contoh: Dark Knight" : "Contoh: Fireball"}
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Slug akan digenerate otomatis: {newItemName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}
                    </p>
                  </div>
                </CardContent>
                <div className="flex justify-end gap-3 p-6 pt-0">
                  <Button type="button" variant="ghost" onClick={() => setIsCreating(false)} disabled={creatingLoading}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={!newItemName.trim() || creatingLoading}>
                    {creatingLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Buat {activeTab === 'heroes' ? 'Hero' : 'Action'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-destructive">Hapus {itemToDelete.type === 'hero' ? 'Hero' : 'Action'}</CardTitle>
                <CardDescription>
                  Apakah Anda yakin ingin menghapus <strong>{itemToDelete.slug}</strong>? 
                  Tindakan ini tidak dapat dibatalkan dan akan menghapus semua data terkait.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setItemToDelete(null)} disabled={deleteLoading}>
                  Batal
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
                  {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Hapus
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
