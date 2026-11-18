export type TintRGB = [number, number, number];

export const defaultBackgroundTint = '#a8bea6';

/** 解析 #rrggbb；非法值回退到默认色调。 */
export function hexToRgb(hex: string): TintRGB {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hexToRgb(defaultBackgroundTint);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex([r, g, b]: TintRGB) {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** 由基色生成背景渐变，浅色端向白色靠拢，与原柔和色调观感一致。 */
export function tintGradient(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const light = (channel: number) => Math.round(channel + (255 - channel) * 0.55);
  return `linear-gradient(130deg, rgb(${light(r)}, ${light(g)}, ${light(b)}), rgb(${r}, ${g}, ${b}))`;
}

/** 按基色亮度选择可读的文字颜色。 */
export function tintInk(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#24362e' : '#ffffff';
}
