import { useState, useRef } from 'react';
import type { ActionCard as ActionCardType, ActionData } from '../types/game';

interface ActionCardProps {
  card: ActionCardType;
  action_def: ActionData | undefined;
  disabled: boolean;
  onDrop: (card: ActionCardType, target_hero_instance_id: string | null) => void;
}

export function ActionCard({ card, action_def, disabled, onDrop }: ActionCardProps) {
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const originRef = useRef({ x: 0, y: 0 });

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    originRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setPos({ x: e.clientX - originRef.current.x, y: e.clientY - originRef.current.y });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setDragging(false);
    // Drop target detection via elementFromPoint
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const heroEl = el?.closest('[data-hero-id]');
    onDrop(card, heroEl ? (heroEl as HTMLElement).dataset.heroId ?? null : null);
  }

  const def = action_def;
  const tint = def?.tint ?? '#888';

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: dragging ? 'fixed' : 'relative',
        left: dragging ? pos.x : undefined,
        top: dragging ? pos.y : undefined,
        width: 90, height: 130,
        background: `linear-gradient(180deg, ${tint}33 0%, ${tint}11 100%)`,
        border: `2px solid ${disabled ? '#444' : tint}`,
        borderRadius: 8,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 6px',
        cursor: disabled ? 'not-allowed' : 'grab',
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
        touchAction: 'none',
        zIndex: dragging ? 1000 : 1,
        boxShadow: dragging ? '0 8px 24px rgba(0,0,0,0.5)' : 'none',
        transition: dragging ? 'none' : 'box-shadow 0.15s',
      }}
    >
      <div style={{ fontSize: '0.6rem', color: '#aaa', textAlign: 'center' }}>
        {def?.full_name ?? card.action_slug}
      </div>
      <div style={{
        width: 50, height: 50,
        background: `${tint}22`,
        border: `2px solid ${tint}`,
        borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.5rem', color: tint,
      }}>
        {card.energy_cost ?? def?.cost ?? 0}
      </div>
      <div style={{ fontSize: '0.55rem', color: '#666', textAlign: 'center' }}>
        {def?.element?.[0] ?? '—'}
      </div>
    </div>
  );
}
