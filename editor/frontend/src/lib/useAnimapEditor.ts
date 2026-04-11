import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnimapConfig, AnimapLayer, AnimapState } from '@/types';
import {
  DEFAULT_STATE_ID,
  getAnimapState,
  getEffectiveLayer,
  normalizeAnimapConfig,
} from '@/lib/animap-state';

function cloneConfig(c: AnimapConfig): AnimapConfig {
  return JSON.parse(JSON.stringify(c));
}

export interface UseAnimapEditorReturn {
  // Core state
  slug: string;
  config: AnimapConfig | null;
  loading: boolean;
  saving: boolean;
  saveError: string | null;
  hasUnsavedChanges: boolean;

  // Layer selection
  selectedLayerId: string | null;
  selectedLayerBase: AnimapLayer | null;
  selectedLayer: AnimapLayer | null;
  selectedStateId: string;
  selectedState: AnimapState | null;
  setSelectedStateId: (id: string) => void;
  handleSelectLayer: (id: string | null) => Promise<void>;

  // Undo/redo
  undoStack: AnimapConfig[];
  redoStack: AnimapConfig[];
  handleUndo: () => void;
  handleRedo: () => void;
  commitConfig: (updater: (prev: AnimapConfig) => AnimapConfig) => void;

  // Canvas
  canvasZoom: number;
  setCanvasZoom: React.Dispatch<React.SetStateAction<number>>;
  canvasPan: { x: number; y: number };
  setCanvasPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  fileVersion: number;

  // Mask / brush
  brushSize: number;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  brushOpacity: number;
  setBrushOpacity: React.Dispatch<React.SetStateAction<number>>;
  brushHardness: number;
  setBrushHardness: React.Dispatch<React.SetStateAction<number>>;
  brushMode: 'paint' | 'erase';
  setBrushMode: React.Dispatch<React.SetStateAction<'paint' | 'erase'>>;
  maskCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  setMaskDirty: React.Dispatch<React.SetStateAction<boolean>>;
  activeVideoRef: React.MutableRefObject<HTMLVideoElement | null>;

  // Size edit
  showSizeEdit: boolean;
  setShowSizeEdit: React.Dispatch<React.SetStateAction<boolean>>;
  editWidth: string;
  setEditWidth: React.Dispatch<React.SetStateAction<string>>;
  editHeight: string;
  setEditHeight: React.Dispatch<React.SetStateAction<string>>;

  // Convert progress
  convertProgress: number | null;

  // Actions
  handleSave: () => Promise<void>;
  handleLayerUpload: (layerId: string, file: File) => Promise<void>;
}

export function useAnimapEditor(slug: string | undefined): UseAnimapEditorReturn {
  const [config, setConfig] = useState<AnimapConfig | null>(null);
  const [initialConfig, setInitialConfig] = useState<AnimapConfig | null>(null);
  const [undoStack, setUndoStack] = useState<AnimapConfig[]>([]);
  const [redoStack, setRedoStack] = useState<AnimapConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedStateId, setSelectedStateId] = useState(DEFAULT_STATE_ID);
  const [fileVersion, setFileVersion] = useState(0);
  const [convertProgress, setConvertProgress] = useState<number | null>(null);

  const zoomStorageKey = `animap-editor-zoom-${slug}`;
  const [canvasZoom, setCanvasZoom] = useState(() => {
    const saved = localStorage.getItem(zoomStorageKey);
    return saved ? parseInt(saved, 10) : 100;
  });
  const panStorageKey = `animap-editor-pan-${slug}`;
  const [canvasPan, setCanvasPan] = useState(() => {
    const saved = localStorage.getItem(panStorageKey);
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return { x: 0, y: 0 };
  });

  // Mask drawing state
  const [brushSize, setBrushSize] = useState(40);
  const [brushOpacity, setBrushOpacity] = useState(1.0);
  const [brushHardness, setBrushHardness] = useState(0.8);
  const [brushMode, setBrushMode] = useState<'paint' | 'erase'>('paint');
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [maskDirty, setMaskDirty] = useState(false);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const [showSizeEdit, setShowSizeEdit] = useState(false);
  const [editWidth, setEditWidth] = useState('');
  const [editHeight, setEditHeight] = useState('');

  const hasUnsavedChanges = config && initialConfig
    ? JSON.stringify(config) !== JSON.stringify(initialConfig) || maskDirty
    : false;

  const pushUndo = (snapshot: AnimapConfig) => {
    setUndoStack((prev) => [...prev.slice(-49), cloneConfig(snapshot)]);
    setRedoStack([]);
  };

  const commitConfig = useCallback((updater: (prev: AnimapConfig) => AnimapConfig) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      pushUndo(prev);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    setConfig((prev) => {
      if (!prev) return prev;
      const previous = undoStack[undoStack.length - 1];
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => [...s.slice(-49), cloneConfig(prev)]);
      return cloneConfig(previous);
    });
  }, [undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    setConfig((prev) => {
      if (!prev) return prev;
      const next = redoStack[redoStack.length - 1];
      setRedoStack((s) => s.slice(0, -1));
      setUndoStack((s) => [...s.slice(-49), cloneConfig(prev)]);
      return cloneConfig(next);
    });
  }, [redoStack]);

  // Load config
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/animap/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data: AnimapConfig) => {
        const normalized = normalizeAnimapConfig(data);
        setConfig(normalized);
        setInitialConfig(cloneConfig(normalized));
        if (normalized.layers.length > 0) {
          setSelectedLayerId(normalized.layers[0].id);
        }
        setSelectedStateId(DEFAULT_STATE_ID);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setSaveError('Failed to load animap');
      });
  }, [slug]);

  // Upload mask canvas to server
  const saveMaskCanvas = useCallback(async (layerId: string): Promise<string | null> => {
    if (!slug || !maskCanvasRef.current || !config) return null;
    const blob = await new Promise<Blob | null>((resolve) =>
      maskCanvasRef.current!.toBlob(resolve, 'image/webp', 0.9)
    );
    if (!blob) return null;
    const layer = config.layers.find((l) => l.id === layerId);
    const fd = new FormData();
    fd.append('file', blob, `${layerId}.webp`);
    if (layer?.name) fd.append('name', layer.name);
    if (layer?.file) fd.append('old_file', layer.file);
    const res = await fetch(`/api/animap-layer/${slug}/${layerId}`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) return null;
    const data = await res.json();
    setFileVersion((v) => v + 1);
    return data.file as string;
  }, [slug, config]);

  // Save
  const handleSave = useCallback(async () => {
    if (!config || !slug) return;
    setSaving(true);
    setSaveError(null);

    try {
      let configToSave = config;

      // Save mask if dirty
      if (maskDirty && selectedLayerId) {
        const selectedLayer = config.layers.find((l) => l.id === selectedLayerId);
        if (selectedLayer?.type === 'mask') {
          const newFile = await saveMaskCanvas(selectedLayerId);
          if (newFile) {
            configToSave = {
              ...configToSave,
              layers: configToSave.layers.map((l) =>
                l.id === selectedLayerId ? { ...l, file: newFile } : l
              ),
            };
          }
        }
      }

      // Save config
      configToSave = normalizeAnimapConfig(configToSave);
      const res = await fetch(`/api/animap/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToSave),
      });
      if (!res.ok) throw new Error('Save failed');
      setConfig(configToSave);
      setInitialConfig(cloneConfig(configToSave));
      setMaskDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [config, slug, maskDirty, selectedLayerId, saveMaskCanvas]);

  // Auto-save mask when switching away from a mask layer
  const handleSelectLayer = useCallback(async (id: string | null) => {
    if (maskDirty && selectedLayerId && selectedLayerId !== id && maskCanvasRef.current && config) {
      const currentLayer = config.layers.find((l) => l.id === selectedLayerId);
      if (currentLayer?.type === 'mask') {
        const newFile = await saveMaskCanvas(selectedLayerId);
        if (newFile) {
          setConfig((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              layers: prev.layers.map((l) =>
                l.id === selectedLayerId ? { ...l, file: newFile } : l
              ),
            };
          });
        }
        setMaskDirty(false);
      }
    }
    setSelectedLayerId(id);
  }, [maskDirty, selectedLayerId, config, saveMaskCanvas]);

  // Auto-save: debounce 1s after config or mask changes
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!config || !slug || loading) return;
    const configChanged = initialConfig && JSON.stringify(config) !== JSON.stringify(initialConfig);
    if (!configChanged && !maskDirty) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleSave();
    }, 1000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [config, slug, loading, maskDirty]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (
          document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA'
        )
          return;
        if (selectedLayerId && config) {
          commitConfig((prev) => ({
            ...prev,
            layers: prev.layers.filter((l) => l.id !== selectedLayerId),
          }));
          handleSelectLayer(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleUndo, handleRedo, selectedLayerId, config, commitConfig, handleSelectLayer]);

  // Persist zoom & pan
  useEffect(() => {
    localStorage.setItem(zoomStorageKey, String(canvasZoom));
  }, [canvasZoom]);

  useEffect(() => {
    localStorage.setItem(panStorageKey, JSON.stringify(canvasPan));
  }, [canvasPan]);

  const handleLayerUpload = async (layerId: string, file: File) => {
    if (!slug || !config) return;
    const layer = config.layers.find((l) => l.id === layerId);
    const fd = new FormData();
    fd.append('file', file);
    if (layer?.name) fd.append('name', layer.name);
    if (layer?.file) fd.append('old_file', layer.file);
    console.log('[upload] starting', { layerId, fileName: file.name, size: file.size, type: file.type, layerName: layer?.name, oldFile: layer?.file });
    try {
      setConvertProgress(-1);
      const res = await fetch(`/api/animap-layer/${slug}/${layerId}`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      console.log('[upload] response', data);

      if (data.status === 'converting' && data.task) {
        setConvertProgress(0);
        const pollProgress = async (): Promise<string> => {
          while (true) {
            await new Promise((r) => setTimeout(r, 500));
            const statusRes = await fetch(`/api/animap-convert-status/${data.task}`);
            if (!statusRes.ok) throw new Error('Conversion status check failed');
            const status = await statusRes.json();
            console.log('[upload] poll', status);
            setConvertProgress(status.progress);
            if (status.done) {
              if (status.error) throw new Error(status.error);
              console.log('[upload] conversion done, file:', status.file);
              return status.file;
            }
          }
        };
        const fileName = await pollProgress();
        setConvertProgress(null);
        console.log('[upload] setting layer file to:', fileName);
        commitConfig((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === layerId ? { ...l, file: fileName } : l
          ),
        }));
      } else {
        setConvertProgress(null);
        console.log('[upload] saved directly, file:', data.file);
        commitConfig((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === layerId ? { ...l, file: data.file } : l
          ),
        }));
      }
      setFileVersion((v) => v + 1);
      console.log('[upload] fileVersion bumped');
    } catch (err) {
      console.error('[upload] failed', err);
      setConvertProgress(null);
      alert('Upload failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Derived state
  const selectedLayerBase = config?.layers.find((l) => l.id === selectedLayerId) || null;
  const selectedLayer = selectedLayerBase && config ? getEffectiveLayer(config, selectedLayerBase, selectedStateId) : null;
  const selectedState = config ? getAnimapState(config, selectedStateId) : null;

  return {
    slug: slug || '',
    config,
    loading,
    saving,
    saveError,
    hasUnsavedChanges: !!hasUnsavedChanges,

    selectedLayerId,
    selectedLayerBase,
    selectedLayer,
    selectedStateId,
    selectedState,
    setSelectedStateId,
    handleSelectLayer,

    undoStack,
    redoStack,
    handleUndo,
    handleRedo,
    commitConfig,

    canvasZoom,
    setCanvasZoom,
    canvasPan,
    setCanvasPan,
    fileVersion,

    brushSize,
    setBrushSize,
    brushOpacity,
    setBrushOpacity,
    brushHardness,
    setBrushHardness,
    brushMode,
    setBrushMode,
    maskCanvasRef,
    setMaskDirty,
    activeVideoRef,

    showSizeEdit,
    setShowSizeEdit,
    editWidth,
    setEditWidth,
    editHeight,
    setEditHeight,

    convertProgress,

    handleSave,
    handleLayerUpload,
  };
}
