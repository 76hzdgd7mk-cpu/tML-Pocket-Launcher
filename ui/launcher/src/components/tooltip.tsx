import { useState, type ReactElement } from 'react';
import * as TooltipPrimitive from '@animate-ui/react/primitives/radix-ui/tooltip';
import { useLauncher } from '../state/launcher';

export { Provider as TooltipProvider } from '@animate-ui/react/primitives/radix-ui/tooltip';

export function Tooltip({ label, children }: { label: string; children: ReactElement }) {
  const { dialog } = useLauncher();
  const [open, setOpen] = useState(false);
  return (
    <TooltipPrimitive.Root open={open && !dialog?.open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      {!dialog?.open && (
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            className="launcher-tooltip"
            sideOffset={8}
            collisionPadding={12}
          >
            {label}
            <TooltipPrimitive.Arrow className="tooltip-arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      )}
    </TooltipPrimitive.Root>
  );
}
