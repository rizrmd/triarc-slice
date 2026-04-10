import { useParams, Navigate } from 'react-router-dom';
import { ASPECT_PRESETS } from '@/lib/godot';
import type { ViewportConfig } from '@/lib/godot';

export { ASPECT_PRESETS };
export type AspectPreset = ViewportConfig;

export default function GameLayoutPicker() {
  const { scene } = useParams<{ scene?: string }>();

  // No scene — redirect to last opened or default
  if (!scene) {
    const last = localStorage.getItem('gameLayoutLast');
    if (last) {
      return <Navigate to={`/game-layout/${last}`} replace />;
    }
    return <Navigate to={`/game-layout/startup/${ASPECT_PRESETS[0].slug}`} replace />;
  }

  // Scene specified — skip aspect ratio chooser, go directly to editor with first preset
  return <Navigate to={`/game-layout/${scene}/${ASPECT_PRESETS[0].slug}`} replace />;
}
