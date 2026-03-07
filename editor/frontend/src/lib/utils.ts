import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function ensureHexColor(color: string): string {
  if (!color) return '#000000';
  
  // Check for hex format
  if (color.startsWith('#')) {
    if (color.length === 7) return color;
    if (color.length === 4) {
      // Expand shorthand hex
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }
    // Invalid hex length, fallback
    return '#000000';
  }

  // Check for rgb/rgba
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const [, r, g, b] = match;
    const toHex = (n: string) => parseInt(n).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  return '#000000';
}
