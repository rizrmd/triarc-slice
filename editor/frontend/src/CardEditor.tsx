import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ActionConfig, CardConfig, CharLayer, MaskLayer, TextLayer, BarLayer, CharProperty, LayerId, AssetPickerTarget, AssetItem, VisibleLayers, HeroConfig } from '@/types';
import { normalizeTargeting, targetingToTargetRule } from '@/lib/targeting';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Redo2, Save, Undo2 } from 'lucide-react';

import { LayerControls } from '@/components/card-editor/LayerControls';
import { CardCanvas } from '@/components/card-editor/CardCanvas';
import { LayerList } from '@/components/card-editor/LayerList';
import { AssetPicker } from '@/components/card-editor/AssetPicker';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeroInfoTab } from '@/components/card-editor/HeroInfoTab';
import { HeroStatsTab } from '@/components/card-editor/HeroStatsTab';
import { ActionStatsTab } from '@/components/card-editor/ActionStatsTab';
import { HeroAudioTab } from '@/components/card-editor/HeroAudioTab';
import { HeroPoseAnimapTab, type HeroPoseHeaderActions } from '@/components/card-editor/HeroPoseAnimapTab';
import { ActionVFXTab } from '@/components/card-editor/ActionVFXTab';

const frameImage = '/assets/ui/hero-frame.webp';
const actionFrameImage = '/assets/ui/action-frame.webp';

interface CardEditorProps {
  mode: 'hero' | 'action';
}

export default function CardEditor({ mode }: CardEditorProps) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'card';
  const isAction = mode === 'action';
  const getDefaultNamePos = useCallback(() => ({ x: 0, y: isAction ? 500 : 0 }), [isAction]);
  const getDefaultNameScale = useCallback(() => (isAction ? 122 : 100), [isAction]);
  const getDefaultTextShadowSize = useCallback(() => 3, []);
  const clampLayerY = useCallback((layer: CharLayer | TextLayer | BarLayer, value: number) => {
    if (isAction && layer === 'name') {
      return Math.min(Math.round(value), 700);
    }
    return Math.round(value);
  }, [isAction]);

  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const newParams = new URLSearchParams(prev);
        newParams.set('tab', value);
        return newParams;
      },
      { replace: true }
    );
  };

  const [config, setConfig] = useState<CardConfig | null>(null);
  const [initialConfig, setInitialConfig] = useState<CardConfig | null>(null);
  const [undoStack, setUndoStack] = useState<{ config: CardConfig; masks: { 'mask-bg': string; 'mask-fg': string } }[]>([]);
  const [redoStack, setRedoStack] = useState<{ config: CardConfig; masks: { 'mask-bg': string; 'mask-fg': string } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerId>(isAction ? 'char-bg' : 'char-fg');
  const getDefaultVisibleLayers = (): VisibleLayers => ({
    'char-bg': true,
    'mask-bg': !isAction,
    card: true,
    'mask-fg': !isAction,
    'char-fg': !isAction,
    name: true,
    'hp-bar': !isAction,
  });
  
  const [visibleLayers, setVisibleLayersState] = useState<VisibleLayers>(getDefaultVisibleLayers());
  const zoomStorageKey = isAction ? 'action-editor-zoom' : 'card-editor-zoom';
  
  // Wrapper untuk setVisibleLayers
  const setVisibleLayers = useCallback((updater: React.SetStateAction<VisibleLayers>) => {
    setVisibleLayersState(updater);
  }, []);
  
  // Sinkronisasi visibleLayers ke config untuk auto-save
  useEffect(() => {
    if (!config || loading) return;
    setConfig((prev) => {
      if (!prev) return prev;
      // Hindari update jika sudah sama
      if (JSON.stringify(prev.visible_layers) === JSON.stringify(visibleLayers)) {
        return prev;
      }
      return {
        ...prev,
        visible_layers: visibleLayers,
      };
    });
  }, [visibleLayers, loading]);
  const [canvasZoom, setCanvasZoom] = useState(() => {
    if (typeof window === 'undefined') return 100;
    const saved = localStorage.getItem(zoomStorageKey);
    return saved ? parseInt(saved, 10) : 100;
  });

  const [cardBaseSize, setCardBaseSize] = useState({ width: 0, height: 0 });
  const cardFrameRef = useRef<HTMLDivElement | null>(null);
  const maskBgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskFgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  const [brushSize, setBrushSize] = useState(20);
  const activeFrameSrc = isAction ? (config?.frame_image || actionFrameImage) : (config?.frame_image || frameImage);

  const applyFitZoom = useCallback((frameSize: { width: number; height: number }) => {
    const container = canvasContainerRef.current;
    if (!container || frameSize.width <= 0 || frameSize.height <= 0) return false;

    const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
    const fillPercent = isAction ? 95 : 90;
    const scaleX = containerWidth / frameSize.width;
    const scaleY = containerHeight / frameSize.height;
    const scale = Math.min(scaleX, scaleY) * fillPercent;

    setCanvasZoom(Math.max(25, Math.min(300, Math.floor(scale))));
    setCanvasPan({ x: 0, y: 0 });
    return true;
  }, [isAction]);

  // ... Zoom fit logic ...
  const handleFitToScreen = useCallback(() => {
    if (!canvasContainerRef.current) {
      return;
    }

    if (applyFitZoom(cardBaseSize)) return;

    if (!activeFrameSrc) {
      setCanvasPan({ x: 0, y: 0 });
      return;
    }

    const image = new window.Image();
    const applyLoadedSize = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      const nextSize = { width: image.naturalWidth, height: image.naturalHeight };
      setCardBaseSize(nextSize);
      applyFitZoom(nextSize);
    };

    image.onload = applyLoadedSize;
    image.src = activeFrameSrc;
    if (image.complete) {
      applyLoadedSize();
    } else {
      void image.decode().then(applyLoadedSize).catch(() => {});
    }
  }, [activeFrameSrc, applyFitZoom, cardBaseSize]);

  // Initial fit when card size is loaded
  useEffect(() => {
    if (cardBaseSize.width > 0 && cardBaseSize.height > 0 && !loading) {
      // Small delay to ensure layout is settled
      setTimeout(() => {
         handleFitToScreen();
      }, 100);
    }
  }, [cardBaseSize, loading, handleFitToScreen]);
  useEffect(() => {
    localStorage.setItem(zoomStorageKey, canvasZoom.toString());
  }, [canvasZoom, zoomStorageKey]);

  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [canvasPanning, setCanvasPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [layerClipboard, setLayerClipboard] = useState<{ x: number; y: number; scale: number } | null>(null);
  const [maskClipboard, setMaskClipboard] = useState<string | null>(null);
  const [propertyClipboard, setPropertyClipboard] = useState<{ property: CharProperty; value: number } | null>(null);
  const [charImageVersion, setCharImageVersion] = useState<Record<CharLayer, number>>({ 'char-bg': 0, 'char-fg': 0 });
  const [uploadingCharLayer, setUploadingCharLayer] = useState<CharLayer | null>(null);
  const [maskVersion, setMaskVersion] = useState(0);
  const lastSavedMaskVersion = useRef(0);
  const lastMaskSnapshotRef = useRef<{ 'mask-bg': string; 'mask-fg': string } | null>(null);
  const lastMaskSnapshotVersionRef = useRef(-1);
  const [assetPickerTarget, setAssetPickerTarget] = useState<AssetPickerTarget>(null);
  // Asset items state is moved to AssetPicker, but we need apply logic here
  const [assetApplying, setAssetApplying] = useState(false);
  const [poseHeaderActions, setPoseHeaderActions] = useState<HeroPoseHeaderActions | null>(null);
  const [brushOpacity, setBrushOpacity] = useState(90);
  const [brushHardness, setBrushHardness] = useState(100);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [layerAspectRatios, setLayerAspectRatios] = useState<Record<string, number>>({});
  
  const [serverMaskVersion, setServerMaskVersion] = useState(() => Date.now());
  const [maskLoadState, setMaskLoadState] = useState<Record<MaskLayer, boolean>>({
    'mask-bg': false,
    'mask-fg': false,
  });
  const [, setFrameLoadReady] = useState(false);
  const [, setCharLoadState] = useState<Record<CharLayer, boolean>>({
    'char-bg': false,
    'char-fg': false,
  });

  useEffect(() => {
    if (!isAction) return;
    setVisibleLayers((prev) => ({
      ...prev,
      'char-bg': true,
      'mask-bg': false,
      card: true,
      'mask-fg': false,
      'char-fg': false,
      name: true,
      'hp-bar': false,
    }));
    setActiveLayer((prev) => (prev === 'card' || prev === 'char-bg' ? prev : 'char-bg'));
  }, [isAction]);
  
  const cardWidth = cardBaseSize.width;
  const cardHeight = cardBaseSize.height;

  // ... Helper functions ...
  const cloneConfig = (source: CardConfig): CardConfig => {
    const s = source as any;
    const clone: any = { ...s };
    if (s.char_bg_pos) clone.char_bg_pos = { ...s.char_bg_pos };
    if (s.char_fg_pos) clone.char_fg_pos = { ...s.char_fg_pos };
    if (s.name_pos) clone.name_pos = { ...s.name_pos };
    if (s.hp_bar_pos) clone.hp_bar_pos = { ...s.hp_bar_pos };
    if (s.targeting) clone.targeting = { ...s.targeting };
    return clone;
  };

  const isSameConfig = (left: CardConfig, right: CardConfig) => {
    const l = left as any;
    const r = right as any;
    
    if (l.hp_bar_hue !== r.hp_bar_hue) return false;
    if (l.hp_bar_font_size !== r.hp_bar_font_size) return false;
    if (l.hp_bar_scale !== r.hp_bar_scale) return false;
    if (l?.hp_bar_pos?.x !== r?.hp_bar_pos?.x) return false;
    if (l?.hp_bar_pos?.y !== r?.hp_bar_pos?.y) return false;
    
    // Action fields
    if (l.cost !== r.cost) return false;
    if (JSON.stringify(l.element ?? []) !== JSON.stringify(r.element ?? [])) return false;
    if (l.target_rule !== r.target_rule) return false;
    if (JSON.stringify(l.targeting ?? {}) !== JSON.stringify(r.targeting ?? {})) return false;
    if (l.description !== r.description) return false;
    if (JSON.stringify(l.gameplay ?? {}) !== JSON.stringify(r.gameplay ?? {})) return false;
    
    return JSON.stringify(left) === JSON.stringify(right);
  };

  const getMaskSnapshot = useCallback(() => {
    if (lastMaskSnapshotVersionRef.current === maskVersion && lastMaskSnapshotRef.current) {
      return lastMaskSnapshotRef.current;
    }

    const bg = maskBgCanvasRef.current?.toDataURL('image/png') || '';
    const fg = maskFgCanvasRef.current?.toDataURL('image/png') || '';
    const snapshot = { 'mask-bg': bg, 'mask-fg': fg };

    lastMaskSnapshotRef.current = snapshot;
    lastMaskSnapshotVersionRef.current = maskVersion;
    return snapshot;
  }, [maskVersion]);

  const getMaskCanvasRef = (layer: MaskLayer) => {
    if (layer === 'mask-bg') return maskBgCanvasRef;
    return maskFgCanvasRef;
  };

  const restoreMasks = useCallback((masks: { 'mask-bg': string; 'mask-fg': string }) => {
    const loadLayer = (canvas: HTMLCanvasElement | null, src: string) => {
      if (!canvas || !src) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const img = new Image();
      img.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0);
      };
      img.src = src;
    };
    loadLayer(maskBgCanvasRef.current, masks['mask-bg']);
    loadLayer(maskFgCanvasRef.current, masks['mask-fg']);
    setMaskVersion((v) => v + 1);
  }, []);

  const pushUndoSnapshot = (snapshot: CardConfig) => {
    const masks = getMaskSnapshot();
    setUndoStack((prev) => [...prev.slice(-49), { config: cloneConfig(snapshot), masks }]);
    setRedoStack([]);
  };
  const commitConfig = (updater: (prev: CardConfig) => CardConfig) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (isSameConfig(prev, next)) return prev;
      pushUndoSnapshot(prev);
      return next;
    });
  };

  // ... Fetching effects ...
  useEffect(() => {
    if (!slug) return;
    const endpoint = isAction ? `/api/action/${slug}` : `/api/card/${slug}`;
    fetch(endpoint)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch card');
        return res.json();
      })
      .then((data) => {
        const normalized = {
          ...data,
          char_bg_scale: typeof data.char_bg_scale === 'number' && data.char_bg_scale > 0 ? data.char_bg_scale : 100,
          char_fg_scale: typeof data.char_fg_scale === 'number' && data.char_fg_scale > 0 ? data.char_fg_scale : 100,
          frame_image:
            typeof data.frame_image === 'string' && data.frame_image
              ? data.frame_image
              : (isAction ? actionFrameImage : frameImage),
          name_pos: {
            x: data.name_pos?.x ?? getDefaultNamePos().x,
            y: data.name_pos?.y ?? getDefaultNamePos().y,
          },
          name_scale: typeof data.name_scale === 'number' && data.name_scale > 0 ? Math.max(30, data.name_scale) : getDefaultNameScale(),
          text_shadow_color: data.text_shadow_color || 'rgba(0, 0, 0, 0.5)',
          text_shadow_size: typeof data.text_shadow_size === 'number' && data.text_shadow_size >= 0 ? data.text_shadow_size : getDefaultTextShadowSize(),
          tint: typeof data.tint === 'string' && data.tint ? data.tint : '#ffffff',
          hp_bar_pos: data.hp_bar_pos || { x: 0, y: (data.name_pos?.y || 0) + 60 },
          hp_bar_scale: typeof data.hp_bar_scale === 'number' && data.hp_bar_scale > 0 ? data.hp_bar_scale : 250,
          hp_bar_current: typeof data.hp_bar_current === 'number' ? data.hp_bar_current : (data.stats?.max_hp > 0 ? data.stats.max_hp : 100),
          hp_bar_max: typeof data.hp_bar_max === 'number' ? data.hp_bar_max : (data.stats?.max_hp > 0 ? data.stats.max_hp : 100),
          hp_bar_hue: typeof data.hp_bar_hue === 'number' ? data.hp_bar_hue : 0,
          hp_bar_font_size: typeof data.hp_bar_font_size === 'number' ? data.hp_bar_font_size : 31,
          pose: data.pose || undefined,
          cost: data.cost,
          element: Array.isArray(data.element)
            ? data.element
            : typeof data.element === 'string' && data.element
              ? [data.element]
              : [],
          targeting: normalizeTargeting(data.targeting, data.target_rule),
          target_rule: targetingToTargetRule(data.targeting ?? normalizeTargeting(data.targeting, data.target_rule)),
          description: data.description,
        };

        const loadImageSize = (src: string) =>
          new Promise<boolean>((resolve) => {
            if (!src) {
              resolve(false);
              return;
            }
            const image = new window.Image();
            image.src = src;
            const applySize = () => {
              if (image.naturalWidth > 1 && image.naturalHeight > 1) {
                setCardBaseSize({ width: image.naturalWidth, height: image.naturalHeight });
                resolve(true);
                return;
              }
              resolve(false);
            };
            if (image.complete) {
              applySize();
              return;
            }
            image.onload = applySize;
            image.onerror = () => resolve(false);
          });

        const sizeCandidates = isAction
          ? [`/api/action-bg/${slug}?size=${Date.now()}`, normalized.frame_image || '']
          : [normalized.frame_image || frameImage];

        return sizeCandidates.reduce<Promise<boolean>>(
          (chain, src) => chain.then((loaded) => (loaded ? true : loadImageSize(src))),
          Promise.resolve(false)
        ).then(() => {
          setConfig(normalized);
          setInitialConfig(cloneConfig(normalized));
          // Load visible layers from config if available
          if (data.visible_layers && typeof data.visible_layers === 'object') {
            const mergedLayers = {
              ...getDefaultVisibleLayers(),
              ...data.visible_layers,
            };
            setVisibleLayers(() => mergedLayers);
          }
          setUndoStack([]);
          setRedoStack([]);
          setMaskVersion(0);
          lastSavedMaskVersion.current = 0;
          lastMaskSnapshotVersionRef.current = -1;
          setLoading(false);
        });
      })
      .catch(() => {
        setLoading(false);
      });
  }, [getDefaultNamePos, getDefaultNameScale, getDefaultTextShadowSize, isAction, slug]);

  const handleRename = (newName: string) => {
    if (!slug) return;
    setSaving(true);
    fetch('/api/rename-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldSlug: slug, newName, type: isAction ? 'action' : 'hero' }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        return res.json();
      })
      .then((data) => {
        if (data.newSlug && data.newSlug !== slug) {
          navigate(`/edit/${data.newSlug}${isAction ? '?type=action' : ''}`, { replace: true });
        } else {
          setConfig((prev) => (prev ? { ...prev, full_name: newName } : prev));
          setInitialConfig((prev) => (prev ? { ...prev, full_name: newName } : prev));
        }
      })
      .catch((err) => {
        alert('Gagal mengubah nama: ' + err.message);
      })
      .finally(() => {
        setSaving(false);
      });
  };

  useEffect(() => {
    let mounted = true;
    const image = new window.Image();
    requestAnimationFrame(() => setFrameLoadReady(false));
    
    console.log('[CardEditor] Starting frame image load:', activeFrameSrc);

    let frameReadyMarked = false;
    const markFrameReady = () => {
      if (!mounted || frameReadyMarked) return;
      frameReadyMarked = true;
      setFrameLoadReady(true);
    };

    const updateSize = () => {
      if (!mounted) return;
      console.log('[CardEditor] Frame image loaded:', { 
        src: activeFrameSrc, 
        width: image.naturalWidth, 
        height: image.naturalHeight,
        complete: image.complete 
      });
      if (image.naturalWidth > 1 && image.naturalHeight > 1) {
        setCardBaseSize({ width: image.naturalWidth, height: image.naturalHeight });
      }
      markFrameReady();
    };

    if (!activeFrameSrc) {
      markFrameReady();
      return () => {
        mounted = false;
      };
    }

    image.src = activeFrameSrc;

    // Use decode() for reliable "ready to draw" detection
    image.decode()
      .then(() => {
        console.log('[CardEditor] Frame image decoded successfully');
        updateSize();
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("Frame image decode failed:", activeFrameSrc, err);
        markFrameReady();
        // Fallback: try onload just in case decode failed but image is technically usable? 
        // Or just rely on onload as a backup mechanism if decode rejects?
        // Usually if decode fails, the image is bad.
      });

    // Keep onload as a backup for browsers where decode might behave strictly or differently
    image.onload = () => {
      console.log('[CardEditor] Frame image onload triggered');
      updateSize();
    };
    image.onerror = () => {
      markFrameReady();
    };

    return () => {
      mounted = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [activeFrameSrc, isAction]);



  const isMaskBgReady = !visibleLayers['mask-bg'] || maskLoadState['mask-bg'];
  const isMaskFgReady = !visibleLayers['mask-fg'] || maskLoadState['mask-fg'];

  
  const bgUrl = slug && isMaskBgReady
    ? (isAction
        ? `/api/action-bg/${slug}?v=${charImageVersion['char-bg']}`
        : `/api/card-char/${slug}/char-bg?v=${charImageVersion['char-bg']}`)
    : '';
  const fgUrl = slug && isMaskFgReady && !isAction
    ? `/api/card-char/${slug}/char-fg?v=${charImageVersion['char-fg']}`
    : '';

  // Update card size when action background changes (since actions don't have a fixed frame)
  // DISABLED: We now enforce a fixed frame for actions (action-frame.webp)
  /*
  useEffect(() => {
    if (!isAction || !bgUrl) return;

    const image = new window.Image();
    image.src = bgUrl;

    const updateSize = () => {
      if (image.naturalWidth > 1 && image.naturalHeight > 1) {
        setCardBaseSize((prev) => {
          if (prev.width === image.naturalWidth && prev.height === image.naturalHeight) return prev;
          return { width: image.naturalWidth, height: image.naturalHeight };
        });
      }
    };

    if (image.complete) {
      updateSize();
    } else {
      image.onload = updateSize;
    }

    return () => {
      image.onload = null;
    };
  }, [isAction, bgUrl]);
  */

  // ... Save logic ...
  const saveConfig = useCallback(
    (targetConfig: CardConfig, showAlertOnError = false) => {
      if (!slug) return Promise.resolve(false);
      setSaveError(null);
      const endpoint = isAction ? `/api/action/${slug}` : `/api/card/${slug}`;
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetConfig),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to save');
          setInitialConfig(cloneConfig(targetConfig));
          return true;
        })
        .catch((err: Error) => {
          setSaveError(err.message);
          if (showAlertOnError) alert('Gagal menyimpan: ' + err.message);
          return false;
        })
    },
    [slug, isAction]
  );

  const saveMasks = useCallback(
    (showAlertOnError = false) => {
      if (!slug) return Promise.resolve(false);
      const bgCanvas = maskBgCanvasRef.current;
      const fgCanvas = maskFgCanvasRef.current;

      const safeDataURL = (canvas: HTMLCanvasElement | null): string => {
        if (!canvas || canvas.width === 0 || canvas.height === 0) return '';
        try {
          const url = canvas.toDataURL('image/png');
          return url === 'data:,' ? '' : url;
        } catch {
          return '';
        }
      };
      const payload = {
        mask_bg: safeDataURL(bgCanvas),
        mask_fg: safeDataURL(fgCanvas),
      };
      const maskEndpoint = isAction ? `/api/action-mask/${slug}` : `/api/card-mask/${slug}`;
      return fetch(maskEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || 'Failed to save masks');
          }
          return true;
        })
        .catch((err: Error) => {
          setSaveError(err.message);
          if (showAlertOnError) alert('Gagal menyimpan mask: ' + err.message);
          return false;
        });
    },
    [slug, isAction]
  );

  const handleSave = (showAlertOnError = true) => {
    if (!config) return;
    setSaving(true);
    const snapshot = cloneConfig(config);
    void saveConfig(snapshot, showAlertOnError)
      .then((savedConfig) => {
        if (!savedConfig) return false;
        return saveMasks(showAlertOnError).then((success) => {
          if (success) {
            lastSavedMaskVersion.current = maskVersion;
          }
          return success;
        });
      })
      .finally(() => setSaving(false));
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    if (!config) return;
    setUndoStack((prev) => prev.slice(0, -1));
    
    const currentMasks = getMaskSnapshot();
    setRedoStack((prev) => [...prev.slice(-49), { config: cloneConfig(config), masks: currentMasks }]);
    
    setConfig(cloneConfig(previous.config));
    restoreMasks(previous.masks);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    if (!config) return;
    setRedoStack((prev) => prev.slice(0, -1));

    const currentMasks = getMaskSnapshot();
    setUndoStack((prev) => [...prev.slice(-49), { config: cloneConfig(config), masks: currentMasks }]);
    
    setConfig(cloneConfig(next.config));
    restoreMasks(next.masks);
  };

  // ... Layer manipulation logic ...
  const getLayerState = (layer: CharLayer | TextLayer | BarLayer) => {
    if (!config) return { x: 0, y: 0, scale: layer === 'hp-bar' ? 250 : 100 };
    const c = config as any;
    if (layer === 'char-bg') {
      return {
        x: c.char_bg_pos.x,
        y: c.char_bg_pos.y,
        scale: c.char_bg_scale,
      };
    }
    if (layer === 'char-fg') {
      return {
        x: c.char_fg_pos.x,
        y: c.char_fg_pos.y,
        scale: c.char_fg_scale,
      };
    }
    if (layer === 'hp-bar') {
      return {
        x: c.hp_bar_pos?.x || 0,
        y: c.hp_bar_pos?.y || 0,
        scale: c.hp_bar_scale || 250,
      };
    }
    return {
      x: c.name_pos.x,
      y: c.name_pos.y,
      scale: c.name_scale,
    };
  };

  const updateLayerPosition = (layer: CharLayer | TextLayer | BarLayer, dx: number, dy: number, trackHistory = true) => {
    const updater = (prev: CardConfig) => {
      const p = prev as any;
      if (layer === 'char-bg') {
        return {
          ...prev,
          char_bg_pos: {
            x: p.char_bg_pos.x + dx,
            y: p.char_bg_pos.y + dy,
          },
        };
      }
      if (layer === 'char-fg') {
        return {
          ...prev,
          char_fg_pos: {
            x: p.char_fg_pos.x + dx,
            y: p.char_fg_pos.y + dy,
          },
        };
      }
      if (layer === 'hp-bar') {
        return {
          ...prev,
          hp_bar_pos: {
            x: (p.hp_bar_pos?.x || 0) + dx,
            y: (p.hp_bar_pos?.y || 0) + dy,
          },
        };
      }
      return {
        ...prev,
        name_pos: {
          x: p.name_pos.x + dx,
          y: clampLayerY(layer, p.name_pos.y + dy),
        },
      };
    };
    if (trackHistory) {
      commitConfig(updater);
    } else {
      setConfig((prev) => (prev ? updater(prev) : prev));
    }
  };

  const updateLayerScale = (layer: CharLayer | TextLayer | BarLayer, scale: number) => {
    const minScale = layer === 'name' ? 30 : 40;
    const clamped = Math.max(minScale, Math.min(300, Math.round(scale)));
    commitConfig((prev) => {
      if (!prev) return prev;
      if (layer === 'char-bg') {
        return {
          ...prev,
          char_bg_scale: clamped,
        };
      }
      if (layer === 'char-fg') {
        return {
          ...prev,
          char_fg_scale: clamped,
        };
      }
      if (layer === 'hp-bar') {
        return {
          ...prev,
          hp_bar_scale: clamped,
        };
      }
      return {
        ...prev,
        name_scale: clamped,
      };
    });
  };

  const applyLayerState = (layer: CharLayer | TextLayer | BarLayer, state: { x: number; y: number; scale: number }) => {
    const minScale = layer === 'name' ? 30 : 40;
    const clampedScale = Math.max(minScale, Math.min(300, Math.round(state.scale)));
    commitConfig((prev) => {
      if (!prev) return prev;
      if (layer === 'char-bg') {
        return {
          ...prev,
          char_bg_pos: { x: Math.round(state.x), y: Math.round(state.y) },
          char_bg_scale: clampedScale,
        };
      }
      if (layer === 'char-fg') {
        return {
          ...prev,
          char_fg_pos: { x: Math.round(state.x), y: Math.round(state.y) },
          char_fg_scale: clampedScale,
        };
      }
      if (layer === 'hp-bar') {
        return {
          ...prev,
          hp_bar_pos: { x: Math.round(state.x), y: Math.round(state.y) },
          hp_bar_scale: clampedScale,
        };
      }
      return {
        ...prev,
        name_pos: { x: Math.round(state.x), y: clampLayerY(layer, state.y) },
        name_scale: clampedScale,
      };
    });
  };

  const applyLayerProperty = (layer: CharLayer | TextLayer | BarLayer, property: CharProperty, value: number) => {
    if (property === 'scale') {
      updateLayerScale(layer, value);
      return;
    }
    commitConfig((prev) => {
      if (!prev) return prev;
      const p = prev as any;
      const rounded = Math.round(value);
      if (layer === 'char-bg') {
        return {
          ...prev,
          char_bg_pos: {
            ...p.char_bg_pos,
            [property]: rounded,
          },
        };
      }
      if (layer === 'char-fg') {
        return {
          ...prev,
          char_fg_pos: {
            ...p.char_fg_pos,
            [property]: rounded,
          },
        };
      }
      if (layer === 'hp-bar') {
        return {
          ...prev,
          hp_bar_pos: {
            ...p.hp_bar_pos,
            [property]: rounded,
          },
        };
      }
      return {
        ...prev,
        name_pos: {
          ...p.name_pos,
          [property]: property === 'y' ? clampLayerY(layer, rounded) : rounded,
        },
      };
    });
  };

  const copyAllLayerProperties = (layer: CharLayer | TextLayer | BarLayer) => {
    setLayerClipboard(getLayerState(layer));
  };

  const pasteAllLayerProperties = (layer: CharLayer | TextLayer | BarLayer) => {
    if (!layerClipboard) return;
    applyLayerState(layer, layerClipboard);
  };

  const copySingleProperty = (layer: CharLayer | TextLayer | BarLayer, property: CharProperty) => {
    const layerState = getLayerState(layer);
    setPropertyClipboard({
      property,
      value: layerState[property],
    });
  };

  const pasteSingleProperty = (layer: CharLayer | TextLayer | BarLayer, property: CharProperty) => {
    if (!propertyClipboard || propertyClipboard.property !== property) return;
    applyLayerProperty(layer, property, propertyClipboard.value);
  };

  const getDefaultLayerState = (layer?: CharLayer | TextLayer | BarLayer) => ({
    x: 0,
    y: layer === 'name' ? getDefaultNamePos().y : 0,
    scale: layer === 'hp-bar' ? 250 : layer === 'name' ? getDefaultNameScale() : 100,
  });

  const resetLayerProperty = (layer: CharLayer | TextLayer | BarLayer, property: CharProperty) => {
    const defaultLayer = getDefaultLayerState(layer);
    applyLayerProperty(layer, property, defaultLayer[property]);
  };

  const resetAllLayerProperties = (layer: CharLayer | TextLayer | BarLayer) => {
    applyLayerState(layer, getDefaultLayerState(layer));
  };

  // ... Keyboard shortcuts ...
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(true);
      const isMod = event.ctrlKey || event.metaKey;
      const activeCharLayer: CharLayer | TextLayer | BarLayer | null =
        activeLayer === 'char-bg' || activeLayer === 'mask-bg'
          ? 'char-bg'
          : activeLayer === 'char-fg' || activeLayer === 'mask-fg'
            ? 'char-fg'
            : activeLayer === 'name'
              ? 'name'
              : activeLayer === 'hp-bar'
                ? 'hp-bar'
                : null;
      if (event.code === 'KeyS' && isMod) {
        event.preventDefault();
        handleSave(true);
      }
      if (event.code === 'KeyZ' && isMod) {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if (event.code === 'KeyY' && isMod) {
        event.preventDefault();
        handleRedo();
      }
      if (isEditableTarget(event.target)) return;
      if (event.code === 'KeyC' && isMod) {
        if (activeCharLayer && config) {
          event.preventDefault();
          const c = config as any;
          if (activeCharLayer === 'char-bg') {
            setLayerClipboard({ x: c.char_bg_pos.x, y: c.char_bg_pos.y, scale: c.char_bg_scale });
          } else if (activeCharLayer === 'char-fg') {
            setLayerClipboard({ x: c.char_fg_pos.x, y: c.char_fg_pos.y, scale: c.char_fg_scale });
          } else if (activeCharLayer === 'hp-bar') {
            setLayerClipboard({ x: c.hp_bar_pos?.x || 0, y: c.hp_bar_pos?.y || 0, scale: c.hp_bar_scale || 250 });
          } else if (activeCharLayer === 'name') {
            setLayerClipboard({ x: c.name_pos.x, y: c.name_pos.y, scale: c.name_scale });
          }
        }
        
        // Handle mask copy
        const maskLayer = activeLayer === 'mask-bg' || activeLayer === 'mask-fg' ? activeLayer : null;
        if (maskLayer) {
           event.preventDefault();
           const canvas = getMaskCanvasRef(maskLayer).current;
           if (canvas) {
             setMaskClipboard(canvas.toDataURL('image/png'));
             // Optional: visual feedback could be added here
           }
        }
      }
      if (event.code === 'KeyV' && isMod) {
        if (activeCharLayer && layerClipboard) {
          event.preventDefault();
          const minScale = activeCharLayer === 'name' ? 30 : 40;
          const clampedScale = Math.max(minScale, Math.min(300, Math.round(layerClipboard.scale)));
          commitConfig((prev) => {
            if (!prev) return prev;
            if (activeCharLayer === 'char-bg') {
              return {
                ...prev,
                char_bg_pos: { x: Math.round(layerClipboard.x), y: Math.round(layerClipboard.y) },
                char_bg_scale: clampedScale,
              };
            }
            if (activeCharLayer === 'char-fg') {
              return {
                ...prev,
                char_fg_pos: { x: Math.round(layerClipboard.x), y: Math.round(layerClipboard.y) },
                char_fg_scale: clampedScale,
              };
            }
            if (activeCharLayer === 'hp-bar') {
              return {
                ...prev,
                hp_bar_pos: { x: Math.round(layerClipboard.x), y: Math.round(layerClipboard.y) },
                hp_bar_scale: clampedScale,
              };
            }
            return {
              ...prev,
              name_pos: { x: Math.round(layerClipboard.x), y: clampLayerY(activeCharLayer, layerClipboard.y) },
              name_scale: clampedScale,
            };
          });
        }

        // Handle mask paste
        const maskLayer = activeLayer === 'mask-bg' || activeLayer === 'mask-fg' ? activeLayer : null;
        if (maskLayer && maskClipboard) {
          event.preventDefault();
          if (config) {
             pushUndoSnapshot(config);
          }
          
          const canvas = getMaskCanvasRef(maskLayer).current;
          if (canvas) {
            const context = canvas.getContext('2d');
            if (context) {
              const img = new Image();
              img.onload = () => {
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(img, 0, 0, canvas.width, canvas.height); // Scale to fit current canvas
                setMaskVersion(v => v + 1);
              };
              img.src = maskClipboard;
            }
          }
        }
      }
      if ((event.code === 'Backspace' || event.code === 'Delete') && activeCharLayer && initialConfig) {
        event.preventDefault();
        commitConfig((prev) => {
          if (!prev) return prev;
          const i = initialConfig as any;
          if (activeCharLayer === 'char-bg') {
            return {
              ...prev,
              char_bg_pos: { x: i.char_bg_pos.x, y: i.char_bg_pos.y },
              char_bg_scale: i.char_bg_scale,
            };
          }
          if (activeCharLayer === 'char-fg') {
            return {
              ...prev,
              char_fg_pos: { x: i.char_fg_pos.x, y: i.char_fg_pos.y },
              char_fg_scale: i.char_fg_scale,
            };
          }
          if (activeCharLayer === 'hp-bar') {
            return {
              ...prev,
              hp_bar_pos: { x: i.hp_bar_pos?.x || 0, y: i.hp_bar_pos?.y || 0 },
              hp_bar_scale: i.hp_bar_scale || 250,
            };
          }
          return {
            ...prev,
            name_pos: { x: i.name_pos.x, y: clampLayerY(activeCharLayer, i.name_pos.y) },
            name_scale: i.name_scale,
          };
        });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, redoStack, saving, config, slug, activeLayer, layerClipboard, maskClipboard, initialConfig, maskVersion, clampLayerY]);

  useEffect(() => {
    if (!slug || !config || !initialConfig || loading || saving) {
      console.log('[AutoSave] Skipped:', { slug: !!slug, config: !!config, initialConfig: !!initialConfig, loading, saving });
      return;
    }
    
    const configChanged = !isSameConfig(config, initialConfig);
    const maskChanged = maskVersion !== lastSavedMaskVersion.current;

    console.log('[AutoSave] Checking:', { configChanged, maskChanged, maskVersion, savedMaskVersion: lastSavedMaskVersion.current });

    if (!configChanged && !maskChanged) return;

    const timer = window.setTimeout(() => {
      console.log('[AutoSave] Triggering save...');
      setSaving(true);
      
      const promises = [];
      if (configChanged) {
        promises.push(saveConfig(cloneConfig(config)));
      }
      if (maskChanged) {
        const currentVersion = maskVersion;
        promises.push(
          saveMasks().then((success) => {
            if (success) {
              lastSavedMaskVersion.current = currentVersion;
            }
            return success;
          })
        );
      }

      Promise.all(promises).finally(() => setSaving(false));
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [slug, config, initialConfig, loading, saving, saveConfig, saveMasks, maskVersion]);

  // ... Mask logic ...
  // const getMaskCanvasRef = (layer: MaskLayer) => (layer === 'mask-bg' ? maskBgCanvasRef : maskFgCanvasRef);

  const clearMaskLayer = (layer: MaskLayer) => {
    if (config) {
      pushUndoSnapshot(config);
    }
    const canvas = getMaskCanvasRef(layer).current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setMaskVersion((v) => v + 1);
  };

  useEffect(() => {
    requestAnimationFrame(() => setServerMaskVersion(Date.now()));
    // Reset mask load state on slug change to prevent flash of unmasked content
    requestAnimationFrame(() => setMaskLoadState({ 'mask-bg': false, 'mask-fg': false }));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    let isCancelled = false;

    const loadMaskLayer = (layer: MaskLayer, attempt = 0) => {
      console.log(`[CardEditor] loadMaskLayer: ${layer} attempt=${attempt} width=${cardWidth}`);
      // Check if layer is visible before trying to load
      if (!visibleLayers[layer]) {
        // If layer is hidden, we consider it "ready" (as in, we don't need to wait for it)
        setMaskLoadState(prev => ({ ...prev, [layer]: true }));
        return;
      }

      // If starting a new load, mark as not ready
      if (attempt === 0) {
        setMaskLoadState(prev => ({ ...prev, [layer]: false }));
      }

      const canvas = getMaskCanvasRef(layer).current;
      if (!canvas) {
        console.warn(`[CardEditor] Canvas ref missing for ${layer}, retrying in 50ms (attempt ${attempt})`);
        if (attempt < 5) {
          setTimeout(() => {
            if (!isCancelled) loadMaskLayer(layer, attempt + 1);
          }, 50);
        } else {
           // If we can't find the canvas after 5 attempts, just mark it as loaded to show the image
           // This prevents the image from being hidden forever if something weird happens with refs
           console.error(`[CardEditor] Failed to find canvas ref for ${layer} after 5 attempts`);
           setMaskLoadState(prev => ({ ...prev, [layer]: true }));
        }
        return;
      }
      
      const width = cardWidth;
      const height = cardHeight;

      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const context = canvas.getContext('2d');
      if (!context) return;
      
      // Clear initially to avoid stale content during load
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      const image = new window.Image();
      image.onload = () => {
        if (isCancelled) {
            console.log(`[CardEditor] ${layer} load cancelled`);
            return;
        }
        console.log(`[CardEditor] ${layer} loaded successfully`);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        // Force a mask version update to ensure MaskedImage picks it up
        setMaskVersion(v => v + 1);
        setMaskLoadState(prev => ({ ...prev, [layer]: true }));
      };
      image.onerror = () => {
        if (isCancelled) return;
        console.error(`[CardEditor] ${layer} failed to load`);
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Retry logic for rapid refresh scenarios
        if (attempt < 3) {
          const delay = 500 * Math.pow(2, attempt);
          console.log(`[CardEditor] Retrying ${layer} in ${delay}ms`);
          setTimeout(() => {
            if (!isCancelled) loadMaskLayer(layer, attempt + 1);
          }, delay);
        } else {
          // If failed after retries (e.g. 404 for new card), mark as ready (empty)
          console.log(`[CardEditor] Giving up on ${layer}, marking as ready (empty)`);
          setMaskLoadState(prev => ({ ...prev, [layer]: true }));
        }
      };
      
      const basePath = isAction ? 'action' : 'hero';
      const src = `/data/${basePath}/${slug}/img/${layer}.webp?v=${serverMaskVersion}`;
      console.log(`[CardEditor] Loading mask src: ${src}`);
      image.src = src;
    };

    // If visible but no dimensions yet, mark as NOT ready to prevent unmasked flash
    requestAnimationFrame(() => {
      if (visibleLayers['mask-bg']) {
        if (cardWidth > 0 && cardHeight > 0) {
          loadMaskLayer('mask-bg');
        } else {
          setMaskLoadState(prev => ({ ...prev, 'mask-bg': false }));
        }
      } else {
        setMaskLoadState(prev => ({ ...prev, 'mask-bg': true }));
      }

      if (visibleLayers['mask-fg']) {
        if (cardWidth > 0 && cardHeight > 0) {
          loadMaskLayer('mask-fg');
        } else {
          setMaskLoadState(prev => ({ ...prev, 'mask-fg': false }));
        }
      } else {
        setMaskLoadState(prev => ({ ...prev, 'mask-fg': true }));
      }

    });

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, cardWidth, cardHeight, serverMaskVersion, visibleLayers['mask-bg'], visibleLayers['mask-fg']]);

  useEffect(() => {
    const loadCharLayer = (layer: CharLayer, src: string) => {
      if (!visibleLayers[layer]) {
        setCharLoadState((prev) => ({ ...prev, [layer]: true }));
        return () => {};
      }

      if (!src) {
        setCharLoadState((prev) => ({ ...prev, [layer]: false }));
        return () => {};
      }

      let mounted = true;
      let marked = false;
      setCharLoadState((prev) => ({ ...prev, [layer]: false }));

      const image = new window.Image();
      const markReady = () => {
        if (!mounted || marked) return;
        marked = true;
        setCharLoadState((prev) => ({ ...prev, [layer]: true }));
      };

      image.onload = markReady;
      image.onerror = markReady;
      image.src = src;

      if (image.complete && image.naturalWidth > 0) {
        setLayerAspectRatios(prev => ({ ...prev, [layer]: image.naturalWidth / image.naturalHeight }));
        markReady();
      } else {
        image.decode().then(() => {
          setLayerAspectRatios(prev => ({ ...prev, [layer]: image.naturalWidth / image.naturalHeight }));
          markReady();
        }).catch(() => {});
      }

      return () => {
        mounted = false;
        image.onload = null;
        image.onerror = null;
      };
    };

    const cleanupBg = loadCharLayer('char-bg', bgUrl);
    const cleanupFg = loadCharLayer('char-fg', fgUrl);

    return () => {
      cleanupBg();
      cleanupFg();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgUrl, fgUrl, visibleLayers['char-bg'], visibleLayers['char-fg']]);

  const applyMaskBrush = useCallback(
    (
      context: CanvasRenderingContext2D,
      from: { x: number; y: number },
      to: { x: number; y: number }
    ) => {
      const alpha = brushOpacity / 100;
      const brushColor = `rgba(0, 0, 0, ${alpha})`;

      context.save();
      context.globalCompositeOperation = brushMode === 'erase' ? 'source-over' : 'destination-out';
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = brushColor;
      context.fillStyle = brushColor;
      context.lineWidth = brushSize;

      if (brushHardness < 100) {
        const blurAmount = (brushSize / 2) * ((100 - brushHardness) / 100);
        context.shadowBlur = blurAmount;
        context.shadowColor = brushColor;
      } else {
        context.shadowBlur = 0;
      }

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();

      const radius = Math.max(brushSize / 2, 0.5);
      context.beginPath();
      context.arc(to.x, to.y, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    },
    [brushHardness, brushMode, brushOpacity, brushSize]
  );

  const drawOnMaskLayer = (layer: MaskLayer, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = getMaskCanvasRef(layer).current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    applyMaskBrush(context, from, to);
  };

  const mapPointerToMaskCanvas = (canvas: HTMLCanvasElement, event: PointerEvent | ReactPointerEvent<Element>) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleMaskPointerDown = (layer: MaskLayer, event: ReactPointerEvent<Element>) => {
    if (activeLayer === 'canvas') return;
    if (activeLayer !== layer) return;
    if (spacePressed) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveLayer(layer);

    if (config) {
      pushUndoSnapshot(config);
    }

    const canvas = getMaskCanvasRef(layer).current;
    if (!canvas) return;
    let lastPoint = mapPointerToMaskCanvas(canvas, event);
    drawOnMaskLayer(layer, lastPoint, lastPoint);
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextPoint = mapPointerToMaskCanvas(canvas, moveEvent);
      drawOnMaskLayer(layer, lastPoint, nextPoint);
      lastPoint = nextPoint;
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setMaskVersion((v) => v + 1);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleLayerPointerDown = (layer: CharLayer | TextLayer | BarLayer, event: ReactPointerEvent<HTMLElement>) => {
    if (activeLayer === 'canvas') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (spacePressed) return;
    event.preventDefault();
    setActiveLayer(layer);
    if (!config) return;
    const dragStartSnapshot = cloneConfig(config);
    let startX = event.clientX;
    let startY = event.clientY;
    let hasMoved = false;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = Math.round(moveEvent.clientX - startX);
      const deltaY = Math.round(moveEvent.clientY - startY);
      
      if (deltaX !== 0 || deltaY !== 0) {
        hasMoved = true;
      }

      updateLayerPosition(layer, deltaX, deltaY, false);
      startX = moveEvent.clientX;
      startY = moveEvent.clientY;
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      if (hasMoved) {
        const preventClick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
        };
        window.addEventListener('click', preventClick, { capture: true, once: true });
        setTimeout(() => {
          window.removeEventListener('click', preventClick, { capture: true });
        }, 50);
      }

      setConfig((current) => {
        if (!current || isSameConfig(current, dragStartSnapshot)) return current;
        pushUndoSnapshot(dragStartSnapshot);
        return current;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleResizeFromCornerPointerDown = (
    layer: CharLayer | BarLayer,
    corner: 'nw' | 'ne' | 'sw' | 'se',
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveLayer(layer);
    if (!config) return;
    const resizeStartSnapshot = cloneConfig(config);

    const signX = corner === 'ne' || corner === 'se' ? 1 : -1;
    const signY = corner === 'sw' || corner === 'se' ? 1 : -1;
    const layerState = getLayerState(layer);
    const startHalfW = (cardWidth * (layerState.scale / 100)) / 2;
    const startHalfH = (cardHeight * (layerState.scale / 100)) / 2;
    const anchor = {
      x: layerState.x - signX * startHalfW,
      y: layerState.y - signY * startHalfH,
    };
    const startPointer = { x: event.clientX, y: event.clientY };
    const startCorner = {
      x: layerState.x + signX * startHalfW,
      y: layerState.y + signY * startHalfH,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const pointerDeltaX = moveEvent.clientX - startPointer.x;
      const pointerDeltaY = moveEvent.clientY - startPointer.y;
      const rawCorner = {
        x: startCorner.x + pointerDeltaX,
        y: startCorner.y + pointerDeltaY,
      };

      const rawWidth = Math.abs(rawCorner.x - anchor.x);
      const rawHeight = Math.abs(rawCorner.y - anchor.y);
      const constrainedWidth = Math.max(rawWidth, rawHeight * (2 / 3), 80);
      const newScale = (constrainedWidth / cardWidth) * 100;
      const clampedScale = Math.max(40, Math.min(300, Math.round(newScale)));
      const clampedWidth = (cardWidth * clampedScale) / 100;
      const clampedHeight = (cardHeight * clampedScale) / 100;
      const normalizedCorner = {
        x: anchor.x + signX * clampedWidth,
        y: anchor.y + signY * clampedHeight,
      };
      const newCenter = {
        x: (anchor.x + normalizedCorner.x) / 2,
        y: (anchor.y + normalizedCorner.y) / 2,
      };

      setConfig((prev) => {
        if (!prev) return prev;
        if (layer === 'char-bg') {
          return {
            ...prev,
            char_bg_pos: {
              x: Math.round(newCenter.x),
              y: Math.round(newCenter.y),
            },
            char_bg_scale: clampedScale,
          };
        }
        if (layer === 'hp-bar') {
          return {
            ...prev,
            hp_bar_pos: {
              x: Math.round(newCenter.x),
              y: Math.round(newCenter.y),
            },
            hp_bar_scale: clampedScale,
          };
        }
        return {
          ...prev,
          char_fg_pos: {
            x: Math.round(newCenter.x),
            y: Math.round(newCenter.y),
          },
          char_fg_scale: clampedScale,
        };
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setConfig((current) => {
        if (!current || isSameConfig(current, resizeStartSnapshot)) return current;
        pushUndoSnapshot(resizeStartSnapshot);
        return current;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;

    // Delegate to mask handler when in mask mode unless space is pressed
    if ((activeLayer === 'mask-bg' || activeLayer === 'mask-fg') && !spacePressed) {
      handleMaskPointerDown(activeLayer, event);
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    setCanvasPanning(true);
    const startX = event.clientX;
    const startY = event.clientY;
    const startPan = { ...canvasPan };
    const onPointerMove = (moveEvent: PointerEvent) => {
      setCanvasPan({
        x: startPan.x + (moveEvent.clientX - startX),
        y: startPan.y + (moveEvent.clientY - startY),
      });
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setCanvasPanning(false);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleCanvasWheel = useCallback((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasZoom((prev) => Math.max(25, Math.min(300, Math.round(prev - event.deltaY * 0.08))));
  }, []);

  const handleCharUpload = (layer: CharLayer, file: File | null) => {
    if (!slug || !file) return;
    setUploadingCharLayer(layer);
    setSaveError(null);
    const formData = new FormData();
    formData.append('file', file);
    const endpoint = isAction ? `/api/action-bg/${slug}` : `/api/card-char/${slug}/${layer}`;
    void fetch(endpoint, {
      method: 'POST',
      body: formData,
    })
      .then(async (res) => {
        if (res.ok) return;
        const message = await res.text();
        throw new Error(message || 'Failed to upload image');
      })
      .then(() => {
        setCharImageVersion((prev) => ({
          ...prev,
          [layer]: prev[layer] + 1,
        }));
      })
      .catch((err: Error) => {
        setSaveError(err.message);
        alert('Gagal mengunggah gambar: ' + err.message);
      })
      .finally(() => {
        setUploadingCharLayer(null);
      });
  };

  const applySelectedAsset = (item: AssetItem) => {
    if (!slug || !assetPickerTarget) return;
    if (assetPickerTarget === 'card') {
      commitConfig((prev) => ({ ...prev, frame_image: item.url }));
      setAssetPickerTarget(null);
      return;
    }
    setAssetApplying(true);
    setSaveError(null);
    const endpoint = isAction ? `/api/action-bg-select/${slug}` : `/api/card-char-select/${slug}/${assetPickerTarget}`;
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: item.name }),
    })
      .then(async (res) => {
        if (res.ok) return;
        const message = await res.text();
        throw new Error(message || 'Failed to apply asset');
      })
      .then(() => {
        setCharImageVersion((prev) => ({
          ...prev,
          [assetPickerTarget]: prev[assetPickerTarget] + 1,
        }));
        setAssetPickerTarget(null);
      })
      .catch((err: Error) => {
        setSaveError(err.message);
        alert('Gagal memilih aset: ' + err.message);
      })
      .finally(() => {
        setAssetApplying(false);
      });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat editor...
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Hero tidak ditemukan</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to={isAction ? '/?tab=actions' : '/?tab=heroes'}>Kembali ke daftar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showingPoseHeader = !isAction && currentTab === 'pose';
  const activeSaveError = showingPoseHeader ? poseHeaderActions?.saveError : saveError;

  return (
    <div className="h-dvh overflow-hidden bg-background">
      <Tabs value={currentTab} onValueChange={handleTabChange} className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col gap-4 overflow-hidden p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to={isAction ? '/?tab=actions' : '/?tab=heroes'}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold capitalize md:text-xl">{slug?.replace(/-/g, ' ')}</h1>
            </div>
          </div>

          <TabsList>
            <TabsTrigger value="card">Card</TabsTrigger>
            {!isAction && <TabsTrigger value="pose">Pose</TabsTrigger>}
            <TabsTrigger value="stats">Stats</TabsTrigger>
            {isAction && <TabsTrigger value="vfx">VFX</TabsTrigger>}
            {!isAction && <TabsTrigger value="info">Info</TabsTrigger>}
            {!isAction && <TabsTrigger value="audio">Audio</TabsTrigger>}
          </TabsList>

          {showingPoseHeader ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Animap</Badge>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={poseHeaderActions?.handleUndo}
                disabled={!poseHeaderActions?.canUndo || poseHeaderActions.saving}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={poseHeaderActions?.handleRedo}
                disabled={!poseHeaderActions?.canRedo || poseHeaderActions.saving}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void poseHeaderActions?.handleSave()}
                disabled={!poseHeaderActions || poseHeaderActions.saving}
              >
                {poseHeaderActions?.saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Editor</Badge>
              <Button type="button" variant="secondary" size="icon" onClick={handleUndo} disabled={undoStack.length === 0 || saving}>
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button type="button" variant="secondary" size="icon" onClick={handleRedo} disabled={redoStack.length === 0 || saving}>
                <Redo2 className="h-4 w-4" />
              </Button>
              {saving && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </header>
        {activeSaveError && (
          <div className="shrink-0 px-1 text-xs text-red-500">
            Gagal menyimpan: {activeSaveError}
          </div>
        )}

          <TabsContent value="card" forceMount className="mt-0 flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
            <main className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[320px_1fr_280px]">
              <LayerControls
                isAction={isAction}
                activeLayer={activeLayer}
                config={config as any}
                commitConfig={commitConfig as any}
                setAssetPickerTarget={setAssetPickerTarget}
                copyAllLayerProperties={copyAllLayerProperties}
                pasteAllLayerProperties={pasteAllLayerProperties}
                resetAllLayerProperties={resetAllLayerProperties}
                copySingleProperty={copySingleProperty}
                pasteSingleProperty={pasteSingleProperty}
                resetLayerProperty={resetLayerProperty}
                applyLayerProperty={applyLayerProperty}
                updateLayerScale={updateLayerScale}
                handleCharUpload={handleCharUpload}
                uploadingCharLayer={uploadingCharLayer as CharLayer | null}
                layerClipboard={layerClipboard}
                propertyClipboard={propertyClipboard}
                brushSize={brushSize}
                setBrushSize={setBrushSize}
                brushOpacity={brushOpacity}
                setBrushOpacity={setBrushOpacity}
                brushHardness={brushHardness}
                setBrushHardness={setBrushHardness}
                brushMode={brushMode}
                setBrushMode={setBrushMode}
                clearMaskLayer={clearMaskLayer}
                copyMaskLayer={(layer: MaskLayer) => {
                  const canvas = getMaskCanvasRef(layer).current;
                  if (canvas) {
                    setMaskClipboard(canvas.toDataURL('image/png'));
                  }
                }}
                pasteMaskLayer={(layer: MaskLayer) => {
                  if (!maskClipboard) return;
                  if (config) {
                    pushUndoSnapshot(config);
                  }
                  const canvas = getMaskCanvasRef(layer).current;
                  if (canvas) {
                    const context = canvas.getContext('2d');
                    if (context) {
                      const img = new Image();
                      img.onload = () => {
                        context.clearRect(0, 0, canvas.width, canvas.height);
                        context.drawImage(img, 0, 0, canvas.width, canvas.height);
                        setMaskVersion(v => v + 1);
                      };
                      img.src = maskClipboard;
                    }
                  }
                }}
                maskClipboard={maskClipboard}
                charLayerUrls={{ 'char-bg': bgUrl, 'char-fg': fgUrl }}
                onRename={handleRename}
              />

              <CardCanvas
                activeLayer={activeLayer}
                setActiveLayer={setActiveLayer}
                config={config as any}
                visibleLayers={visibleLayers}
                canvasZoom={canvasZoom}
                canvasPan={canvasPan}
                canvasPanning={canvasPanning}
                spacePressed={spacePressed}
                cardBaseSize={cardBaseSize}
                cardFrameRef={cardFrameRef}
                maskBgCanvasRef={maskBgCanvasRef}
                maskFgCanvasRef={maskFgCanvasRef}
                activeFrameSrc={activeFrameSrc}
                bgUrl={bgUrl}
                fgUrl={fgUrl}
                onCanvasPointerDown={handleCanvasPointerDown}
                onCanvasWheel={handleCanvasWheel}
                onLayerPointerDown={handleLayerPointerDown}
                onMaskPointerDown={handleMaskPointerDown}
                onResizePointerDown={handleResizeFromCornerPointerDown}
                brushSize={brushSize}
                containerRef={canvasContainerRef}
                layerAspectRatios={layerAspectRatios}
                isAction={isAction}
              />

              <LayerList
                isAction={isAction}
                activeLayer={activeLayer}
                setActiveLayer={setActiveLayer}
                visibleLayers={visibleLayers}
                setVisibleLayers={setVisibleLayers}
                canvasZoom={canvasZoom}
                setCanvasZoom={setCanvasZoom}
                setCanvasPan={setCanvasPan}
                onResetZoom={handleFitToScreen}

              />
            </main>
          </TabsContent>

          {!isAction && (
            <TabsContent value="pose" forceMount className="mt-0 flex-1 min-h-0 data-[state=active]:flex flex-col data-[state=inactive]:hidden">
              <HeroPoseAnimapTab heroSlug={slug || ''} onHeaderActionsChange={setPoseHeaderActions} />
            </TabsContent>
          )}

          <TabsContent value="stats" forceMount className="mt-0 flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
            {isAction ? (
              <ActionStatsTab config={config as unknown as ActionConfig} onChange={commitConfig as any} />
            ) : (
              <HeroStatsTab config={config as HeroConfig} onChange={commitConfig as any} />
            )}
          </TabsContent>

          {isAction && (
            <TabsContent value="vfx" forceMount className="mt-0 flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
              <ActionVFXTab config={config as unknown as ActionConfig} onChange={commitConfig as any} slug={slug || ''} />
            </TabsContent>
          )}

          {!isAction && (
            <TabsContent value="info">
              <HeroInfoTab config={config as HeroConfig} onChange={commitConfig as any} />
            </TabsContent>
          )}

          {!isAction && (
            <TabsContent value="audio">
              <HeroAudioTab config={config as HeroConfig} onChange={commitConfig as any} slug={slug || ''} />
            </TabsContent>
          )}
        </Tabs>
      {assetPickerTarget && (
        <AssetPicker
          target={assetPickerTarget}
          onSelect={applySelectedAsset}
          onClose={() => setAssetPickerTarget(null)}
          applying={assetApplying}
          isAction={isAction}
        />
      )}
    </div>
  );
}
