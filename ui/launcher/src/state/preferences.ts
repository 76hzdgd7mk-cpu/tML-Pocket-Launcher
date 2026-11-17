import type { Preferences, Tool } from '../domain/types';
import { nativeMode } from '../native/bridge';

export const preferenceKey = 'tml-launcher-ui-v1';
export const toolIds: Tool[] = [
  'mods',
  'browse',
  'packs',
  'patches',
  'controls',
  'storage',
  'tasks',
  'accounts',
  'logs',
  'activity',
];
export const defaultPreferences: Preferences = {
  theme: 'dark',
  orientation: 'landscape',
  motion: true,
  glassEffects: true,
  glass: 85,
  background: 'none',
  quickTools: ['mods', 'patches', 'controls', 'storage'],
};
export function readPreferences(): Preferences {
  const result = { ...defaultPreferences, quickTools: [...defaultPreferences.quickTools] };
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey) || 'null') as Record<
      string,
      unknown
    > | null;
    if (saved?.version !== 1) return result;
    if (['dark', 'light', 'system'].includes(String(saved.theme)))
      result.theme = saved.theme as Preferences['theme'];
    if (saved.orientation === 'landscape' || saved.orientation === 'portrait')
      result.orientation = saved.orientation;
    if (typeof saved.motion === 'boolean') result.motion = saved.motion;
    if (typeof saved.glassEffects === 'boolean') result.glassEffects = saved.glassEffects;
    if (
      typeof saved.glass === 'number' &&
      Number.isFinite(saved.glass) &&
      saved.glass >= 75 &&
      saved.glass <= 100
    )
      result.glass = saved.glass;
    if (saved.background === 'none' || saved.background === 'soft')
      result.background = saved.background;
    if (
      nativeMode &&
      saved.background === 'custom' &&
      typeof saved.customImage === 'string' &&
      saved.customImage.length <= 2 * 1024 * 1024 &&
      /^data:image\/(jpeg|png|webp);base64,/.test(saved.customImage)
    ) {
      result.background = 'custom';
      result.customImage = saved.customImage;
    }
    if (
      Array.isArray(saved.quickTools) &&
      saved.quickTools.length === 4 &&
      new Set(saved.quickTools).size === 4 &&
      saved.quickTools.every((id) => toolIds.includes(id as Tool))
    )
      result.quickTools = saved.quickTools as Tool[];
  } catch {
    /* The defaults remain usable when storage is corrupt or blocked. */
  }
  return result;
}
export function savePreferences(preferences: Preferences) {
  const { customImage, ...safe } = preferences;
  const image =
    nativeMode && customImage && customImage.length <= 2 * 1024 * 1024 ? customImage : undefined;
  try {
    localStorage.setItem(
      preferenceKey,
      JSON.stringify({
        ...safe,
        version: 1,
        background: safe.background === 'custom' && !image ? 'none' : safe.background,
        customImage: image,
      }),
    );
  } catch {
    /* Persistence is optional. */
  }
}
