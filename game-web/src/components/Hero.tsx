import type { Hero } from '../types/game';

interface HeroProps {
  hero: Hero;
  hero_def: { full_name: string; tint: string; stats: { max_hp: number } };
  is_targeted: boolean;
  is_casting: boolean;
  cast_progress: number; // 0-1
  onSelect?: (hero: Hero) => void;
}

export function HeroDisplay({ hero, hero_def, is_targeted, is_casting, cast_progress, onSelect }: HeroProps) {
  const hp_pct = Math.max(0, hero.current_hp / hero.max_hp);
  const tint = hero_def.tint;

  return (
    <div
      onClick={() => onSelect?.(hero)}
      style={{
        position: 'relative',
        width: 140,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: onSelect ? 'pointer' : 'default',
        filter: !hero.is_alive ? 'grayscale(1) opacity(0.5)' : undefined,
      }}
    >
      {/* Hero avatar */}
      <div style={{
        width: 100, height: 120,
        background: `linear-gradient(180deg, ${tint}44 0%, ${tint}22 100%)`,
        border: `3px solid ${tint}`,
        borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2.5rem', fontWeight: 'bold', color: tint,
        position: 'relative',
      }}>
        {hero_def.full_name.charAt(0)}
        {is_casting && (
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
            <circle
              cx="50" cy="60" r="45"
              fill="none" stroke="#4a90d9" strokeWidth="4"
              strokeDasharray={`${cast_progress * 283} 283`}
              strokeLinecap="round"
              transform="rotate(-90 50 60)"
            />
          </svg>
        )}
        {is_targeted && (
          <div style={{
            position: 'absolute', inset: -6,
            border: '3px solid #f00', borderRadius: 14,
            animation: 'pulse 0.8s infinite',
          }} />
        )}
      </div>

      {/* Name + HP */}
      <div style={{ marginTop: 6, textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ddd' }}>{hero_def.full_name}</div>
        <div style={{ height: 8, background: '#333', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${hp_pct * 100}%`,
            background: hp_pct > 0.5 ? '#4ade80' : hp_pct > 0.25 ? '#facc15' : '#ef4444',
            borderRadius: 4, transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 2 }}>
          {hero.current_hp} / {hero.max_hp}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
