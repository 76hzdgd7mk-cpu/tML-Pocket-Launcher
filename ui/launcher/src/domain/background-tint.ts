export type TintRGB = [number, number, number];

export const defaultBackgroundTint = '#a8bea6';

export function hexToRgb(hex: string): TintRGB {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hexToRgb(defaultBackgroundTint);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex([r, g, b]: TintRGB) {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function tintGradient(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const light = (channel: number) => Math.round(channel + (255 - channel) * 0.55);
  return `linear-gradient(130deg, rgb(${light(r)}, ${light(g)}, ${light(b)}), rgb(${r}, ${g}, ${b}))`;
}

export function tintInk(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#24362e' : '#ffffff';
}
