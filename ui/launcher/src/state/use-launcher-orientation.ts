import { useEffect } from 'react';
import type { Preferences } from '../domain/types';

// The phone preview resizes its existing frame, preserving launcher session state.
// A regular browser viewport remains responsive; it is never rotated with CSS.
export function useLauncherOrientation(
  orientation: Preferences['orientation'],
  setPreferences: (patch: Partial<Preferences>) => void,
) {
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        window.parent === window ||
        event.source !== window.parent ||
        event.origin !== location.origin
      )
        return;
      const data = event.data;
      if (
        data?.type === 'launcher:set-orientation' &&
        (data.orientation === 'landscape' || data.orientation === 'portrait')
      )
        setPreferences({ orientation: data.orientation });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [setPreferences]);

  useEffect(() => {
    document.documentElement.dataset.orientation = orientation;
    if (window.parent !== window)
      window.parent.postMessage({ type: 'launcher:orientation', orientation }, location.origin);
  }, [orientation]);
}
