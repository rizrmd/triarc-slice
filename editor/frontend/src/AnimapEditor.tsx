import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AnimapConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Redo2, Save, Undo2 } from 'lucide-react';
import { AnimapLayerPanel } from '@/components/animap-editor/AnimapLayerPanel';
import { AnimapCanvas } from '@/components/animap-editor/AnimapCanvas';
import { AnimapPropertyPanel } from '@/components/animap-editor/AnimapPropertyPanel';
import {
  DEFAULT_STATE_ID,
  getAnimapState,
  getEffectiveLayer,
  normalizeAnimapConfig,
} from '@/lib/animap-state';

function cloneConfig(c: AnimapConfig): AnimapConfig {
  return JSON.parse(JSON.stringify(c));
}

export default function AnimapEditor() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

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

  const zoomStorageKey = 'animap-editor-zoom';
  const [canvasZoom, setCanvasZoom] = useState(() => {
    const saved = localStorage.getItem(zoomStorageKey);
    return saved ? parseInt(saved, 10) : 100;
  });
  const panStorageKey = 'animap-editor-pan';
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

  // Save mask canvas to server and update layer.file
  // Saves raw strokes: white where painted, transparent elsewhere.
  // Video layers use canvas destination-out to hide painted areas.
  const saveMaskCanvas = useCallback(async (layerId: string) => {
    if (!slug || !maskCanvasRef.current) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      maskCanvasRef.current!.toBlob(resolve, 'image/webp', 0.9)
    );
    if (!blob) return;
    const fd = new FormData();
    fd.append('file', blob, `${layerId}.webp`);
    const res = await fetch(`/api/animap-layer/${slug}/${layerId}`, {
      method: 'POST',
      body: fd,
    });
    if (res.ok) {
      const data = await res.json();
      setConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === layerId ? { ...l, file: data.file } : l
          ),
        };
      });
      setFileVersion((v) => v + 1);
    }
    setMaskDirty(false);
  }, [slug]);

  // Save
  const handleSave = useCallback(async () => {
    if (!config || !slug) return;
    setSaving(true);
    setSaveError(null);

    try {
      // Save mask if dirty
      if (maskDirty && selectedLayerId) {
        const selectedLayer = config.layers.find((l) => l.id === selectedLayerId);
        if (selectedLayer?.type === 'mask') {
          await saveMaskCanvas(selectedLayerId);
        }
      }

      // Save config
      const res = await fetch(`/api/animap/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Save failed');
      setInitialConfig(cloneConfig(config));
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
        await saveMaskCanvas(selectedLayerId);
      }
    }
    setSelectedLayerId(id);
  }, [maskDirty, selectedLayerId, config, saveMaskCanvas]);

  // Auto-save: debounce 1s after config changes
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!config || !slug || loading) return;
    // Skip if config hasn't changed from initial load
    if (initialConfig && JSON.stringify(config) === JSON.stringify(initialConfig)) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleSave();
    }, 1000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [config, slug, loading]);

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
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`/api/animap-layer/${slug}/${layerId}`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      commitConfig((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId ? { ...l, file: data.file } : l
        ),
      }));
      setFileVersion((v) => v + 1);
    } catch (err) {
      alert('Upload failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

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

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">
          {saveError || 'Animap not found'}
          <Button variant="link" onClick={() => navigate('/animaps')} className="ml-2">
            Back
          </Button>
        </div>
      </div>
    );
  }

  const selectedLayerBase = config.layers.find((l) => l.id === selectedLayerId) || null;
  const selectedLayer = selectedLayerBase ? getEffectiveLayer(config, selectedLayerBase, selectedStateId) : null;
  const selectedState = getAnimapState(config, selectedStateId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/animaps')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">{config.name}</h1>
          <div className="relative">
            <Badge
              variant="secondary"
              className="text-xs cursor-pointer hover:bg-muted"
              onClick={() => {
                setEditWidth(String(config.width));
                setEditHeight(String(config.height));
                setShowSizeEdit(!showSizeEdit);
              }}
            >
              {config.width}x{config.height}
            </Badge>
            {showSizeEdit && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg p-3 space-y-2 w-48">
                <div className="flex items-center gap-2">
                  <label className="text-xs w-6">W</label>
                  <input
                    type="number"
                    className="h-7 w-full rounded border bg-background px-2 text-xs"
                    value={editWidth}
                    onChange={(e) => setEditWidth(e.target.value)}
                    min={1}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const w = parseInt(editWidth) || config.width;
                        const h = parseInt(editHeight) || config.height;
                        commitConfig((prev) => ({ ...prev, width: w, height: h }));
                        setShowSizeEdit(false);
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs w-6">H</label>
                  <input
                    type="number"
                    className="h-7 w-full rounded border bg-background px-2 text-xs"
                    value={editHeight}
                    onChange={(e) => setEditHeight(e.target.value)}
                    min={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const w = parseInt(editWidth) || config.width;
                        const h = parseInt(editHeight) || config.height;
                        commitConfig((prev) => ({ ...prev, width: w, height: h }));
                        setShowSizeEdit(false);
                      }
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    className="flex-1 h-7 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90"
                    onClick={() => {
                      const w = parseInt(editWidth) || config.width;
                      const h = parseInt(editHeight) || config.height;
                      commitConfig((prev) => ({ ...prev, width: w, height: h }));
                      setShowSizeEdit(false);
                    }}
                  >
                    Apply
                  </button>
                  <button
                    className="h-7 px-2 rounded border text-xs hover:bg-muted"
                    onClick={() => setShowSizeEdit(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {hasUnsavedChanges && (
            <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500">
              Unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          {saveError && <span className="text-xs text-destructive">{saveError}</span>}
        </div>
      </header>

      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Layer Panel */}
        <div className="w-64 flex-shrink-0 overflow-y-auto border-r">
          <AnimapLayerPanel
            config={config}
            selectedLayerId={selectedLayerId}
            selectedStateId={selectedStateId}
            setSelectedStateId={setSelectedStateId}
            setSelectedLayerId={handleSelectLayer}
            commitConfig={commitConfig}
            canvasZoom={canvasZoom}
            setCanvasZoom={setCanvasZoom}
            setCanvasPan={setCanvasPan}
          />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 overflow-hidden">
          <AnimapCanvas
            slug={slug || ''}
            config={config}
            selectedStateId={selectedStateId}
            selectedLayerId={selectedLayerId}
            setSelectedLayerId={handleSelectLayer}
            commitConfig={commitConfig}
            canvasZoom={canvasZoom}
            canvasPan={canvasPan}
            setCanvasPan={setCanvasPan}
            fileVersion={fileVersion}
            brushSize={brushSize}
            brushOpacity={brushOpacity}
            brushHardness={brushHardness}
            brushMode={brushMode}
            maskCanvasRef={maskCanvasRef}
            setMaskDirty={setMaskDirty}
          />
        </div>

        {/* Right: Property Panel */}
        <div className="w-72 flex-shrink-0 overflow-y-auto border-l">
          <AnimapPropertyPanel
            slug={slug || ''}
            config={config}
            selectedState={selectedState}
            selectedStateId={selectedStateId}
            selectedLayer={selectedLayer}
            selectedLayerBase={selectedLayerBase}
            commitConfig={commitConfig}
            onUpload={handleLayerUpload}
            fileVersion={fileVersion}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            brushOpacity={brushOpacity}
            setBrushOpacity={setBrushOpacity}
            brushHardness={brushHardness}
            setBrushHardness={setBrushHardness}
            brushMode={brushMode}
            setBrushMode={setBrushMode}
          />
        </div>
      </div>
    </div>
  );
}
