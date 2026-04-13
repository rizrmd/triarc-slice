import { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Redo2, Save, Undo2 } from 'lucide-react';
import { AnimapLayerPanel } from '@/components/animap-editor/AnimapLayerPanel';
import { AnimapCanvas } from '@/components/animap-editor/AnimapCanvas';
import { AnimapPropertyPanel } from '@/components/animap-editor/AnimapPropertyPanel';
import { useAnimapEditor } from '@/lib/useAnimapEditor';

export default function AnimapEditor() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const editor = useAnimapEditor(slug);
  // Map of layerId -> EffekseerLayer imperative handle
  const effekseerLayerRefsRef = useRef<Record<string, { play: () => void; pause: () => void; isPlaying: () => boolean } | null>>({});

  if (editor.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (!editor.config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">
          {editor.saveError || 'Animap not found'}
          <Button variant="link" onClick={() => navigate('/animaps')} className="ml-2">
            Back
          </Button>
        </div>
      </div>
    );
  }

  const { config } = editor;

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
                editor.setEditWidth(String(config.width));
                editor.setEditHeight(String(config.height));
                editor.setShowSizeEdit(!editor.showSizeEdit);
              }}
            >
              {config.width}x{config.height}
            </Badge>
            {editor.showSizeEdit && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg p-3 space-y-2 w-48">
                <div className="flex items-center gap-2">
                  <label className="text-xs w-6">W</label>
                  <input
                    type="number"
                    className="h-7 w-full rounded border bg-background px-2 text-xs"
                    value={editor.editWidth}
                    onChange={(e) => editor.setEditWidth(e.target.value)}
                    min={1}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const w = parseInt(editor.editWidth) || config.width;
                        const h = parseInt(editor.editHeight) || config.height;
                        editor.commitConfig((prev) => ({ ...prev, width: w, height: h }));
                        editor.setShowSizeEdit(false);
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs w-6">H</label>
                  <input
                    type="number"
                    className="h-7 w-full rounded border bg-background px-2 text-xs"
                    value={editor.editHeight}
                    onChange={(e) => editor.setEditHeight(e.target.value)}
                    min={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const w = parseInt(editor.editWidth) || config.width;
                        const h = parseInt(editor.editHeight) || config.height;
                        editor.commitConfig((prev) => ({ ...prev, width: w, height: h }));
                        editor.setShowSizeEdit(false);
                      }
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    className="flex-1 h-7 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90"
                    onClick={() => {
                      const w = parseInt(editor.editWidth) || config.width;
                      const h = parseInt(editor.editHeight) || config.height;
                      editor.commitConfig((prev) => ({ ...prev, width: w, height: h }));
                      editor.setShowSizeEdit(false);
                    }}
                  >
                    Apply
                  </button>
                  <button
                    className="h-7 px-2 rounded border text-xs hover:bg-muted"
                    onClick={() => editor.setShowSizeEdit(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {editor.hasUnsavedChanges && (
            <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500">
              Unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={editor.handleUndo}
            disabled={editor.undoStack.length === 0}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={editor.handleRedo}
            disabled={editor.redoStack.length === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={editor.handleSave}
            disabled={editor.saving}
          >
            {editor.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          {editor.saveError && <span className="text-xs text-destructive">{editor.saveError}</span>}
        </div>
      </header>

      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Layer Panel */}
        <div className="w-64 flex-shrink-0 overflow-y-auto border-r">
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

        {/* Center: Canvas */}
        <div className="flex-1 overflow-hidden">
          <AnimapCanvas
            effekseerLayerRefsRef={effekseerLayerRefsRef}
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

        {/* Right: Property Panel */}
        <div className="w-72 flex-shrink-0 overflow-y-auto border-l">
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
            effekseerLayerRefsRef={effekseerLayerRefsRef}
          />
        </div>
      </div>
    </div>
  );
}
