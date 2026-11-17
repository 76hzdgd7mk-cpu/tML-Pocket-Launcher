import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useLauncher } from '../state/launcher';

// Adapted from Inspira UI's LiquidGlass.vue (MIT). See public/inspira-ui-license.txt.
// Refraction belongs to the backdrop layer; foreground text never enters the filter.
export function LiquidGlassSurface() {
  const { state } = useLauncher();
  const enabled = state.preferences.glassEffects;
  const id = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const surface = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // SVG backdrop filters currently render reliably in Chromium. Other engines use CSS blur.
  const refracts =
    /(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent) &&
    CSS.supports('backdrop-filter', `url(#${id})`);
  useLayoutEffect(() => {
    if (!enabled || !refracts || !surface.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, [enabled, refracts]);
  if (!enabled) return null;
  const { width, height } = size;
  const ready = refracts && width > 8 && height > 8;
  const radius = Math.min(34, height / 2);
  const map = `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="red"><stop stop-color="red"/><stop offset="1" stop-color="black"/></linearGradient>
        <linearGradient id="blue" x1="0" y1="0" x2="0" y2="1"><stop stop-color="black"/><stop offset="1" stop-color="blue"/></linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="${radius}" fill="url(#red)"/>
      <rect width="100%" height="100%" rx="${radius}" fill="url(#blue)" style="mix-blend-mode:difference"/>
      <rect x="12" y="12" width="${Math.max(0, width - 24)}" height="${Math.max(0, height - 24)}" rx="${Math.max(0, radius - 12)}" fill="#808080" style="filter:blur(3px)"/>
    </svg>
  `)}`;
  return (
    <span
      ref={surface}
      className="glass-lens"
      aria-hidden="true"
      data-refraction={ready ? 'on' : 'fallback'}
      style={ready ? { backdropFilter: `blur(2px) saturate(1.15) url(#${id})` } : undefined}
    >
      {ready && (
        <svg className="glass-filter" width="0" height="0" focusable="false">
          <defs>
            <filter
              id={id}
              x="0%"
              y="0%"
              width="100%"
              height="100%"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={map}
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="map"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale="-12"
                xChannelSelector="R"
                yChannelSelector="B"
                result="red-displaced"
              />
              <feColorMatrix
                in="red-displaced"
                type="matrix"
                values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
                result="red"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale="-13"
                xChannelSelector="R"
                yChannelSelector="B"
                result="green-displaced"
              />
              <feColorMatrix
                in="green-displaced"
                type="matrix"
                values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
                result="green"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale="-14"
                xChannelSelector="R"
                yChannelSelector="B"
                result="blue-displaced"
              />
              <feColorMatrix
                in="blue-displaced"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
                result="blue"
              />
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" />
            </filter>
          </defs>
        </svg>
      )}
    </span>
  );
}
