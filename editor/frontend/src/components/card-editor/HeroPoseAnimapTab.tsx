import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimapLayerPanel } from '@/components/animap-editor/AnimapLayerPanel';
import { AnimapCanvas } from '@/components/animap-editor/AnimapCanvas';
import { AnimapPropertyPanel } from '@/components/animap-editor/AnimapPropertyPanel';
import { useAnimapEditor } from '@/lib/useAnimapEditor';

export interface HeroPoseHeaderActions {
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  saveError: string | null;
  hasUnsavedChanges: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  handleSave: () => Promise<void>;
}

interface HeroPoseAnimapTabProps {
  heroSlug: string;
  onHeaderActionsChange?: (actions: HeroPoseHeaderActions | null) => void;
}

export function HeroPoseAnimapTab({ heroSlug, onHeaderActionsChange }: HeroPoseAnimapTabProps) {
  const animapSlug = `pose-${heroSlug}`;
  const editor = useAnimapEditor(animapSlug);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!onHeaderActionsChange) {
      return;
    }

    if (editor.loading || !editor.config) {
      onHeaderActionsChange(null);
      return () => onHeaderActionsChange(null);
    }

    onHeaderActionsChange({
      canUndo: editor.undoStack.length > 0,
      canRedo: editor.redoStack.length > 0,
      saving: editor.saving,
      saveError: editor.saveError,
      hasUnsavedChanges: editor.hasUnsavedChanges,
      handleUndo: editor.handleUndo,
      handleRedo: editor.handleRedo,
      handleSave: editor.handleSave,
    });

    return () => onHeaderActionsChange(null);
  }, [
    editor.config,
    editor.handleRedo,
    editor.handleSave,
    editor.handleUndo,
    editor.hasUnsavedChanges,
    editor.loading,
    editor.redoStack.length,
    editor.saveError,
    editor.saving,
    editor.undoStack.length,
    onHeaderActionsChange,
  ]);

  if (editor.loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading pose...
        </div>
      </div>
    );
  }

  // Pose animap doesn't exist yet — offer to create
  if (!editor.config) {
    const handleCreate = async () => {
      setCreating(true);
      try {
        const defaultConfig = {
          name: `Pose: ${heroSlug}`,
          width: 320,
          height: 517,
          layers: [],
          states: [{ id: 'default', name: 'Default' }],
        };
        const res = await fetch(`/api/animap/${animapSlug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(defaultConfig),
        });
        if (!res.ok) throw new Error('Failed to create pose animap');
        // Reload by remounting — simplest approach
        window.location.reload();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Create failed');
      } finally {
        setCreating(false);
      }
    };

    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground text-sm">No pose configured for this hero.</p>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Pose
          </Button>
        </div>
      </div>
    );
  }

  const { config } = editor;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-56 flex-shrink-0 overflow-y-auto border-r">
        <AnimapLayerPanel
          slug={editor.slug}
          config={config}
          selectedLayerId={editor.selectedLayerId}
          selectedStateId={editor.selectedStateId}
          setSelectedStateId={editor.setSelectedStateId}
          setSelectedLayerId={editor.handleSelectLayer}
          commitConfig={editor.commitConfig}
          canvasZoom={editor.canvasZoom}
          setCanvasZoom={editor.setCanvasZoom}
          setCanvasPan={editor.setCanvasPan}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        <AnimapCanvas
          slug={editor.slug}
          config={config}
          selectedStateId={editor.selectedStateId}
          selectedLayerId={editor.selectedLayerId}
          commitConfig={editor.commitConfig}
          canvasZoom={editor.canvasZoom}
          setCanvasZoom={editor.setCanvasZoom}
          canvasPan={editor.canvasPan}
          setCanvasPan={editor.setCanvasPan}
          fileVersion={editor.fileVersion}
          brushSize={editor.brushSize}
          brushOpacity={editor.brushOpacity}
          brushHardness={editor.brushHardness}
          brushMode={editor.brushMode}
          maskCanvasRef={editor.maskCanvasRef}
          setMaskDirty={editor.setMaskDirty}
          activeVideoRef={editor.activeVideoRef}
        />
      </div>

      <div className="w-64 flex-shrink-0 overflow-y-auto border-l">
        <AnimapPropertyPanel
          slug={editor.slug}
          config={config}
          selectedState={editor.selectedState!}
          selectedStateId={editor.selectedStateId}
          selectedLayer={editor.selectedLayer}
          selectedLayerBase={editor.selectedLayerBase}
          commitConfig={editor.commitConfig}
          onUpload={editor.handleLayerUpload}
          fileVersion={editor.fileVersion}
          brushSize={editor.brushSize}
          setBrushSize={editor.setBrushSize}
          brushOpacity={editor.brushOpacity}
          setBrushOpacity={editor.setBrushOpacity}
          brushHardness={editor.brushHardness}
          setBrushHardness={editor.setBrushHardness}
          brushMode={editor.brushMode}
          setBrushMode={editor.setBrushMode}
          convertProgress={editor.convertProgress}
          activeVideoRef={editor.activeVideoRef}
        />
      </div>
    </div>
  );
}
