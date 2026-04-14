import { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { useWS } from '../contexts/WebSocketContext';
import { HERO_SLUGS } from '../data/loader';
import { AnimapPlayer } from '../components/AnimapPlayer';

const MAX_HEROES = 3;

export function MainMenu() {
  const { state, dispatch } = useGame();
  const { send } = useWS();
  const [selected, setSelected] = useState<string[]>([]);
  const [matchmaking, setMatchmaking] = useState(false);
  const [panX, setPanX] = useState(0.35);

  useEffect(() => {
    // Smoothly animate panX to target
    const targetPanX = matchmaking ? 0.6 : 0.35;
    let frame: number;
    function animate() {
      setPanX(current => {
        const diff = targetPanX - current;
        if (Math.abs(diff) < 0.001) return targetPanX;
        return current + diff * 0.1;
      });
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [matchmaking]);

  const hero_defs = state.hero_defs;

  function toggleHero(slug: string) {
    if (selected.includes(slug)) {
      setSelected(selected.filter((s) => s !== slug));
    } else if (selected.length < MAX_HEROES) {
      setSelected([...selected, slug]);
    } else {
      // Replace oldest
      setSelected([...selected.slice(1), slug]);
    }
  }

  function findMatch() {
    dispatch({ type: 'SET_SELECTED_HEROES', heroes: selected });
    setMatchmaking(true);
    const msg: Record<string, string> = { type: 'queue_matchmaking' };
    selected.forEach((slug, i) => { msg[`hero_slug_${i + 1}`] = slug; });
    send(msg);
  }

  function startTraining() {
    dispatch({ type: 'SET_SELECTED_HEROES', heroes: selected });
    const msg: Record<string, string> = { type: 'start_training' };
    selected.forEach((slug, i) => { msg[`hero_slug_${i + 1}`] = slug; });
    send(msg);
  }

  function cancelMatch() {
    setMatchmaking(false);
    // No cancel_match message — just reset UI
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      color: '#fff', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <AnimapPlayer slug="main" panX={panX} />
      
      <div style={{
        position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.8) 100%)'
      }} />

      <h1 style={{ marginTop: 40, fontSize: '2.5rem', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>VanGambit</h1>

      {!matchmaking ? (
        <>
          <p style={{ color: '#ccc', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>Select up to {MAX_HEROES} heroes</p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 16, padding: '20px 40px', maxWidth: 900, width: '100%',
          }}>
            {HERO_SLUGS.map((slug) => {
              const def = hero_defs[slug];
              const isSelected = selected.includes(slug);
              if (!def) return null;
              return (
                <div
                  key={slug}
                  onClick={() => toggleHero(slug)}
                  style={{
                    background: isSelected ? 'rgba(42, 74, 127, 0.8)' : 'rgba(30, 45, 74, 0.6)',
                    backdropFilter: 'blur(4px)',
                    border: `3px solid ${isSelected ? '#4a90d9' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 12, padding: 12, cursor: 'pointer',
                    textAlign: 'center', transition: 'all 0.15s',
                    opacity: isSelected ? 1 : 0.85,
                  }}
                >
                  <div style={{
                    width: 80, height: 80, margin: '0 auto 8px', borderRadius: 8,
                    background: `linear-gradient(135deg, ${def.tint}44, ${def.tint}22)`,
                    border: `2px solid ${def.tint}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2rem', fontWeight: 'bold', color: def.tint,
                  }}>
                    {def.full_name.charAt(0)}
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{def.full_name}</div>
                  <div style={{ fontSize: '0.7rem', color: '#ccc', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>HP {def.stats.max_hp}</div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 16 }}>
            <button
              onClick={findMatch}
              disabled={selected.length === 0}
              style={{
                padding: '14px 40px', fontSize: '1.1rem', fontWeight: 'bold',
                background: selected.length > 0 ? '#4a90d9' : 'rgba(255,255,255,0.1)', color: '#fff',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
                opacity: selected.length > 0 ? 1 : 0.5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              Find Match
            </button>
            <button
              onClick={startTraining}
              disabled={selected.length === 0}
              style={{
                padding: '14px 40px', fontSize: '1.1rem', fontWeight: 'bold',
                background: selected.length > 0 ? '#2e7d32' : 'rgba(255,255,255,0.1)', color: '#fff',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
                opacity: selected.length > 0 ? 1 : 0.5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              Training
            </button>
            <button
              onClick={() => dispatch({ type: 'RESET' })}
              style={{
                padding: '14px 24px', fontSize: '1rem',
                background: 'rgba(255,255,255,0.05)', color: '#aaa', 
                backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', marginTop: 60, background: 'rgba(0,0,0,0.6)', padding: 40, borderRadius: 16, backdropFilter: 'blur(8px)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 20, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>Finding match...</div>
          <div style={{
            width: 60, height: 60, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#4a90d9',
            borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto',
          }} />
          <p style={{ color: '#ccc', marginTop: 20, textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>Selected: {selected.join(', ')}</p>
          <button
            onClick={cancelMatch}
            style={{
              marginTop: 20, padding: '10px 30px', background: 'rgba(255,255,255,0.1)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
