'use client';

import * as React from 'react';

type PageTransitionEffect =
  | 'fade'
  | 'slide'
  | 'push'
  | 'zoom'
  | 'iris'
  | 'wipe'
  | 'bands'
  | 'stack'
  | 'flow'
  | 'chop'
  | 'random';

type PageTransitionProps = React.ComponentProps<'div'> & {
  effect?: PageTransitionEffect;
  pageKey: React.Key;
};

function PageTransition({
  effect = 'fade',
  pageKey,
  ref,
  children,
  ...props
}: PageTransitionProps) {
  const localRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => localRef.current as HTMLDivElement);
  return (
    <div
      key={pageKey}
      ref={localRef}
      data-slot="page-transition"
      data-page-effect={effect}
      {...props}
    >
      {children}
    </div>
  );
}

export { PageTransition, type PageTransitionProps, type PageTransitionEffect };
