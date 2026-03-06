import barBg from '@/assets/ui/bar/bar-bg.webp';
import barFg from '@/assets/ui/bar/bar-fg.webp';
import barFrame from '@/assets/ui/bar/bar-frame.webp';

interface BarProps {
  current: number;
  max: number;
  hue?: number;
  fontSize?: number;
  className?: string;
}

export function Bar({ current, max, hue = 0, fontSize = 31, className = '' }: BarProps) {
  const percentage = Math.max(0, Math.min(100, (current / max) * 100));

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Background defines the size */}
      <img 
        src={barBg} 
        alt="Bar Background" 
        className="block h-auto w-full object-contain select-none"
        draggable={false}
      />
      
      {/* Foreground - clipped */}
      <img 
        src={barFg} 
        alt="Bar Foreground" 
        className="absolute inset-0 h-full w-full object-contain select-none"
        style={{ 
          clipPath: `inset(0 ${100 - percentage}% 0 0)`,
          filter: `hue-rotate(${hue}deg)`
        }}
        draggable={false}
      />
      
      {/* Frame */}
      <img 
        src={barFrame} 
        alt="Bar Frame" 
        className="absolute inset-0 h-full w-full object-contain select-none"
        draggable={false}
      />

      {/* Text Overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span 
          className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          style={{ 
            fontFamily: '"Vollkorn", serif',
            fontSize: `${fontSize}px` 
          }}
        >
          {current} / {max}
        </span>
      </div>
    </div>
  );
}
