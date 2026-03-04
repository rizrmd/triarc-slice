import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { HeroConfig, CharLayer, MaskLayer, TextLayer, CharProperty, LayerId, AssetPickerTarget, AssetItem, VisibleLayers } from '@/types';
import frameImage from './assets/frame.webp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Redo2, Undo2 } from 'lucide-react';

import { LayerControls } from '@/components/card-editor/LayerControls';
import { CardCanvas } from '@/components/card-editor/CardCanvas';
import { LayerList } from '@/components/card-editor/LayerList';
import { AssetPicker } from '@/components/card-editor/AssetPicker';

export default function CardEditor() {
  const { slug } = useParams<{ slug: string }>();
  const [config, setConfig] = useState<HeroConfig | null>(null);
  const [initialConfig, setInitialConfig] = useState<HeroConfig | null>(null);
  const [undoStack, setUndoStack] = useState<{ config: HeroConfig; masks: { 'mask-bg': string; 'mask-fg': string } }[]>([]);
  const [redoStack, setRedoStack] = useState<{ config: HeroConfig; masks: { 'mask-bg': string; 'mask-fg': string } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerId>('char-fg');
  const [visibleLayers, setVisibleLayers] = useState<VisibleLayers>({
    'char-bg': true,
    'mask-bg': true,
    card: true,
    'mask-fg': true,
    'char-fg': true,
    name: true,
  });
  const [canvasZoom, setCanvasZoom] = useState(() => {
    if (typeof window === 'undefined') return 100;
    const saved = localStorage.getItem('card-editor-zoom');
    return saved ? parseInt(saved, 10) : 100;
  });

  useEffect(() => {
    localStorage.setItem('card-editor-zoom', canvasZoom.toString());
  }, [canvasZoom]);

  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [canvasPanning, setCanvasPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [layerClipboard, setLayerClipboard] = useState<{ x: number; y: number; scale: number } | null>(null);
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
  
  const [cardBaseSize, setCardBaseSize] = useState({ width: 0, height: 0 });
  const cardFrameRef = useRef<HTMLDivElement | null>(null);
  const maskBgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskFgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [brushSize, setBrushSize] = useState(20);
  const [brushOpacity, setBrushOpacity] = useState(90);
  const [brushHardness, setBrushHardness] = useState(100);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  
  const cardWidth = cardBaseSize.width;
  const cardHeight = cardBaseSize.height;

  // ... Helper functions ...
  const cloneConfig = (source: HeroConfig): HeroConfig => ({
    ...source,
    char_bg_pos: { ...source.char_bg_pos },
    char_fg_pos: { ...source.char_fg_pos },
    name_pos: { ...source.name_pos },
    name_scale: source.name_scale,
    full_name: source.full_name,
    text_shadow_color: source.text_shadow_color || 'rgba(0, 0, 0, 0.5)',
  });
  const isSameConfig = (left: HeroConfig, right: HeroConfig) => JSON.stringify(left) === JSON.stringify(right);

  const getMaskSnapshot = useCallback(() => {
    if (lastMaskSnapshotVersionRef.current === maskVersion && lastMaskSnapshotRef.current) {
      return lastMaskSnapshotRef.current;
    }

    const bg = maskBgCanvasRef.current?.toDataURL('image/webp') || '';
    const fg = maskFgCanvasRef.current?.toDataURL('image/webp') || '';
    const snapshot = { 'mask-bg': bg, 'mask-fg': fg };

    lastMaskSnapshotRef.current = snapshot;
    lastMaskSnapshotVersionRef.current = maskVersion;
    return snapshot;
  }, [maskVersion]);

  const getMaskCanvasRef = (layer: MaskLayer) => (layer === 'mask-bg' ? maskBgCanvasRef : maskFgCanvasRef);

  const restoreMasks = useCallback((masks: { 'mask-bg': string; 'mask-fg': string }) => {
    const loadLayer = (layer: MaskLayer, src: string) => {
      const canvas = (layer === 'mask-bg' ? maskBgCanvasRef : maskFgCanvasRef).current;
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
    loadLayer('mask-bg', masks['mask-bg']);
    loadLayer('mask-fg', masks['mask-fg']);
    setMaskVersion((v) => v + 1);
  }, []);

  const pushUndoSnapshot = (snapshot: HeroConfig) => {
    const masks = getMaskSnapshot();
    setUndoStack((prev) => [...prev.slice(-49), { config: cloneConfig(snapshot), masks }]);
    setRedoStack([]);
  };
  const commitConfig = (updater: (prev: HeroConfig) => HeroConfig) => {
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
    fetch(`/api/card/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch card');
        return res.json();
      })
      .then((data) => {
        const normalized = {
          ...data,
          char_bg_scale: typeof data.char_bg_scale === 'number' && data.char_bg_scale > 0 ? data.char_bg_scale : 100,
          char_fg_scale: typeof data.char_fg_scale === 'number' && data.char_fg_scale > 0 ? data.char_fg_scale : 100,
          frame_image: typeof data.frame_image === 'string' ? data.frame_image : '',
          name_pos: data.name_pos || { x: 0, y: 0 },
          name_scale: typeof data.name_scale === 'number' && data.name_scale > 0 ? Math.max(30, data.name_scale) : 40,
          text_shadow_color: data.text_shadow_color || 'rgba(0, 0, 0, 0.5)',
        };

        // Preload frame image to prevent layout shift
        const frameSrc = normalized.frame_image || frameImage;
        const img = new window.Image();
        img.src = frameSrc;
        
        return new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            setCardBaseSize({ width: img.naturalWidth, height: img.naturalHeight });
            resolve();
            return;
          }
          img.onload = () => {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setCardBaseSize({ width: img.naturalWidth, height: img.naturalHeight });
            }
            resolve();
          };
          img.onerror = () => {
            resolve();
          };
        }).then(() => {
          setConfig(normalized);
          setInitialConfig(cloneConfig(normalized));
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
  }, [slug]);

  const handleRename = (newName: string) => {
    if (!slug) return;
    setSaving(true);
    fetch('/api/rename-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldSlug: slug, newName }),
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
          window.location.hash = `/edit/${data.newSlug}`;
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

  const activeFrameSrc = config?.frame_image || frameImage;

  useEffect(() => {
    let mounted = true;
    const image = new window.Image();
    
    console.log('[CardEditor] Starting frame image load:', activeFrameSrc);

    const updateSize = () => {
      if (!mounted) return;
      console.log('[CardEditor] Frame image loaded:', { 
        src: activeFrameSrc, 
        width: image.naturalWidth, 
        height: image.naturalHeight,
        complete: image.complete 
      });
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        setCardBaseSize({ width: image.naturalWidth, height: image.naturalHeight });
      }
    };

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
        // Fallback: try onload just in case decode failed but image is technically usable? 
        // Or just rely on onload as a backup mechanism if decode rejects?
        // Usually if decode fails, the image is bad.
      });

    // Keep onload as a backup for browsers where decode might behave strictly or differently
    image.onload = () => {
      console.log('[CardEditor] Frame image onload triggered');
      updateSize();
    };

    return () => {
      mounted = false;
      image.onload = null;
    };
  }, [activeFrameSrc]);

  // ... Save logic ...
  const saveConfig = useCallback(
    (targetConfig: HeroConfig, showAlertOnError = false) => {
      if (!slug) return Promise.resolve(false);
      setSaveError(null);
      return fetch(`/api/card/${slug}`, {
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
    [slug]
  );

  const saveMasks = useCallback(
    (showAlertOnError = false) => {
      if (!slug) return Promise.resolve(false);
      const bgCanvas = maskBgCanvasRef.current;
      const fgCanvas = maskFgCanvasRef.current;
      if (!bgCanvas || !fgCanvas) return Promise.resolve(false);
      const payload = {
        mask_bg: bgCanvas.toDataURL('image/webp'),
        mask_fg: fgCanvas.toDataURL('image/webp'),
      };
      return fetch(`/api/card-mask/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to save masks');
          return true;
        })
        .catch((err: Error) => {
          setSaveError(err.message);
          if (showAlertOnError) alert('Gagal menyimpan mask: ' + err.message);
          return false;
        });
    },
    [slug]
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
  const getLayerState = (layer: CharLayer | TextLayer) => {
    if (!config) return { x: 0, y: 0, scale: 100 };
    if (layer === 'char-bg') {
      return {
        x: config.char_bg_pos.x,
        y: config.char_bg_pos.y,
        scale: config.char_bg_scale,
      };
    }
    if (layer === 'char-fg') {
      return {
        x: config.char_fg_pos.x,
        y: config.char_fg_pos.y,
        scale: config.char_fg_scale,
      };
    }
    return {
      x: config.name_pos.x,
      y: config.name_pos.y,
      scale: config.name_scale,
    };
  };

  const updateLayerPosition = (layer: CharLayer | TextLayer, dx: number, dy: number, trackHistory = true) => {
    const updater = (prev: HeroConfig) => {
      if (layer === 'char-bg') {
        return {
          ...prev,
          char_bg_pos: {
            x: prev.char_bg_pos.x + dx,
            y: prev.char_bg_pos.y + dy,
          },
        };
      }
      if (layer === 'char-fg') {
        return {
          ...prev,
          char_fg_pos: {
            x: prev.char_fg_pos.x + dx,
            y: prev.char_fg_pos.y + dy,
          },
        };
      }
      return {
        ...prev,
        name_pos: {
          x: prev.name_pos.x + dx,
          y: prev.name_pos.y + dy,
        },
      };
    };
    if (trackHistory) {
      commitConfig(updater);
    } else {
      setConfig((prev) => (prev ? updater(prev) : prev));
    }
  };

  const updateLayerScale = (layer: CharLayer | TextLayer, scale: number) => {
    const minScale = layer === 'name' ? 30 : 40;
    const clamped = Math.max(minScale, Math.min(220, Math.round(scale)));
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
      return {
        ...prev,
        name_scale: clamped,
      };
    });
  };

  const applyLayerState = (layer: CharLayer | TextLayer, state: { x: number; y: number; scale: number }) => {
    const minScale = layer === 'name' ? 30 : 40;
    const clampedScale = Math.max(minScale, Math.min(220, Math.round(state.scale)));
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
      return {
        ...prev,
        name_pos: { x: Math.round(state.x), y: Math.round(state.y) },
        name_scale: clampedScale,
      };
    });
  };

  const applyLayerProperty = (layer: CharLayer | TextLayer, property: CharProperty, value: number) => {
    if (property === 'scale') {
      updateLayerScale(layer, value);
      return;
    }
    commitConfig((prev) => {
      if (!prev) return prev;
      const rounded = Math.round(value);
      if (layer === 'char-bg') {
        return {
          ...prev,
          char_bg_pos: {
            ...prev.char_bg_pos,
            [property]: rounded,
          },
        };
      }
      if (layer === 'char-fg') {
        return {
          ...prev,
          char_fg_pos: {
            ...prev.char_fg_pos,
            [property]: rounded,
          },
        };
      }
      return {
        ...prev,
        name_pos: {
          ...prev.name_pos,
          [property]: rounded,
        },
      };
    });
  };

  const copyAllLayerProperties = (layer: CharLayer | TextLayer) => {
    setLayerClipboard(getLayerState(layer));
  };

  const pasteAllLayerProperties = (layer: CharLayer | TextLayer) => {
    if (!layerClipboard) return;
    applyLayerState(layer, layerClipboard);
  };

  const copySingleProperty = (layer: CharLayer | TextLayer, property: CharProperty) => {
    const layerState = getLayerState(layer);
    setPropertyClipboard({
      property,
      value: layerState[property],
    });
  };

  const pasteSingleProperty = (layer: CharLayer | TextLayer, property: CharProperty) => {
    if (!propertyClipboard || propertyClipboard.property !== property) return;
    applyLayerProperty(layer, property, propertyClipboard.value);
  };

  const getDefaultLayerState = () => ({
    x: 0,
    y: 0,
    scale: 100,
  });

  const resetLayerProperty = (layer: CharLayer | TextLayer, property: CharProperty) => {
    const defaultLayer = getDefaultLayerState();
    applyLayerProperty(layer, property, defaultLayer[property]);
  };

  const resetAllLayerProperties = (layer: CharLayer | TextLayer) => {
    applyLayerState(layer, getDefaultLayerState());
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
      const activeCharLayer: CharLayer | TextLayer | null =
        activeLayer === 'char-bg' || activeLayer === 'mask-bg'
          ? 'char-bg'
          : activeLayer === 'char-fg' || activeLayer === 'mask-fg'
            ? 'char-fg'
            : activeLayer === 'name'
              ? 'name'
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
      if (event.code === 'KeyC' && isMod && activeCharLayer && config) {
        event.preventDefault();
        if (activeCharLayer === 'char-bg') {
          setLayerClipboard({ x: config.char_bg_pos.x, y: config.char_bg_pos.y, scale: config.char_bg_scale });
        } else if (activeCharLayer === 'char-fg') {
          setLayerClipboard({ x: config.char_fg_pos.x, y: config.char_fg_pos.y, scale: config.char_fg_scale });
        } else {
          setLayerClipboard({ x: config.name_pos.x, y: config.name_pos.y, scale: config.name_scale });
        }
      }
      if (event.code === 'KeyV' && isMod && activeCharLayer && layerClipboard) {
        event.preventDefault();
        const minScale = activeCharLayer === 'name' ? 30 : 40;
        const clampedScale = Math.max(minScale, Math.min(220, Math.round(layerClipboard.scale)));
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
          return {
            ...prev,
            name_pos: { x: Math.round(layerClipboard.x), y: Math.round(layerClipboard.y) },
            name_scale: clampedScale,
          };
        });
      }
      if ((event.code === 'Backspace' || event.code === 'Delete') && activeCharLayer && initialConfig) {
        event.preventDefault();
        commitConfig((prev) => {
          if (!prev) return prev;
          if (activeCharLayer === 'char-bg') {
            return {
              ...prev,
              char_bg_pos: { x: initialConfig.char_bg_pos.x, y: initialConfig.char_bg_pos.y },
              char_bg_scale: initialConfig.char_bg_scale,
            };
          }
          if (activeCharLayer === 'char-fg') {
            return {
              ...prev,
              char_fg_pos: { x: initialConfig.char_fg_pos.x, y: initialConfig.char_fg_pos.y },
              char_fg_scale: initialConfig.char_fg_scale,
            };
          }
          return {
            ...prev,
            name_pos: { x: initialConfig.name_pos.x, y: initialConfig.name_pos.y },
            name_scale: initialConfig.name_scale,
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
  }, [undoStack, redoStack, saving, config, slug, activeLayer, layerClipboard, initialConfig, maskVersion]);

  useEffect(() => {
    if (!slug || !config || !initialConfig || loading || saving) return;
    
    const configChanged = !isSameConfig(config, initialConfig);
    const maskChanged = maskVersion !== lastSavedMaskVersion.current;

    if (!configChanged && !maskChanged) return;

    const timer = window.setTimeout(() => {
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

  const [serverMaskVersion, setServerMaskVersion] = useState(Date.now());
  const [maskLoadState, setMaskLoadState] = useState<Record<MaskLayer, boolean>>({
    'mask-bg': false,
    'mask-fg': false,
  });

  useEffect(() => {
    setServerMaskVersion(Date.now());
    // Reset mask load state on slug change to prevent flash of unmasked content
    setMaskLoadState({ 'mask-bg': false, 'mask-fg': false });
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
      
      canvas.width = Math.round(cardWidth);
      canvas.height = Math.round(cardHeight);
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
      
      const src = `/cards/hero/${slug}/img/${layer}.webp?v=${serverMaskVersion}`;
      console.log(`[CardEditor] Loading mask src: ${src}`);
      image.src = src;
    };

    // If visible but no dimensions yet, mark as NOT ready to prevent unmasked flash
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

    return () => {
      isCancelled = true;
    };
  }, [slug, cardWidth, cardHeight, serverMaskVersion, visibleLayers['mask-bg'], visibleLayers['mask-fg']]);

  const drawOnMaskLayer = (layer: MaskLayer, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = getMaskCanvasRef(layer).current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.save();
    context.globalCompositeOperation = brushMode === 'erase' ? 'source-over' : 'destination-out';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    
    const alpha = brushOpacity / 100;
    context.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    context.lineWidth = brushSize;

    if (brushHardness < 100) {
      const blurAmount = (brushSize / 2) * ((100 - brushHardness) / 100);
      context.shadowBlur = blurAmount;
      context.shadowColor = `rgba(0, 0, 0, ${alpha})`;
    } else {
      context.shadowBlur = 0;
    }

    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  };

  const mapPointerToMaskCanvas = (canvas: HTMLCanvasElement, event: PointerEvent | ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleMaskPointerDown = (layer: MaskLayer, event: ReactPointerEvent<HTMLCanvasElement>) => {
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

  const handleLayerPointerDown = (layer: CharLayer | TextLayer, event: ReactPointerEvent<HTMLElement>) => {
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
    layer: CharLayer,
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
      const clampedScale = Math.max(40, Math.min(220, Math.round(newScale)));
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

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setCanvasZoom((prev) => Math.max(25, Math.min(300, Math.round(prev - event.deltaY * 0.08))));
  };

  const handleCharUpload = (layer: CharLayer, file: File | null) => {
    if (!slug || !file) return;
    setUploadingCharLayer(layer);
    setSaveError(null);
    const formData = new FormData();
    formData.append('file', file);
    void fetch(`/api/card-char/${slug}/${layer}`, {
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
    void fetch(`/api/card-char-select/${slug}/${assetPickerTarget}`, {
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
              <Link to="/">Kembali ke daftar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isMaskBgReady = !visibleLayers['mask-bg'] || maskLoadState['mask-bg'];
  const isMaskFgReady = !visibleLayers['mask-fg'] || maskLoadState['mask-fg'];

  const bgUrl = isMaskBgReady
    ? `/api/card-char/${slug}/char-bg?v=${charImageVersion['char-bg']}`
    : '';
  const fgUrl = isMaskFgReady
    ? `/api/card-char/${slug}/char-fg?v=${charImageVersion['char-fg']}`
    : '';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col px-4 py-4 md:px-6 md:py-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold capitalize md:text-xl">{slug?.replace(/-/g, ' ')}</h1>
              <p className="text-xs text-muted-foreground">Workspace layer ala Photoshop: char-bg, mask-bg, card, mask-fg, char-fg.</p>
            </div>
          </div>
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
        </header>
        {saveError && (
          <div className="mb-3 px-1 text-xs text-red-500">
            Gagal menyimpan: {saveError}
          </div>
        )}

        <main className="grid flex-1 gap-4 xl:grid-cols-[320px_1fr_280px]">
          <LayerControls
            activeLayer={activeLayer}
            config={config}
            commitConfig={commitConfig}
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
            uploadingCharLayer={uploadingCharLayer}
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
            charLayerUrls={{ 'char-bg': bgUrl, 'char-fg': fgUrl }}
            onRename={handleRename}
          />

          <CardCanvas
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            config={config}
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
          />

          <LayerList
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            visibleLayers={visibleLayers}
            setVisibleLayers={setVisibleLayers}
            canvasZoom={canvasZoom}
            setCanvasZoom={setCanvasZoom}
            setCanvasPan={setCanvasPan}
          />
        </main>
      </div>
      {assetPickerTarget && (
        <AssetPicker
          target={assetPickerTarget}
          onSelect={applySelectedAsset}
          onClose={() => setAssetPickerTarget(null)}
          applying={assetApplying}
        />
      )}
    </div>
  );
}
