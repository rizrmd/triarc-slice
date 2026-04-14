import { useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { useWS } from '../contexts/WebSocketContext';
import { HeroDisplay } from '../components/Hero';
import { Hand } from '../components/Hand';
import type { ActionCard as ActionCardType } from '../types/game';

export function Gameplay() {
  const { state, dispatch } = useGame();
  const { send } = useWS();
  const timerRef = useRef<number>(0);

  // Sync time_remaining_ms countdown
  useEffect(() => {
    if (state.match_state !== 'playing') return;
    timerRef.current = window.setInterval(() => {
      dispatch({
        type: 'SET_MATCH_STATE',
        state: 'playing',
        time_remaining_ms: Math.max(0, state.time_remaining_ms - 100),
      });
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [state.match_state, state.time_remaining_ms, dispatch]);

  function onHeroClick(_hero: import('../types/game').Hero) {
    // No pre-targeting — server auto-resolves targeting
  }

  function onCast(card: ActionCardType, _target_hero_instance_id: string | null) {
    if (!state.current_match_id) return;
    send({
      type: 'cast_action',
      match_id: state.current_match_id,
      caster_slot: card.slot_index,
      hand_slot_index: card.slot_index,
    });
  }

  const fmt_ms = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const my_hero_list = Object.values(state.my_heroes).sort((a, b) => a.slot_index - b.slot_index);
  const enemy_hero_list = Object.values(state.enemy_heroes).sort((a, b) => a.slot_index - b.slot_index);

  const is_my_turn = state.current_team === 0;

  return (
    <div style={{
      width: '100vw', height: '100vh', background: '#0d1117',
      color: '#fff', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 24px', background: '#161b22', borderBottom: '1px solid #333',
      }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
          {state.match_state === 'playing' ? fmt_ms(state.time_remaining_ms) : state.match_state.toUpperCase()}
        </div>
        <div style={{ fontSize: '1.2rem' }}>
          ⚡ Energy: {state.energy}
        </div>
        <button
          onClick={() => {
            send({ type: 'leave_match', match_id: state.current_match_id ?? '' });
            dispatch({ type: 'RESET' });
            dispatch({ type: 'SET_SCENE', scene: 'main' });
          }}
          style={{ padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Leave
        </button>
      </div>

      {/* Battlefield */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', padding: '20px 40px' }}>
        {/* Enemy row */}
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
          {enemy_hero_list.map((hero) => {
            const def = state.hero_defs[hero.hero_slug];
            if (!def) return null;
            return (
              <div key={hero.hero_instance_id} data-hero-id={hero.hero_instance_id}>
                <HeroDisplay
                  hero={hero} hero_def={def}
                  is_targeted={false}
                  is_casting={false} cast_progress={0}
                  onSelect={onHeroClick}
                />
              </div>
            );
          })}
        </div>

        {/* Center divider */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '60%', height: 2, background: 'linear-gradient(90deg, transparent, #333, transparent)' }} />
        </div>

        {/* My row */}
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
          {my_hero_list.map((hero) => {
            const def = state.hero_defs[hero.hero_slug];
            if (!def) return null;
            const casting = state.casting_by_hero[hero.hero_instance_id];
            return (
              <div key={hero.hero_instance_id} data-hero-id={hero.hero_instance_id}>
                <HeroDisplay
                  hero={hero} hero_def={def}
                  is_targeted={false}
                  is_casting={!!casting}
                  cast_progress={casting ? Math.max(0, 1 - (casting.until_ms - Date.now()) / 2000) : 0}
                  onSelect={onHeroClick}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Hand */}
      <Hand
        cards={state.hand_cards}
        action_defs={state.action_defs}
        disabled={!is_my_turn || state.match_state !== 'playing'}
        energy={state.energy}
        onCast={onCast}
      />

      {/* Match ended overlay */}
      {state.match_state === 'ended' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <h2 style={{ fontSize: '2.5rem', margin: '0 0 20px' }}>Match Over</h2>
          <button
            onClick={() => {
              dispatch({ type: 'RESET' });
              dispatch({ type: 'SET_SCENE', scene: 'main' });
            }}
            style={{ padding: '12px 32px', fontSize: '1.1rem', background: '#4a90d9', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Return to Menu
          </button>
        </div>
      )}
    </div>
  );
}
