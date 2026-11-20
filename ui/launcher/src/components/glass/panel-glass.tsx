import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LiquidGlassSurface } from '../liquid-glass-surface';
import { useLauncher } from '../../state/launcher';
import { liquidGlassEnabled } from '../../state/preferences';

type PanelEntry = { id: number; element: HTMLElement };

// 页面里的大面板也使用液态玻璃：扫描 .panel 并为其挂载透镜。
// 弹层自带玻璃样式，不再叠加，避免折射到被遮罩的壁纸上。
export function PanelGlass() {
  const { state } = useLauncher();
  const enabled = liquidGlassEnabled(state.preferences);
  const [panels, setPanels] = useState<PanelEntry[]>([]);
  const registry = useRef(new Map<HTMLElement, number>());
  const nextId = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setPanels([]);
      return;
    }
    let frame = 0;
    const scan = () => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>('.panel')).filter(
        (panel) =>
          panel.getClientRects().length > 0 &&
          !panel.closest('#overlay-root, .dialog, [role="dialog"]'),
      );
      const entries = elements.map((element) => {
        let id = registry.current.get(element);
        if (id === undefined) {
          id = nextId.current++;
          registry.current.set(element, id);
        }
        return { id, element };
      });
      setPanels((current) =>
        current.length === entries.length &&
        current.every((entry, index) => entry.id === entries[index].id)
          ? current
          : entries,
      );
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scan();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      {panels.map(({ id, element }) =>
        createPortal(<LiquidGlassSurface tone="panel" />, element, id),
      )}
    </>
  );
}
