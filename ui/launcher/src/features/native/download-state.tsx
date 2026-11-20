import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { nativeRequest } from '../../native/bridge';
import { useLauncher } from '../../state/launcher';

export type DownloadMethod =
  | 'download'
  | 'store.steam.download'
  | 'store.gog.download'
  | 'workshop.download';
export interface DownloadRequest {
  method: DownloadMethod;
  params?: object;
  name: string;
  source: string;
}
export interface DownloadTask extends DownloadRequest {
  id: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  message: string;
  progress: number;
  error?: string;
  cancelling: boolean;
}
interface DownloadsContextValue {
  task: DownloadTask | null;
  start: (request: DownloadRequest) => void;
  cancel: () => void;
  retry: () => void;
  show: () => void;
  minimize: () => void;
}
const DownloadsContext = createContext<DownloadsContextValue | null>(null);

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const { nativeState, dialog, openDialog, closeDialog, notify } = useLauncher();
  const [task, setTask] = useState<DownloadTask | null>(null);
  const active = useRef(false);
  const cancelRequested = useRef(false);
  const sequence = useRef(0);
  const show = () =>
    openDialog({
      title: '下载与安装',
      description: '下载完成后自动校验并安装；最小化后可在下载任务中查看。',
      surface: 'download',
    });
  const start = (request: DownloadRequest) => {
    if (active.current) {
      show();
      return;
    }
    if (nativeState?.busy) {
      notify('已有任务正在进行，请先完成或取消。');
      return;
    }
    active.current = true;
    cancelRequested.current = false;
    const id = ++sequence.current;
    setTask({
      ...request,
      id,
      status: 'running',
      cancelling: false,
      progress: -1,
      message: '正在准备下载…',
    });
    show();
    void nativeRequest(request.method, request.params)
      .then(() => {
        setTask({
          ...request,
          id,
          status: 'completed',
          cancelling: false,
          progress: 100,
          message: '下载、校验与安装已完成。',
        });
        notify(`${request.name} 已下载、校验并安装。`, '任务');
      })
      .catch((failure: unknown) => {
        const error =
          failure instanceof Error && failure.message.trim()
            ? failure.message
            : '下载未完成，请重试。';
        const cancelled = cancelRequested.current;
        setTask({
          ...request,
          id,
          status: cancelled ? 'cancelled' : 'failed',
          cancelling: false,
          progress: -1,
          message: error,
          error,
        });
        if (!cancelled) notify(`${request.name} 下载未完成，可在下载任务中查看原因。`, '任务');
      })
      .finally(() => {
        active.current = false;
      });
  };
  const cancel = () => {
    if (!active.current || cancelRequested.current) return;
    cancelRequested.current = true;
    setTask((current) => (current ? { ...current, cancelling: true } : current));
    void nativeRequest('cancel').catch((failure: Error) => {
      cancelRequested.current = false;
      setTask((current) => (current ? { ...current, cancelling: false } : current));
      notify(failure.message);
    });
  };
  const progressTask =
    task?.status === 'running' && nativeState?.operation === task.method
      ? { ...task, message: nativeState.message, progress: nativeState.progress }
      : task;
  return (
    <DownloadsContext.Provider
      value={{
        task: progressTask,
        start,
        cancel,
        retry: () => {
          if (task && task.status !== 'running') {
            const { method, params, name, source } = task;
            start({ method, params, name, source });
          }
        },
        show,
        minimize: () => {
          if (dialog?.surface === 'download') closeDialog();
        },
      }}
    >
      {children}
    </DownloadsContext.Provider>
  );
}
export function useDownloads() {
  const context = useContext(DownloadsContext);
  if (!context) throw new Error('DownloadsProvider is required');
  return context;
}
