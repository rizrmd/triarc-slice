import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Rnd } from 'react-rnd';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Minus, Plus, RefreshCcw, Maximize, Undo2, Redo2, AlignJustify } from 'lucide-react';

// Photoshop-style alignment & distribution SVG icons
const s = 12; // icon size
const IconAlignLeft = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="0" width="2" height="16" /><rect x="4" y="2" width="10" height="4" /><rect x="4" y="10" width="6" height="4" /></svg>
);
const IconAlignCenterH = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="7" y="0" width="2" height="16" /><rect x="2" y="2" width="12" height="4" /><rect x="4" y="10" width="8" height="4" /></svg>
);
const IconAlignRight = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="14" y="0" width="2" height="16" /><rect x="2" y="2" width="10" height="4" /><rect x="6" y="10" width="6" height="4" /></svg>
);
const IconAlignTop = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="0" width="16" height="2" /><rect x="2" y="4" width="4" height="10" /><rect x="10" y="4" width="4" height="6" /></svg>
);
const IconAlignCenterV = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="7" width="16" height="2" /><rect x="2" y="1" width="4" height="14" /><rect x="10" y="4" width="4" height="8" /></svg>
);
const IconAlignBottom = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="14" width="16" height="2" /><rect x="2" y="2" width="4" height="10" /><rect x="10" y="6" width="4" height="6" /></svg>
);
const IconDistributeH = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="0" width="1.5" height="16" opacity="0.4" /><rect x="14.5" y="0" width="1.5" height="16" opacity="0.4" /><rect x="2.5" y="3" width="4" height="10" /><rect x="9.5" y="3" width="4" height="10" /></svg>
);
const IconDistributeV = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="0" width="16" height="1.5" opacity="0.4" /><rect x="0" y="14.5" width="16" height="1.5" opacity="0.4" /><rect x="3" y="2.5" width="10" height="4" /><rect x="3" y="9.5" width="10" height="4" /></svg>
);
const IconMatchWidth = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="2" width="16" height="4" /><rect x="2" y="10" width="12" height="4" opacity="0.4" /><path d="M0 10 L2 12 L0 14Z" opacity="0.4" /><path d="M16 10 L14 12 L16 14Z" opacity="0.4" /></svg>
);
const IconMatchHeight = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="0" width="4" height="16" /><rect x="10" y="2" width="4" height="12" opacity="0.4" /><path d="M10 0 L12 2 L14 0Z" opacity="0.4" /><path d="M10 16 L12 14 L14 16Z" opacity="0.4" /></svg>
);
const IconMatchSize = () => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="0" width="7" height="7" /><rect x="9" y="4" width="7" height="7" opacity="0.4" /><path d="M9 11 L11 13 L9 15Z" opacity="0.4" /><path d="M11 11 L13 13 L15 11Z" opacity="0.4" /></svg>
);
import { PropertiesSidebar } from '@/components/PropertiesSidebar';
import { Slider } from '@/components/ui/slider';
import { CardPreview } from '@/components/CardPreview';
import { HeroPosePreview } from '@/components/HeroPosePreview';
import { ASPECT_PRESETS, getViewportForAspect } from '@/lib/godot';
import type { Box, GameLayout, AnimapConfig } from '@/types';
import { GAME_SCENES } from '@/types';

type ScreenAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

const SCREEN_ANCHORS: readonly ScreenAnchor[] = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const ANCHOR_FACTORS: Record<ScreenAnchor, { x: number; y: number }> = {
  'top-left': { x: 0, y: 0 },
  'top-center': { x: 0.5, y: 0 },
  'top-right': { x: 1, y: 0 },
  'center-left': { x: 0, y: 0.5 },
  'center': { x: 0.5, y: 0.5 },
  'center-right': { x: 1, y: 0.5 },
  'bottom-left': { x: 0, y: 1 },
  'bottom-center': { x: 0.5, y: 1 },
  'bottom-right': { x: 1, y: 1 },
};

function AnimapBoxPreview({ slug }: { slug: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/animap/${slug}`)
      .then(res => res.json())
      .then((config: AnimapConfig) => {
        const firstImage = config.layers?.find(l => l.type === 'image' && l.visible);
        if (firstImage) {
          setPreviewUrl(`/api/animap-preview/${slug}/${firstImage.file}`);
        }
      })
      .catch(() => {});
  }, [slug]);

  if (!previewUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
        {slug}
      </div>
    );
  }

  return <img src={previewUrl} className="w-full h-full object-contain" alt={slug} />;
}

const SCENE_DEFAULT_BOXES: Record<string, { id: string; label: string }[]> = {
  startup: [
    { id: 'logo', label: 'Logo' },
  ],
  login: [
    { id: 'logo', label: 'Logo' },
    { id: 'sign_in_button', label: 'Sign In Button' },
    { id: 'status_label', label: 'Status Label' },
  ],
  home: [
    { id: 'player_avatar', label: 'Player Avatar' },
    { id: 'player_name', label: 'Player Name' },
    { id: 'currency_gold', label: 'Currency (Gold)' },
    { id: 'currency_gems', label: 'Currency (Gems)' },
    { id: 'play_button', label: 'Play Button' },
    { id: 'deck_button', label: 'Deck Button' },
    { id: 'shop_button', label: 'Shop Button' },
    { id: 'settings_button', label: 'Settings Button' },
  ],
  gameplay: [
    { id: 'enemy1', label: 'Enemy 1' },
    { id: 'enemy2', label: 'Enemy 2' },
    { id: 'enemy3', label: 'Enemy 3' },
    { id: 'hero1', label: 'Hero 1' },
    { id: 'hero2', label: 'Hero 2' },
    { id: 'hero3', label: 'Hero 3' },
    { id: 'action1', label: 'Action 1' },
    { id: 'action2', label: 'Action 2' },
    { id: 'action3', label: 'Action 3' },
    { id: 'action4', label: 'Action 4' },
    { id: 'action5', label: 'Action 5' },
    { id: 'reroll', label: 'RE-ROLL' },
    { id: 'energy', label: 'Energy Bar' },
    { id: 'settings', label: 'Settings' },
    { id: 'info', label: 'Info Button' },
    { id: 'time_elapsed', label: 'Time Elapsed' },
    { id: 'battery', label: 'Battery' },
  ],
  postgame: [
    { id: 'result_banner', label: 'Result Banner' },
    { id: 'score_display', label: 'Score Display' },
    { id: 'xp_bar', label: 'XP Bar' },
    { id: 'reward_1', label: 'Reward 1' },
    { id: 'reward_2', label: 'Reward 2' },
    { id: 'reward_3', label: 'Reward 3' },
    { id: 'play_again_button', label: 'Play Again' },
    { id: 'home_button', label: 'Home Button' },
  ],
};

const ZOOM_STORAGE_KEY = 'game-layout-editor-zoom';

const DEFAULT_ASPECT = '9-16';

// Normalize a stored background value to just the base name (e.g. "cave"),
// stripping any -wide/-narrow suffix and file extension.
function normalizeBgName(name: string): string {
  if (!name) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = ext ? name.slice(0, name.lastIndexOf('.')) : name;
  return base.replace(/-wide$/, '').replace(/-narrow$/, '');
}

// Resolve a canonical background base name (e.g. "cave") to the correct
// variant filename based on aspect ratio. Narrow aspects start with "9-" (portrait).
function resolveBgVariant(name: string, aspectSlug: string): string {
  if (!name) return name;
  const base = normalizeBgName(name);
  const suffix = aspectSlug.startsWith('9-') ? '-narrow' : '-wide';
  return base + suffix + '.webp';
}

function getDefaultBoxDefs(sceneSlug: string) {
  return SCENE_DEFAULT_BOXES[sceneSlug] ?? SCENE_DEFAULT_BOXES.gameplay;
}

function makeDefaultBoxes(sceneSlug: string): Record<string, Box> {
  const initialBoxes: Record<string, Box> = {};
  getDefaultBoxDefs(sceneSlug).forEach((box, i) => {
    const x = 50 + (i % 5) * 360;
    const y = 50 + Math.floor(i / 5) * 530;
    initialBoxes[box.id] = {
      id: box.id,
      x,
      y,
      width: 344,
      height: 516,
      label: box.label,
      pivot: 'top-left',
      screen_anchor: 'top-left',
      anchor_offset_x: x,
      anchor_offset_y: y,
      width_percent: +(344 / 1080 * 100).toFixed(1),
      height_percent: +(516 / 1920 * 100).toFixed(1),
    };
  });
  return initialBoxes;
}

function ensureBoxAnchor(box: Box, viewport: { width: number; height: number }): Box {
  const pivot = box.pivot || 'top-left';
  const pivotFactor = ANCHOR_FACTORS[(SCREEN_ANCHORS.includes(pivot as ScreenAnchor) ? pivot : 'top-left') as ScreenAnchor];
  const pivotPoint = {
    x: box.x + box.width * pivotFactor.x,
    y: box.y + box.height * pivotFactor.y,
  };
  const screenAnchor = (box.screen_anchor as ScreenAnchor | undefined) || pickScreenAnchor(pivotPoint, viewport);
  const anchorFactor = ANCHOR_FACTORS[screenAnchor];
  const anchorPoint = {
    x: viewport.width * anchorFactor.x,
    y: viewport.height * anchorFactor.y,
  };
  return {
    ...box,
    pivot,
    screen_anchor: screenAnchor,
    anchor_offset_x: box.anchor_offset_x ?? Math.round(pivotPoint.x - anchorPoint.x),
    anchor_offset_y: box.anchor_offset_y ?? Math.round(pivotPoint.y - anchorPoint.y),
  };
}

function mergeWithDefaults(boxes: Record<string, Box>, sceneSlug: string): Record<string, Box> {
  const defaults = getDefaultBoxDefs(sceneSlug);
  const defaultIds = new Set(defaults.map(b => b.id));
  const merged: Record<string, Box> = {};
  const defaultViewport = { width: 1080, height: 1920 };
  // Only keep boxes that are in the current defaults
  for (const [id, box] of Object.entries(boxes)) {
    if (defaultIds.has(id)) {
      merged[id] = ensureBoxAnchor({
        ...box,
        pivot: box.pivot || 'top-left',
        screen_anchor: box.screen_anchor || 'top-left',
        anchor_offset_x: box.anchor_offset_x ?? box.x,
        anchor_offset_y: box.anchor_offset_y ?? box.y,
      }, defaultViewport);
    }
  }
  // Add any missing defaults
  defaults.forEach((box, i) => {
    if (!merged[box.id]) {
      const x = 50 + (i % 5) * 360;
      const y = 50 + Math.floor(i / 5) * 530;
      merged[box.id] = {
        id: box.id,
        x,
        y,
        width: 344,
        height: 516,
        label: box.label,
        pivot: 'top-left',
        screen_anchor: 'top-left',
        anchor_offset_x: x,
        anchor_offset_y: y,
        width_percent: +(344 / 1080 * 100).toFixed(1),
        height_percent: +(516 / 1920 * 100).toFixed(1),
      };
    }
  });
  return merged;
}

// Old numeric index → new slug mapping (for background migration)
const OLD_INDEX_TO_SLUG: Record<number, string> = {
  0: '9-16',
  2: '9-20',
  4: '3-4',
};

function migrateBackgrounds(backgrounds: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(backgrounds)) {
    const numIndex = /^\d+$/.test(key) ? parseInt(key) : NaN;
    if (!isNaN(numIndex) && OLD_INDEX_TO_SLUG[numIndex]) {
      result[OLD_INDEX_TO_SLUG[numIndex]] = normalizeBgName(value);
    } else if (isNaN(numIndex)) {
      // Already a slug key — normalize value to base name
      result[key] = normalizeBgName(value);
    }
  }
  return result;
}

// Extract a GameLayout for a given scene from the full file data.
// Handles old flat format, old per-aspect format, and new multi-scene format.
// Migrate old flat format { boxes: { enemy1: {...}, ... } }
// to new per-aspect format { boxes: { "9-16": { enemy1: {...}, ... } } }
function getSourceBoxes(data: any): Record<string, Box> {
  const rawBoxes = data.boxes || {};
  const boxKeys = Object.keys(rawBoxes);
  const usesAspectMap = boxKeys.length > 0 && ASPECT_PRESETS.some(p => boxKeys.includes(p.slug));
  if (!usesAspectMap) return rawBoxes;
  return rawBoxes[DEFAULT_ASPECT] || rawBoxes[boxKeys[0]] || {};
}

function getPivotPoint(box: Box): { x: number; y: number } {
  const pivot = box.pivot || 'top-left';
  const factor = ANCHOR_FACTORS[(SCREEN_ANCHORS.includes(pivot as ScreenAnchor) ? pivot : 'top-left') as ScreenAnchor];
  return {
    x: box.x + box.width * factor.x,
    y: box.y + box.height * factor.y,
  };
}

function pickScreenAnchor(point: { x: number; y: number }, viewport: { width: number; height: number }): ScreenAnchor {
  const horizontal = point.x < viewport.width / 3 ? 'left' : point.x > viewport.width * 2 / 3 ? 'right' : 'center';
  const vertical = point.y < viewport.height / 3 ? 'top' : point.y > viewport.height * 2 / 3 ? 'bottom' : 'center';
  return `${vertical}-${horizontal}`.replace('center-center', 'center') as ScreenAnchor;
}

function migrateBox(box: Box, viewport: { width: number; height: number }): Box {
  const pivot = box.pivot || 'top-left';
  const pivotPoint = getPivotPoint(box);
  const screenAnchor = (box.screen_anchor as ScreenAnchor | undefined) || pickScreenAnchor(pivotPoint, viewport);
  const anchorFactor = ANCHOR_FACTORS[screenAnchor];
  const anchorPoint = {
    x: viewport.width * anchorFactor.x,
    y: viewport.height * anchorFactor.y,
  };
  return {
    ...box,
    pivot,
    screen_anchor: screenAnchor,
    anchor_offset_x: box.anchor_offset_x ?? Math.round(pivotPoint.x - anchorPoint.x),
    anchor_offset_y: box.anchor_offset_y ?? Math.round(pivotPoint.y - anchorPoint.y),
    width_percent: box.width_percent ?? +(box.width / viewport.width * 100).toFixed(1),
    height_percent: box.height_percent ?? +(box.height / viewport.height * 100).toFixed(1),
  };
}

function migrateLayout(data: any): GameLayout {
  const backgrounds = data.backgrounds || {};
  const sourceViewport = getViewportForAspect(DEFAULT_ASPECT) || { width: 1080, height: 1920 };
  const sourceBoxes = getSourceBoxes(data);
  const boxes: Record<string, Box> = {};
  Object.entries(sourceBoxes).forEach(([id, value]) => {
    boxes[id] = migrateBox(value as Box, sourceViewport);
  });
  const migratedBackgrounds = migrateBackgrounds(backgrounds);
  return {
    background: normalizeBgName(data.background || migratedBackgrounds[DEFAULT_ASPECT] || migratedBackgrounds[Object.keys(migratedBackgrounds)[0]] || ''),
    boxes,
  };
}

export default function GameLayoutEditor() {
  const { aspect, scene } = useParams<{ aspect: string; scene: string }>();
  const navigate = useNavigate();
  const aspectSlug = aspect || DEFAULT_ASPECT;
  const sceneSlug = scene || 'gameplay';

  // Persist last visited scene+aspect so the Game Layout button returns here
  useEffect(() => {
    localStorage.setItem('gameLayoutLast', `${sceneSlug}/${aspectSlug}`);
  }, [sceneSlug, aspectSlug]);

  const preset = useMemo(
    () => getViewportForAspect(aspectSlug),
    [aspectSlug]
  );

  // Redirect to picker if invalid aspect
  useEffect(() => {
    if (!preset) {
      navigate('/game-layout', { replace: true });
    }
  }, [preset, navigate]);

  const viewport = useMemo(
    () => preset ? { width: preset.width, height: preset.height } : { width: 1080, height: 1920 },
    [preset]
  );

  const getBoxes = useCallback((l: GameLayout): Record<string, Box> => {
    return l.boxes || {};
  }, []);

  const setBoxes = useCallback((l: GameLayout, boxes: Record<string, Box>): GameLayout => {
    return { ...l, boxes };
  }, []);

  const [layout, setLayout] = useState<GameLayout | null>(null);
  const [places, setPlaces] = useState<{ name: string; url: string }[]>([]);
  const [uiAssets, setUiAssets] = useState<{ name: string; url: string }[]>([]);
  const [charAssets, setCharAssets] = useState<{ name: string; url: string }[]>([]);
  const [cards, setCards] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [animaps, setAnimaps] = useState<string[]>([]);
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const lastSavedLayout = useRef<string>('');

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [bgDimensions, setBgDimensions] = useState({ width: 0, height: 0 });
  const [showPivotLine, setShowPivotLine] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const zoomInitializedRef = useRef(false);
  const layoutRef = useRef<GameLayout | null>(null);
  const undoStackRef = useRef<GameLayout[]>([]);
  const redoStackRef = useRef<GameLayout[]>([]);
  const skipAutoSaveRef = useRef(false);
  const initialSyncDoneRef = useRef(false);
  const toPixelsRef = useRef<any>(null);
  const toNormalizedRef = useRef<any>(null);
  const loadingBgRef = useRef<string>('');
  const didDragRef = useRef(false);
  const getBoxesRef = useRef<(l: GameLayout) => Record<string, Box>>(null as any);
  const setBoxesRef = useRef<(l: GameLayout, boxes: Record<string, Box>) => GameLayout>(null as any);
  const syncRafRef = useRef<number>(0);

  // Keep refs up-to-date for use in sync effect (avoids aspect-change triggering sync)
  getBoxesRef.current = getBoxes;
  setBoxesRef.current = setBoxes;

  const cloneLayout = useCallback((value: GameLayout): GameLayout => (
    JSON.parse(JSON.stringify(value)) as GameLayout
  ), []);

  const syncHistoryState = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const replaceLayout = useCallback((
    nextLayout: GameLayout,
    options?: { recordHistory?: boolean }
  ) => {
    const currentLayout = layoutRef.current;
    const currentString = currentLayout ? JSON.stringify(currentLayout) : '';
    const nextString = JSON.stringify(nextLayout);

    if (currentString === nextString) {
      return;
    }

    // Skip auto-save for recordHistory: false operations (e.g., sync effects)
    skipAutoSaveRef.current = options?.recordHistory === false;

    if (currentLayout && options?.recordHistory !== false) {
      undoStackRef.current.push(cloneLayout(currentLayout));
      if (undoStackRef.current.length > 100) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
    }

    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    syncHistoryState();
  }, [cloneLayout, syncHistoryState]);

  const updateLayout = useCallback((
    updater: (current: GameLayout) => GameLayout,
    options?: { recordHistory?: boolean }
  ) => {
    const currentLayout = layoutRef.current;
    if (!currentLayout) {
      return;
    }

    replaceLayout(updater(currentLayout), options);
  }, [replaceLayout]);

  const undo = useCallback(() => {
    const currentLayout = layoutRef.current;
    const previousLayout = undoStackRef.current.pop();

    if (!currentLayout || !previousLayout) {
      syncHistoryState();
      return;
    }

    redoStackRef.current.push(cloneLayout(currentLayout));
    layoutRef.current = previousLayout;
    skipAutoSaveRef.current = true;
    setLayout(previousLayout);
    syncHistoryState();
  }, [cloneLayout, syncHistoryState]);

  const redo = useCallback(() => {
    const currentLayout = layoutRef.current;
    const nextLayout = redoStackRef.current.pop();

    if (!currentLayout || !nextLayout) {
      syncHistoryState();
      return;
    }

    undoStackRef.current.push(cloneLayout(currentLayout));
    layoutRef.current = nextLayout;
    skipAutoSaveRef.current = true;
    setLayout(nextLayout);
    syncHistoryState();
  }, [cloneLayout, syncHistoryState]);

  const getAnchorPoint = useCallback((screenAnchor: string | undefined, currentViewport = viewport) => {
    const anchor = ANCHOR_FACTORS[(screenAnchor as ScreenAnchor) || 'top-left'] || ANCHOR_FACTORS['top-left'];
    return {
      x: currentViewport.width * anchor.x,
      y: currentViewport.height * anchor.y,
    };
  }, [viewport]);

  const getPivotFactor = useCallback((pivot: string | undefined) => {
    return ANCHOR_FACTORS[(pivot as ScreenAnchor) || 'top-left'] || ANCHOR_FACTORS['top-left'];
  }, []);

  const resolveBoxFrame = useCallback((box: Box, currentViewport = viewport) => {
    const width = box.width_percent != null
      ? Math.round(currentViewport.width * box.width_percent / 100)
      : box.width;
    const height = box.height_percent != null
      ? Math.round(currentViewport.height * box.height_percent / 100)
      : box.height;
    const anchorPoint = getAnchorPoint(box.screen_anchor, currentViewport);
    const pivotFactor = getPivotFactor(box.pivot);
    const pivotX = anchorPoint.x + (box.anchor_offset_x ?? box.x);
    const pivotY = anchorPoint.y + (box.anchor_offset_y ?? box.y);
    return {
      width,
      height,
      x: Math.round(pivotX - width * pivotFactor.x),
      y: Math.round(pivotY - height * pivotFactor.y),
    };
  }, [getAnchorPoint, getPivotFactor, viewport]);

  const updateBoxGeometry = useCallback((box: Box, frame: { x: number; y: number; width: number; height: number }): Box => {
    const nextWidth = Math.round(frame.width);
    const nextHeight = Math.round(frame.height);
    const nextX = Math.round(frame.x);
    const nextY = Math.round(frame.y);
    const pivotFactor = getPivotFactor(box.pivot);
    const anchorPoint = getAnchorPoint(box.screen_anchor);
    const pivotX = nextX + nextWidth * pivotFactor.x;
    const pivotY = nextY + nextHeight * pivotFactor.y;

    return {
      ...box,
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
      anchor_offset_x: Math.round(pivotX - anchorPoint.x),
      anchor_offset_y: Math.round(pivotY - anchorPoint.y),
      width_percent: +(nextWidth / viewport.width * 100).toFixed(1),
      height_percent: +(nextHeight / viewport.height * 100).toFixed(1),
      nx: undefined,
      ny: undefined,
      screen_relative: true,
    };
  }, [getAnchorPoint, getPivotFactor, viewport]);

  toNormalizedRef.current = updateBoxGeometry;
  toPixelsRef.current = resolveBoxFrame;

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (layout?.background) {
      const currentBackground = layout.background;
      if (currentBackground) {
        loadingBgRef.current = currentBackground;

        const img = new Image();
        img.src = `/assets/places/${resolveBgVariant(currentBackground, aspectSlug)}`;
        img.onload = () => {
          // Only update if this is still the current background (avoid race conditions)
          if (loadingBgRef.current === currentBackground) {
            setBgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          }
        };
        return () => {
          img.onload = null;
          img.src = '';
        };
      }
    }
  }, [layout?.background, aspectSlug]);

  // Re-resolve box frames whenever the preview viewport/background changes.
  useEffect(() => {
    if (bgDimensions.width > 0 && initialSyncDoneRef.current && toPixelsRef.current && toNormalizedRef.current) {
      cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = requestAnimationFrame(() => {
        updateLayout(prev => {
          const boxes = getBoxesRef.current(prev);
          const newBoxes = { ...boxes };
          let changed = false;

          Object.keys(newBoxes).forEach(key => {
            const box = newBoxes[key];
            const frame = toPixelsRef.current(box);
            if (Math.abs(frame.x - box.x) > 1 || Math.abs(frame.y - box.y) > 1 || Math.abs(frame.width - box.width) > 1 || Math.abs(frame.height - box.height) > 1) {
              newBoxes[key] = { ...box, ...frame };
              changed = true;
            }
          });

          return changed ? setBoxesRef.current(prev, newBoxes) : prev;
        }, { recordHistory: false });
      });
    }
    return () => cancelAnimationFrame(syncRafRef.current);
  }, [bgDimensions, updateLayout]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tagName = element.tagName;
      return element.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !isEditableTarget(e.target)) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }

        if (key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }

      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [redo, undo]);

  const fitZoom = () => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      const scaleX = (clientWidth - 64) / viewport.width;
      const scaleY = (clientHeight - 64) / viewport.height;
      const scale = Math.min(scaleX, scaleY);
      setZoom(Math.max(0.1, scale));
      setPan({ x: 0, y: 0 });
    }
  };

  // Alignment functions
  const alignLeft = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 2 || !layout) return;
    const currentBoxes = getBoxes(layout);
    const targetId = ids[0];
    const targetBox = currentBoxes[targetId];
    if (!targetBox) return;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      ids.forEach(id => {
        if (id !== targetId) {
          const box = newBoxes[id];
          newBoxes[id] = updateBoxGeometry(box, { x: targetBox.x, y: box.y, width: box.width, height: box.height });
        }
      });
      return setBoxes(prev, newBoxes);
    });
  };

  const alignCenterH = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 2 || !layout) return;
    const currentBoxes = getBoxes(layout);
    const targetId = ids[0];
    const targetBox = currentBoxes[targetId];
    if (!targetBox) return;
    const targetCenterX = targetBox.x + targetBox.width / 2;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      ids.forEach(id => {
        if (id !== targetId) {
          const box = newBoxes[id];
          const newX = targetCenterX - box.width / 2;
          newBoxes[id] = updateBoxGeometry(box, { x: newX, y: box.y, width: box.width, height: box.height });
        }
      });
      return setBoxes(prev, newBoxes);
    });
  };

  const alignRight = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 2 || !layout) return;
    const currentBoxes = getBoxes(layout);
    const targetId = ids[0];
    const targetBox = currentBoxes[targetId];
    if (!targetBox) return;
    const targetRight = targetBox.x + targetBox.width;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      ids.forEach(id => {
        if (id !== targetId) {
          const box = newBoxes[id];
          const newX = targetRight - box.width;
          newBoxes[id] = updateBoxGeometry(box, { x: newX, y: box.y, width: box.width, height: box.height });
        }
      });
      return setBoxes(prev, newBoxes);
    });
  };

  const alignTop = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 2 || !layout) return;
    const currentBoxes = getBoxes(layout);
    const targetId = ids[0];
    const targetBox = currentBoxes[targetId];
    if (!targetBox) return;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      ids.forEach(id => {
        if (id !== targetId) {
          const box = newBoxes[id];
          newBoxes[id] = updateBoxGeometry(box, { x: box.x, y: targetBox.y, width: box.width, height: box.height });
        }
      });
      return setBoxes(prev, newBoxes);
    });
  };

  const alignCenterV = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 2 || !layout) return;
    const currentBoxes = getBoxes(layout);
    const targetId = ids[0];
    const targetBox = currentBoxes[targetId];
    if (!targetBox) return;
    const targetCenterY = targetBox.y + targetBox.height / 2;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      ids.forEach(id => {
        if (id !== targetId) {
          const box = newBoxes[id];
          const newY = targetCenterY - box.height / 2;
          newBoxes[id] = updateBoxGeometry(box, { x: box.x, y: newY, width: box.width, height: box.height });
        }
      });
      return setBoxes(prev, newBoxes);
    });
  };

  const alignBottom = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 2 || !layout) return;
    const currentBoxes = getBoxes(layout);
    const targetId = ids[0];
    const targetBox = currentBoxes[targetId];
    if (!targetBox) return;
    const targetBottom = targetBox.y + targetBox.height;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      ids.forEach(id => {
        if (id !== targetId) {
          const box = newBoxes[id];
          const newY = targetBottom - box.height;
          newBoxes[id] = updateBoxGeometry(box, { x: box.x, y: newY, width: box.width, height: box.height });
        }
      });
      return setBoxes(prev, newBoxes);
    });
  };

  const distributeHorizontal = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 3 || !layout) return;
    const currentBoxes = getBoxes(layout);

    const sortedIds = [...ids].sort((a, b) => currentBoxes[a].x - currentBoxes[b].x);
    const firstBox = currentBoxes[sortedIds[0]];
    const lastBox = currentBoxes[sortedIds[sortedIds.length - 1]];

    const totalWidth = (lastBox.x + lastBox.width) - firstBox.x;
    const boxWidths = sortedIds.map(id => currentBoxes[id].width);
    const totalBoxWidth = boxWidths.reduce((sum, w) => sum + w, 0);
    const totalGapWidth = totalWidth - totalBoxWidth;
    const gapWidth = totalGapWidth / (ids.length - 1);

    let currentX = firstBox.x + firstBox.width + gapWidth;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      for (let i = 1; i < sortedIds.length - 1; i++) {
        const id = sortedIds[i];
        const box = newBoxes[id];
        const newX = Math.round(currentX);
        newBoxes[id] = updateBoxGeometry(box, { x: newX, y: box.y, width: box.width, height: box.height });
        currentX += box.width + gapWidth;
      }
      return setBoxes(prev, newBoxes);
    });
  };

  const distributeVertical = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 3 || !layout) return;
    const currentBoxes = getBoxes(layout);

    const sortedIds = [...ids].sort((a, b) => currentBoxes[a].y - currentBoxes[b].y);
    const firstBox = currentBoxes[sortedIds[0]];
    const lastBox = currentBoxes[sortedIds[sortedIds.length - 1]];

    const totalHeight = (lastBox.y + lastBox.height) - firstBox.y;
    const boxHeights = sortedIds.map(id => currentBoxes[id].height);
    const totalBoxHeight = boxHeights.reduce((sum, h) => sum + h, 0);
    const totalGapHeight = totalHeight - totalBoxHeight;
    const gapHeight = totalGapHeight / (ids.length - 1);

    let currentY = firstBox.y + firstBox.height + gapHeight;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      for (let i = 1; i < sortedIds.length - 1; i++) {
        const id = sortedIds[i];
        const box = newBoxes[id];
        const newY = Math.round(currentY);
        newBoxes[id] = updateBoxGeometry(box, { x: box.x, y: newY, width: box.width, height: box.height });
        currentY += box.height + gapHeight;
      }
      return setBoxes(prev, newBoxes);
    });
  };

  const matchWidth = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 2 || !layout) return;
    const currentBoxes = getBoxes(layout);
    const targetId = ids[0];
    const targetBox = currentBoxes[targetId];
    if (!targetBox) return;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      ids.forEach(id => {
        if (id !== targetId) {
          const box = newBoxes[id];
          newBoxes[id] = updateBoxGeometry(box, { x: box.x, y: box.y, width: targetBox.width, height: box.height });
        }
      });
      return setBoxes(prev, newBoxes);
    });
  };

  const matchHeight = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 2 || !layout) return;
    const currentBoxes = getBoxes(layout);
    const targetId = ids[0];
    const targetBox = currentBoxes[targetId];
    if (!targetBox) return;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      ids.forEach(id => {
        if (id !== targetId) {
          const box = newBoxes[id];
          newBoxes[id] = updateBoxGeometry(box, { x: box.x, y: box.y, width: box.width, height: targetBox.height });
        }
      });
      return setBoxes(prev, newBoxes);
    });
  };

  const matchSize = () => {
    const ids = Array.from(selectedBoxes);
    if (ids.length < 2 || !layout) return;
    const currentBoxes = getBoxes(layout);
    const targetId = ids[0];
    const targetBox = currentBoxes[targetId];
    if (!targetBox) return;

    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const newBoxes = { ...boxes };
      ids.forEach(id => {
        if (id !== targetId) {
          const box = newBoxes[id];
          newBoxes[id] = updateBoxGeometry(box, { x: box.x, y: box.y, width: targetBox.width, height: targetBox.height });
        }
      });
      return setBoxes(prev, newBoxes);
    });
  };

  useEffect(() => {
    // Initial zoom fit
    if (layout && containerRef.current && !initializedRef.current) {
      const savedZoom = window.localStorage.getItem(ZOOM_STORAGE_KEY);
      const parsedZoom = savedZoom ? Number.parseFloat(savedZoom) : NaN;
      if (Number.isFinite(parsedZoom)) {
        setZoom(Math.min(Math.max(0.1, parsedZoom), 3));
      } else {
        fitZoom();
      }
      zoomInitializedRef.current = true;
      initializedRef.current = true;
    }
  }, [layout]); // Run after layout is loaded/ready

  useEffect(() => {
    if (!zoomInitializedRef.current) {
      return;
    }
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
  }, [zoom]);

  // Refit zoom when viewport dimensions change
  useEffect(() => {
    if (zoomInitializedRef.current && initializedRef.current) {
      fitZoom();
    }
  }, [viewport.width, viewport.height]);

  useEffect(() => {
    // Prevent sync effect from running with stale data during aspect transition
    initialSyncDoneRef.current = false;
    cancelAnimationFrame(syncRafRef.current);

    // Fetch layout for this scene
    fetch(`/api/scene/${sceneSlug}/layout`)
      .then(res => res.json())
      .then(data => {
        const migrated = migrateLayout(data);

        migrated.boxes = mergeWithDefaults(
          Object.keys(migrated.boxes).length > 0 ? migrated.boxes : makeDefaultBoxes(sceneSlug),
          sceneSlug,
        );
        Object.keys(migrated.boxes).forEach(key => {
          migrated.boxes[key] = { ...migrated.boxes[key], ...resolveBoxFrame(migrated.boxes[key]) };
        });

        layoutRef.current = migrated;
        skipAutoSaveRef.current = true;
        setLayout(migrated);
        lastSavedLayout.current = JSON.stringify(migrated);
        setHasUnsavedChanges(false);
        resetHistory();
        // Mark initial sync as done so subsequent bgDimensions changes will trigger sync
        setTimeout(() => { initialSyncDoneRef.current = true; }, 100);
      });

    // Fetch places
    fetch('/api/assets/places')
      .then(res => res.json())
      .then(setPlaces)
      .catch(err => console.error("Failed to fetch places", err));

    // Fetch UI assets
    fetch('/api/assets/ui')
      .then(res => res.json())
      .then(setUiAssets)
      .catch(err => console.error("Failed to fetch UI assets", err));

    // Fetch character assets
    fetch('/api/assets/characters')
      .then(res => res.json())
      .then(setCharAssets)
      .catch(err => console.error("Failed to fetch character assets", err));

    // Fetch cards
    fetch('/api/cards')
      .then(res => res.json())
      .then(setCards)
      .catch(err => console.error("Failed to fetch cards", err));

    fetch('/api/actions')
      .then(res => res.json())
      .then(setActions)
      .catch(err => console.error("Failed to fetch actions", err));

    fetch('/api/animaps')
      .then(res => res.json())
      .then(setAnimaps)
      .catch(err => console.error("Failed to fetch animaps", err));
  }, [sceneSlug, resolveBoxFrame]);

  // Auto-save effect
  useEffect(() => {
    if (!layout) return;

    // Skip auto-save for internal operations (e.g., sync effects)
    const shouldSkip = skipAutoSaveRef.current;
    skipAutoSaveRef.current = false;

    if (shouldSkip) return;

    const currentString = JSON.stringify(layout);
    const isDirty = currentString !== lastSavedLayout.current;

    // Update unsaved changes indicator
    setHasUnsavedChanges(isDirty);

    if (!isDirty) return;

    const timer = setTimeout(() => {
      setSaving(true);
      fetch(`/api/scene/${sceneSlug}/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: currentString,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
        })
        .catch((error) => {
          console.error('Auto-save failed:', error);
        })
        .finally(() => {
          // Always update lastSavedLayout to prevent infinite retry loops
          lastSavedLayout.current = currentString;
          setSaving(false);
          setHasUnsavedChanges(false);
        });
    }, 1000);

    return () => clearTimeout(timer);
  }, [layout]);

  const SHARED_BOX_PROPS: (keyof Box)[] = ['animapSlug', 'cardSlug', 'actionSlug', 'poseSlug', 'asset', 'fill'];

  const updateBox = (id: string, updates: Partial<Box>) => {
    updateLayout(prev => {
      const boxes = getBoxes(prev);
      const oldBox = boxes[id];
      let newBox = { ...oldBox, ...updates };
      if ('x' in updates || 'y' in updates || 'width' in updates || 'height' in updates) {
        newBox = updateBoxGeometry(newBox, {
          x: newBox.x,
          y: newBox.y,
          width: newBox.width,
          height: newBox.height,
        });
      } else {
        newBox = { ...newBox, ...resolveBoxFrame(newBox) };
      }

      let result = setBoxes(prev, { ...boxes, [id]: newBox });

      const sharedUpdates: Record<string, unknown> = {};
      for (const key of SHARED_BOX_PROPS) {
        if (key in updates) {
          sharedUpdates[key] = (updates as Record<string, unknown>)[key];
        }
      }
      if (Object.keys(sharedUpdates).length > 0 && result.boxes[id]) {
        result = {
          ...result,
          boxes: {
            ...result.boxes,
            [id]: { ...result.boxes[id], ...sharedUpdates },
          },
        };
      }

      return result;
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.min(Math.max(0.1, zoom + delta), 3);
      setZoom(newZoom);
    } else {
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  if (!layout || !preset) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading editor...
      </div>
    </div>
  );

  const currentBoxes = getBoxes(layout);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link to="/"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <select
            className="text-xl font-bold bg-transparent border-none outline-none cursor-pointer"
            value={sceneSlug}
            onChange={e => navigate(`/game-layout/${e.target.value}/${aspectSlug}`)}
          >
            {GAME_SCENES.map(s => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            {ASPECT_PRESETS.map(p => (
              <Link key={p.slug} to={`/game-layout/${sceneSlug}/${p.slug}`}>
                <Button
                  variant={p.slug === aspectSlug ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs px-2 h-7"
                >
                  {p.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {sceneSlug === 'gameplay' && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">
              Background:
            </label>
            <select
              className="p-2 border rounded bg-background text-foreground"
              value={normalizeBgName(layout.background || '')}
              onChange={e => updateLayout(current => ({
                ...current,
                background: e.target.value
              }))}
            >
              {places.length > 0 ? (
                places.map(p => <option key={p.name} value={p.name}>{p.name.replace(/\.[^.]+$/, '')}</option>)
              ) : (<></>
              )}
            </select>
          </div>
          )}
          <span className="text-xs text-muted-foreground">{viewport.width}x{viewport.height}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo} title="Undo (Cmd/Ctrl+Z)">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo} title="Redo (Shift+Cmd/Ctrl+Z)">
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button
              variant={showPivotLine ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPivotLine(prev => !prev)}
              title="Toggle Center Pivot Line"
            >
              <AlignJustify className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                updateLayout(prev => {
                  const boxes = getBoxes(prev);
                  const newBoxes = { ...boxes };
                  let changed = false;

                  Object.keys(newBoxes).forEach(key => {
                    const box = newBoxes[key];
                    let { x, y, width, height } = box;
                    let modified = false;

                    // Clamp position so box is fully inside the viewport
                    if (x < 0) { x = 0; modified = true; }
                    if (y < 0) { y = 0; modified = true; }
                    if (x + width > viewport.width) {
                      x = Math.max(0, viewport.width - width);
                      modified = true;
                    }
                    if (y + height > viewport.height) {
                      y = Math.max(0, viewport.height - height);
                      modified = true;
                    }
                    // If box is larger than viewport, shrink to fit
                    if (width > viewport.width) {
                      width = viewport.width;
                      modified = true;
                    }
                    if (height > viewport.height) {
                      height = viewport.height;
                      modified = true;
                    }

                    if (modified) {
                      newBoxes[key] = updateBoxGeometry(box, { x, y, width, height });
                      changed = true;
                    }
                  });

                  return changed ? setBoxes(prev, newBoxes) : prev;
                });
              }}
              title="Fit All Boxes Inside Canvas"
            >
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {saving ? (
              <span className="text-sm text-blue-500 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving...
              </span>
            ) : hasUnsavedChanges ? (
              <span className="text-sm text-orange-500 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" /> Unsaved
              </span>
            ) : (
              <span className="text-sm text-green-500 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" /> Saved
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden bg-gray-900 flex">
        <div
          className={`flex-1 overflow-hidden flex items-center justify-center relative ${isSpacePressed ? 'cursor-grab active:cursor-grabbing' : ''}`}
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={(e) => {
            // Pan if middle click OR (left click AND spacebar is pressed)
            const canPan = e.button === 1 || (e.button === 0 && isSpacePressed);

            if (canPan) {
              e.preventDefault(); // Prevent text selection etc
              const startX = e.clientX - pan.x;
              const startY = e.clientY - pan.y;
              const handleMouseMove = (moveEvent: MouseEvent) => {
                setPan({
                  x: moveEvent.clientX - startX,
                  y: moveEvent.clientY - startY
                });
              };
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }
          }}
        >
          <div
            className="absolute transition-transform duration-75 ease-out origin-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              width: `${viewport.width}px`,
              height: `${viewport.height}px`
            }}
          >
            <div className="relative w-full h-full border border-gray-700 shadow-lg bg-black"
              onClick={() => setSelectedBoxes(new Set())}>
              <div
                key={`bg-${aspectSlug}-${layout.background || ''}`}
                className="absolute inset-0 bg-no-repeat pointer-events-none"
                style={{
                  backgroundImage: layout.background
                    ? `url(/assets/places/${resolveBgVariant(layout.background, aspectSlug)})`
                    : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              />
              {/* Vertical center pivot line for hero/action/enemy cards */}
              {showPivotLine && (
                <div
                  className="absolute pointer-events-none z-5"
                  style={{
                    left: 0,
                    top: '50%',
                    width: '100%',
                    height: '2px',
                    backgroundColor: 'rgba(255, 0, 0, 0.6)',
                    boxShadow: '0 0 4px rgba(255, 0, 0, 0.8)',
                    transform: 'translateY(-50%)',
                  }}
                />
              )}

              {Object.values(currentBoxes).map(box => (
                (() => {
                  const hasPreview = !!(box.cardSlug || box.actionSlug || box.poseSlug || box.animapSlug);
                  return (
                    <Rnd
                      key={box.id}
                      size={{ width: box.width, height: box.height }}
                      position={{ x: box.x, y: box.y }}
                      scale={zoom}
                      disableDragging={box.locked}
                      enableResizing={!box.locked}
                      onDragStop={(_e, d) => {
                        const newX = Math.round(d.x);
                        const newY = Math.round(d.y);
                        if (newX !== box.x || newY !== box.y) didDragRef.current = true;
                        const dx = newX - box.x;
                        const dy = newY - box.y;
                        updateLayout(prev => {
                          const boxes = { ...getBoxes(prev) };
                          boxes[box.id] = updateBoxGeometry(box, { x: newX, y: newY, width: box.width, height: box.height });

                          if (selectedBoxes.has(box.id) && selectedBoxes.size > 1) {
                            for (const id of selectedBoxes) {
                              if (id === box.id) continue;
                              const other = boxes[id];
                              if (!other || other.locked) continue;
                              const ox = other.x + dx;
                              const oy = other.y + dy;
                              boxes[id] = updateBoxGeometry(other, { x: ox, y: oy, width: other.width, height: other.height });
                            }
                          }

                          return setBoxes(prev, boxes);
                        });
                      }}
                      onResizeStop={(_e, _direction, ref, _delta, position) => {
                        const newW = Math.round(parseInt(ref.style.width));
                        const newH = Math.round(parseInt(ref.style.height));
                        const newX = Math.round(position.x);
                        const newY = Math.round(position.y);
                        updateLayout(prev => {
                          const boxes = getBoxes(prev);
                          return setBoxes(prev, {
                            ...boxes,
                            [box.id]: updateBoxGeometry(box, { x: newX, y: newY, width: newW, height: newH })
                          });
                        });
                      }}
                      bounds="parent"
                      onMouseDown={(e) => {
                        // Only select on left click (button 0)
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        didDragRef.current = false;
                        const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
                        if (isMultiSelect) {
                          setSelectedBoxes(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(box.id)) {
                              newSet.delete(box.id);
                            } else {
                              newSet.add(box.id);
                            }
                            return newSet;
                          });
                        } else if (!selectedBoxes.has(box.id)) {
                          // Only replace selection if clicking an unselected box
                          setSelectedBoxes(new Set([box.id]));
                        }
                        // If already selected without modifier, do nothing —
                        // allows dragging the group without deselecting
                      }}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (didDragRef.current) return;
                        // Click (no drag) on a selected box without modifier: narrow to just this box
                        const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
                        if (!isMultiSelect && selectedBoxes.has(box.id) && selectedBoxes.size > 1) {
                          setSelectedBoxes(new Set([box.id]));
                        }
                      }}
                      className={`${selectedBoxes.has(box.id) ? (hasPreview ? 'z-10' : 'border-2 border-blue-500 z-10') : (hasPreview ? '' : 'border-2 border-gray-400')} ${hasPreview ? 'bg-transparent' : 'bg-white/80'} ${box.locked ? 'opacity-80' : ''} flex items-center justify-center cursor-move rounded shadow-sm hover:shadow-md transition-shadow relative`}
                    >
                      {/* Selection bounding box overlay */}
                      {selectedBoxes.has(box.id) && (
                        <div
                          className="absolute pointer-events-none z-30"
                          style={{
                            inset: '-2px',
                            border: '2px solid #3b82f6',
                            borderRadius: '4px',
                            boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.3)',
                          }}
                        />
                      )}
                      {/* Pivot Indicator - not shown for hero, action, enemy cards */}
                      {box.pivot && !box.locked && !box.id.startsWith('hero') && !box.id.startsWith('action') && !box.id.startsWith('enemy') && (
                        <div
                          className="absolute w-2 h-2 bg-red-500 rounded-full z-20 pointer-events-none"
                          style={{
                            top: box.pivot.startsWith('top') ? '-4px' : box.pivot.startsWith('bottom') ? 'calc(100% - 4px)' : 'calc(50% - 4px)',
                            left: box.pivot.includes('left') ? '-4px' : box.pivot.includes('right') ? 'calc(100% - 4px)' : 'calc(50% - 4px)'
                          }}
                        />
                      )}
                      {!box.cardSlug && !box.actionSlug && !box.asset && !box.poseSlug && !box.animapSlug && (
                        <div className="text-center font-bold text-xs pointer-events-none select-none p-1 break-words z-10 relative">
                          {box.label}
                        </div>
                      )}

                      {box.cardSlug && (
                        <div className="absolute inset-0 pointer-events-none select-none">
                          <CardPreview
                            slug={box.cardSlug}
                            transparent
                            onAspectRatioLoaded={(ratio) => {
                              if (!box.locked) {
                                const currentRatio = box.height / box.width;
                                if (Math.abs(currentRatio - ratio) > 0.01) {
                                  setTimeout(() => {
                                    updateLayout(prev => {
                                      const boxes = getBoxes(prev);
                                      const currentBox = boxes[box.id];
                                      if (!currentBox) return prev;

                                      const targetHeight = Math.round(currentBox.width * ratio);
                                      if (Math.abs(currentBox.height - targetHeight) <= 1) return prev;

                                      const adjustedY = Math.round(currentBox.y - (targetHeight - currentBox.height) / 2);
                                      console.log(`[aspectRatio:card] ${box.id}: h ${currentBox.height}→${targetHeight}, y ${currentBox.y}→${adjustedY}, ratio=${ratio.toFixed(3)}`);

                                      return setBoxes(prev, {
                                        ...boxes,
                                        [box.id]: updateBoxGeometry(currentBox, {
                                          x: currentBox.x,
                                          y: adjustedY,
                                          width: currentBox.width,
                                          height: targetHeight,
                                        })
                                      });
                                    }, { recordHistory: false });
                                  }, 0);
                                }
                              }
                            }}
                          />
                        </div>
                      )}

                      {box.actionSlug && (
                        <div className="absolute inset-0 pointer-events-none select-none">
                          <CardPreview
                            slug={box.actionSlug}
                            type="action"
                            transparent
                            onAspectRatioLoaded={(ratio) => {
                              if (!box.locked) {
                                const currentRatio = box.height / box.width;
                                if (Math.abs(currentRatio - ratio) > 0.01) {
                                  setTimeout(() => {
                                    updateLayout(prev => {
                                      const boxes = getBoxes(prev);
                                      const currentBox = boxes[box.id];
                                      if (!currentBox) return prev;

                                      const targetHeight = Math.round(currentBox.width * ratio);
                                      if (Math.abs(currentBox.height - targetHeight) <= 1) return prev;

                                      const adjustedY = Math.round(currentBox.y - (targetHeight - currentBox.height) / 2);
                                      console.log(`[aspectRatio:action] ${box.id}: h ${currentBox.height}→${targetHeight}, y ${currentBox.y}→${adjustedY}`);

                                      return setBoxes(prev, {
                                        ...boxes,
                                        [box.id]: updateBoxGeometry(currentBox, {
                                          x: currentBox.x,
                                          y: adjustedY,
                                          width: currentBox.width,
                                          height: targetHeight,
                                        })
                                      });
                                    }, { recordHistory: false });
                                  }, 0);
                                }
                              }
                            }}
                          />
                        </div>
                      )}

                      {box.poseSlug && (
                        <div className="absolute inset-0 pointer-events-none select-none">
                          <HeroPosePreview slug={box.poseSlug} />
                        </div>
                      )}

                      {box.animapSlug && (
                        <div className="absolute inset-0 pointer-events-none select-none">
                          <AnimapBoxPreview slug={box.animapSlug} />
                        </div>
                      )}

                      {box.asset && (
                        <div className="absolute inset-0 pointer-events-none select-none">
                          <img
                            src={box.asset}
                            className="w-full h-full object-contain"
                            alt=""
                            onLoad={(e) => {
                              if (!box.locked) {
                                const img = e.currentTarget;
                                const ratio = img.naturalHeight / img.naturalWidth;
                                const currentRatio = box.height / box.width;
                                if (Math.abs(currentRatio - ratio) > 0.01) {
                                  setTimeout(() => {
                                    updateLayout(prev => {
                                      const boxes = getBoxes(prev);
                                      const currentBox = boxes[box.id];
                                      if (!currentBox) return prev;

                                      const targetHeight = Math.round(currentBox.width * ratio);
                                      if (Math.abs(currentBox.height - targetHeight) <= 1) return prev;

                                      const adjustedY = Math.round(currentBox.y - (targetHeight - currentBox.height) / 2);
                                      console.log(`[aspectRatio:asset] ${box.id}: h ${currentBox.height}→${targetHeight}, y ${currentBox.y}→${adjustedY}`);

                                      return setBoxes(prev, {
                                        ...boxes,
                                        [box.id]: updateBoxGeometry(currentBox, {
                                          x: currentBox.x,
                                          y: adjustedY,
                                          width: currentBox.width,
                                          height: targetHeight,
                                        })
                                      });
                                    }, { recordHistory: false });
                                  }, 0);
                                }
                              }
                            }}
                          />
                        </div>
                      )}
                    </Rnd>
                  );
                })()
              ))}
            </div>
          </div>

          {/* Alignment Toolbar */}
          {selectedBoxes.size > 0 && (
            <div className="absolute top-4 left-4 bg-card/95 backdrop-blur border rounded-lg p-3 shadow-lg z-10">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {selectedBoxes.size} selected
                </div>
                {selectedBoxes.size > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setSelectedBoxes(new Set())}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-6 gap-1">
                {/* Horizontal alignment */}
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={alignLeft} title="Align Left">
                  <IconAlignLeft />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={alignCenterH} title="Align Center">
                  <IconAlignCenterH />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={alignRight} title="Align Right">
                  <IconAlignRight />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={distributeHorizontal} title="Distribute Horizontal (min 3)" disabled={selectedBoxes.size < 3}>
                  <IconDistributeH />
                </Button>
                {/* Size matching */}
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={matchWidth} title="Match Width">
                  <IconMatchWidth />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={matchHeight} title="Match Height">
                  <IconMatchHeight />
                </Button>

                {/* Vertical alignment */}
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={alignTop} title="Align Top">
                  <IconAlignTop />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={alignCenterV} title="Align Middle">
                  <IconAlignCenterV />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={alignBottom} title="Align Bottom">
                  <IconAlignBottom />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={distributeVertical} title="Distribute Vertical (min 3)" disabled={selectedBoxes.size < 3}>
                  <IconDistributeV />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8 col-span-2" onClick={matchSize} title="Match Both Width & Height">
                  <IconMatchSize />
                </Button>
              </div>
            </div>
          )}

          {/* Navigator Controls */}
          <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur border rounded-lg p-2 flex flex-col gap-2 shadow-lg z-10">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}>
                <Minus className="h-3 w-3" />
              </Button>
              <Slider
                value={[zoom]}
                min={0.1}
                max={3}
                step={0.1}
                className="w-24"
                onValueChange={([v]) => setZoom(v)}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>{Math.round(zoom * 100)}%</span>
              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={fitZoom} title="Fit to Screen">
                  <Maximize className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset to 100%">
                  <RefreshCcw className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="h-full w-80 border-l bg-card shadow-xl z-20 flex flex-col">
          {(() => {
            // Get the most recently selected box (first in Set for now)
            const firstSelectedId = Array.from(selectedBoxes)[0];
            const firstSelectedBox = firstSelectedId ? currentBoxes[firstSelectedId] : null;
            if (!firstSelectedBox) {
              return (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
                  <div className="text-center">
                    <p className="mb-2">No element selected</p>
                    <p className="text-xs">Click on an element to edit its properties</p>
                  </div>
                </div>
              );
            }
            return (
              <PropertiesSidebar
                selectedBox={firstSelectedBox}
                onUpdate={(_id, updates) => {
                  // Update all selected boxes with the same changes
                  selectedBoxes.forEach(id => {
                    updateBox(id, updates);
                  });
                }}
                onClose={() => setSelectedBoxes(new Set())}
                cards={cards}
                actions={actions}
                animaps={animaps}
                uiAssets={uiAssets}
                charAssets={charAssets}
                placeAssets={places}
                multiSelectCount={selectedBoxes.size}
                viewport={viewport}
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
}
