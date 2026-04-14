import type { ActionCard as ActionCardType, ActionData } from '../types/game';
import { ActionCard } from './ActionCard';

interface HandProps {
  cards: ActionCardType[];
  action_defs: Record<string, ActionData>;
  disabled: boolean;
  energy: number;
  onCast: (card: ActionCardType, target_hero_instance_id: string | null) => void;
}

export function Hand({ cards, action_defs, disabled, energy, onCast }: HandProps) {
  return (
    <div style={{
      display: 'flex', gap: 12, justifyContent: 'center',
      padding: '16px 24px',
      background: 'rgba(0,0,0,0.4)',
      borderTop: '1px solid #333',
    }}>
      {cards.map((card) => (
        <ActionCard
          key={`${card.action_slug}:${card.slot_index}`}
          card={card}
          action_def={action_defs[card.action_slug]}
          disabled={disabled || (card.energy_cost ?? action_defs[card.action_slug]?.cost ?? 0) > energy}
          onDrop={onCast}
        />
      ))}
    </div>
  );
}
