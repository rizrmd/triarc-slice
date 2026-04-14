import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { Hero, ActionCard, MatchState, HeroData, ActionData, Scene } from '../types/game';

interface GameStore {
  scene: Scene;
  player_id: string | null;
  display_name: string | null;
  current_match_id: string | null;
  current_team: 0 | 1;
  match_state: MatchState['state'];
  time_remaining_ms: number;
  selected_heroes: string[];
  hero_defs: Record<string, HeroData>;
  action_defs: Record<string, ActionData>;
  my_heroes: Record<number, Hero>;
  enemy_heroes: Record<number, Hero>;
  hand_cards: ActionCard[];
  energy: number;
  hero_targets: Record<number, number>; // hero_slot -> enemy_slot for pre-targeting
  casting_by_hero: Record<string, { action_slug: string; until_ms: number }>;
}

type Action =
  | { type: 'SET_SCENE'; scene: Scene }
  | { type: 'SET_PLAYER'; player_id: string | null; display_name: string | null }
  | { type: 'SET_MATCH'; match_id: string; current_team: 0 | 1 }
  | { type: 'SET_MATCH_STATE'; state: MatchState['state']; time_remaining_ms?: number }
  | { type: 'SET_SELECTED_HEROES'; heroes: string[] }
  | { type: 'SET_DEFS'; hero_defs: Record<string, HeroData>; action_defs: Record<string, ActionData> }
  | { type: 'SET_MY_HEROES'; heroes: Record<number, Hero> }
  | { type: 'SET_ENEMY_HEROES'; heroes: Record<number, Hero> }
  | { type: 'UPDATE_HERO'; slot_index: number; team: 0 | 1; updates: Partial<Hero> }
  | { type: 'SET_HAND_CARDS'; cards: ActionCard[] }
  | { type: 'SET_ENERGY'; energy: number }
  | { type: 'SET_HERO_TARGET'; hero_slot: number; enemy_slot: number }
  | { type: 'CLEAR_HERO_TARGET'; hero_slot: number }
  | { type: 'SET_CASTING'; hero_instance_id: string; action_slug: string; until_ms: number }
  | { type: 'CLEAR_CASTING'; hero_instance_id: string }
  | { type: 'RESET' };

const initialState: GameStore = {
  scene: 'loading',
  player_id: null,
  display_name: null,
  current_match_id: null,
  current_team: 0,
  match_state: 'waiting',
  time_remaining_ms: 0,
  selected_heroes: [],
  hero_defs: {},
  action_defs: {},
  my_heroes: {},
  enemy_heroes: {},
  hand_cards: [],
  energy: 3,
  hero_targets: {},
  casting_by_hero: {},
};

function reducer(state: GameStore, action: Action): GameStore {
  switch (action.type) {
    case 'SET_SCENE':
      return { ...state, scene: action.scene };
    case 'SET_PLAYER':
      return { ...state, player_id: action.player_id, display_name: action.display_name };
    case 'SET_MATCH':
      return { ...state, current_match_id: action.match_id, current_team: action.current_team };
    case 'SET_MATCH_STATE':
      return {
        ...state,
        match_state: action.state,
        time_remaining_ms: action.time_remaining_ms ?? state.time_remaining_ms,
      };
    case 'SET_SELECTED_HEROES':
      return { ...state, selected_heroes: action.heroes };
    case 'SET_DEFS':
      return { ...state, hero_defs: action.hero_defs, action_defs: action.action_defs };
    case 'SET_MY_HEROES':
      return { ...state, my_heroes: action.heroes };
    case 'SET_ENEMY_HEROES':
      return { ...state, enemy_heroes: action.heroes };
    case 'UPDATE_HERO': {
      const heroesKey = action.team === 0 ? 'my_heroes' : 'enemy_heroes';
      const hero = (state[heroesKey] as Record<number, Hero>)[action.slot_index];
      if (!hero) return state;
      const updated = { ...hero, ...action.updates };
      return {
        ...state,
        [heroesKey]: { ...(state[heroesKey] as Record<number, Hero>), [action.slot_index]: updated },
      };
    }
    case 'SET_HAND_CARDS':
      return { ...state, hand_cards: action.cards };
    case 'SET_ENERGY':
      return { ...state, energy: action.energy };
    case 'SET_HERO_TARGET':
      return {
        ...state,
        hero_targets: { ...state.hero_targets, [action.hero_slot]: action.enemy_slot },
      };
    case 'CLEAR_HERO_TARGET': {
      const next = { ...state.hero_targets };
      delete next[action.hero_slot];
      return { ...state, hero_targets: next };
    }
    case 'SET_CASTING':
      return {
        ...state,
        casting_by_hero: {
          ...state.casting_by_hero,
          [action.hero_instance_id]: { action_slug: action.action_slug, until_ms: action.until_ms },
        },
      };
    case 'CLEAR_CASTING': {
      const next = { ...state.casting_by_hero };
      delete next[action.hero_instance_id];
      return { ...state, casting_by_hero: next };
    }
    case 'RESET':
      return { ...initialState, hero_defs: state.hero_defs, action_defs: state.action_defs };
    default:
      return state;
  }
}

const GameContext = createContext<{ state: GameStore; dispatch: React.Dispatch<Action> } | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
