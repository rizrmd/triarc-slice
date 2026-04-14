import { useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { loadHeroes, loadActions } from '../data/loader';

export function LoadingScene() {
  const { dispatch } = useGame();

  useEffect(() => {
    async function init() {
      try {
        const [hero_defs, action_defs] = await Promise.all([loadHeroes(), loadActions()]);
        dispatch({ type: 'SET_DEFS', hero_defs, action_defs });
        dispatch({ type: 'SET_SCENE', scene: 'main' });
      } catch (err) {
        console.error('Loading error:', err);
      }
    }
    init();
  }, [dispatch]);

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#1a1a2e', color: '#fff', fontFamily: 'sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', margin: 0 }}>VanGambit</h1>
        <p style={{ color: '#888' }}>Loading...</p>
      </div>
    </div>
  );
}
