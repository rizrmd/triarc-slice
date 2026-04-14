import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useGame } from './GameContext';

interface WSContextValue {
  send: (msg: object) => void;
  connected: boolean;
  authenticated: boolean;
}

const WSContext = createContext<WSContextValue | null>(null);

const WS_URL = import.meta.env.VITE_WS_URL ?? 'wss://sg.vangambit.com/ws';

type Phase = 1 | 2 | 3;

function phaseToState(p: Phase): 'waiting' | 'loading' | 'playing' | 'ended' {
  if (p === 1) return 'waiting';
  if (p === 2) return 'playing';
  return 'ended';
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { dispatch } = useGame();
  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);
  const authenticatedRef = useRef(false);
  const matchIdRef = useRef<string | null>(null);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    let dead = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (dead) return;
        console.log('[WS] connected');
        // Send anonymous auth immediately after connect
        send({ type: 'authenticate', id_token: '' });
      };

      ws.onclose = () => {
        connectedRef.current = false;
        authenticatedRef.current = false;
        if (!dead) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (e) => console.error('[WS] error', e);

      ws.onmessage = (event) => {
        if (dead) return;
        try {
          const msg = JSON.parse(event.data) as { type: string; [key: string]: unknown };
          handleMessage(msg);
        } catch {
          console.error('[WS] parse error', event.data);
        }
      };
    }

    function handleMessage(msg: { type: string; [key: string]: unknown }) {
      switch (msg.type) {
        case 'connected': {
          connectedRef.current = true;
          // Server sends connected → next we must authenticate
          break;
        }

        case 'authenticated': {
          authenticatedRef.current = true;
          const a = msg as unknown as { player_id: string; display_name: string; session_token?: string };
          dispatch({ type: 'SET_PLAYER', player_id: a.player_id, display_name: a.display_name });
          // Cache session_token for reconnect
          if (a.session_token) {
            localStorage.setItem('vg_session_token', a.session_token);
          }
          break;
        }

        case 'matchmaking_queued': {
          // Stay on main scene, matchmaking in progress
          break;
        }

        case 'match_found': {
          const mf = msg as unknown as { match_id: string; team: number };
          matchIdRef.current = mf.match_id;
          // Server team is 1-based; convert to 0-based (server=1 → our team=0, server=2 → enemy=1)
          dispatch({ type: 'SET_MATCH', match_id: mf.match_id, current_team: (mf.team - 1) as 0 | 1 });
          dispatch({ type: 'SET_SCENE', scene: 'gameplay' });
          break;
        }

        case 'state_update': {
          const su = msg as {
            match?: { match_id: string; phase: Phase; winner?: number };
            heroes?: Array<{
              hero_instance_id: string; hero_slug: string; team: 0 | 1;
              slot_index: number; hp_current: number; hp_max: number; alive: boolean; busy_until?: number;
            }>;
            hand?: Array<{
              team: number; slot_index: number; action_slug: string; action_name: string;
              energy_cost: number; target_rule: string;
            }>;
            team_states?: Array<{ team: 0 | 1; energy: number; energy_max: number }>;
          };

          const phase = su.match?.phase ?? 2;
          dispatch({ type: 'SET_MATCH_STATE', state: phaseToState(phase) });

          if (phase === 3) {
            dispatch({ type: 'SET_MATCH_STATE', state: 'ended' });
          }

          if (su.heroes) {
            const my: Record<number, import('../types/game').Hero> = {};
            const enemy: Record<number, import('../types/game').Hero> = {};
            for (const h of su.heroes) {
              // Server team: 1 = player team, 2 = enemy team → convert to 0, 1
              const team: 0 | 1 = h.team === 1 ? 0 : 1;
              const hero: import('../types/game').Hero = {
                hero_instance_id: h.hero_instance_id,
                hero_slug: h.hero_slug,
                team,
                slot_index: h.slot_index,
                max_hp: h.hp_max,
                current_hp: h.hp_current,
                is_alive: h.alive,
              };
              if (team === 0) my[h.slot_index] = hero;
              else enemy[h.slot_index] = hero;
            }
            dispatch({ type: 'SET_MY_HEROES', heroes: my });
            dispatch({ type: 'SET_ENEMY_HEROES', heroes: enemy });
          }

          if (su.hand) {
            // Server sends hand for both teams; filter to team 1 (player)
            const myHand = su.hand.filter((c) => c.team === 1);
            const cards: import('../types/game').ActionCard[] = myHand.map((c) => ({
              action_slug: c.action_slug,
              slot_index: c.slot_index,
              action_name: c.action_name,
              energy_cost: c.energy_cost,
              target_rule: c.target_rule,
            }));
            dispatch({ type: 'SET_HAND_CARDS', cards });
          }

          if (su.team_states) {
            // Server team 1 = player team (our team = 0)
            const myTeam = su.team_states.find((t) => t.team === 1);
            if (myTeam) dispatch({ type: 'SET_ENERGY', energy: myTeam.energy });
          }
          break;
        }

        case 'event': {
          const ev = msg as unknown as { event_type: string; data: Record<string, unknown> };
          if (ev.event_type === 'cast_started') {
            const d = ev.data as { hero_instance_id: string; action_slug: string; duration_ms: number };
            const until_ms = Date.now() + (d.duration_ms ?? 2000);
            dispatch({ type: 'SET_CASTING', hero_instance_id: d.hero_instance_id, action_slug: d.action_slug, until_ms });
          } else if (ev.event_type === 'cast_ended') {
            const d = ev.data as { hero_instance_id: string };
            dispatch({ type: 'CLEAR_CASTING', hero_instance_id: d.hero_instance_id });
          }
          break;
        }

        default:
          console.log('[WS]', msg.type, msg);
      }
    }

    connect();
    return () => {
      dead = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [dispatch, send]);

  return (
    <WSContext.Provider value={{ send, connected: connectedRef.current, authenticated: authenticatedRef.current }}>
      {children}
    </WSContext.Provider>
  );
}

export function useWS() {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error('useWS must be used within WebSocketProvider');
  return ctx;
}
