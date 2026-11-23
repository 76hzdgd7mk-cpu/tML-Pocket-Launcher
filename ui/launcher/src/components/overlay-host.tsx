import { useTranslation } from '../i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@animate-ui/react/primitives/radix-ui/dialog';
import { IconButton } from './ui';
import { useLauncher } from '../state/launcher';
import { NativeDownloadsPage } from '../features/native/steam/downloads';

export function OverlayHost() {
  const { t } = useTranslation();
  const { dialog, closeDialog, returnFocus, motionEnabled, nativeMode } = useLauncher();
  const [portrait, setPortrait] = useState(() => matchMedia('(max-width:480px)').matches);
  const isOpen = useRef(Boolean(dialog?.open));
  isOpen.current = Boolean(dialog?.open);
  useEffect(() => {
    const media = matchMedia('(max-width:480px)');
    const change = () => setPortrait(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (shell) shell.inert = Boolean(dialog?.open);
    const surface = document.querySelector<HTMLElement>('.animate-dialog');
    if (surface) {
      surface.inert = !dialog?.open;
      if (dialog?.open) {
        surface.removeAttribute('aria-hidden');
        surface.removeAttribute('data-closing');
      } else {
        surface.setAttribute('aria-hidden', 'true');
        surface.dataset.closing = '';
      }
    }
    if (!dialog?.open && returnFocus.current?.isConnected)
      returnFocus.current.focus({ preventScroll: true });
    return () => {
      if (shell) shell.inert = false;
    };
  }, [dialog?.open, returnFocus]);
  if (!dialog) return null;
  const open = dialog.open;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <Dialog.Portal container={document.getElementById('overlay-root')}>
        <Dialog.Overlay
          data-slot="dialog-overlay"
          className="animate-overlay"
          transition={{ duration: motionEnabled ? 0.2 : 0 }}
          exitTransition={{ duration: motionEnabled ? 0.16 : 0 }}
        />
        <Dialog.Content
          className={`dialog animate-dialog ${dialog.drawer ? 'drawer animate-sheet' : 'animate-modal'} ${dialog.surface === 'files' ? 'file-dialog' : dialog.surface === 'download' ? 'download-dialog' : ''}`}
          data-slot="dialog-content"
          aria-labelledby="dialog-title"
          data-side={dialog.drawer ? (portrait ? 'bottom' : 'right') : undefined}
          data-closing={open ? undefined : ''}
          aria-hidden={open ? undefined : true}
          inert={!open}
          transition={{
            duration: motionEnabled ? (dialog.drawer ? 0.26 : 0.2) : 0,
            ease: [0.23, 1, 0.32, 1],
          }}
          exitTransition={{
            duration: motionEnabled ? 0.16 : 0,
            ease: [0.23, 1, 0.32, 1],
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.querySelector<HTMLElement>('.animate-dialog')?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!isOpen.current && returnFocus.current?.isConnected)
              returnFocus.current.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={() => closeDialog()}
        >
          <div className="dialog-header">
            <Dialog.Title id="dialog-title">{dialog.title}</Dialog.Title>
            {dialog.surface === 'files' && (
              <span className="file-dialog-kind">{dialog.description}</span>
            )}
            <IconButton
              symbol={dialog.surface === 'download' ? 'minus' : 'close'}
              label={dialog.surface === 'download' ? t('最小化') : t('关闭')}
              data-action="close"
              onClick={() => closeDialog()}
            />
          </div>
          <div className={dialog.drawer ? 'drawer-body' : 'modal-body'}>
            <Dialog.Description>{dialog.description}</Dialog.Description>
            <div className="dialog-feature-content" key={dialog.id}>
              {dialog.surface === 'download' ? <NativeDownloadsPage compact /> : dialog.body}
            </div>
          </div>
          {dialog.actions && <div className="dialog-actions">{dialog.actions}</div>}
          {!nativeMode && dialog.drawer && dialog.prototype !== false && (
            <div className="drawer-footer">
              {t('交互原型 · 示例流程，不会发起实际登录或下载。')}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
