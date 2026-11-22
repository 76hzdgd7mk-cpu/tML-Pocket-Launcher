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
  installedModId?: string;
}
interface DownloadsContextValue {
  tasks: DownloadTask[];
  focusedTask: DownloadTask | undefined;
  start: (request: DownloadRequest) => void;
  cancel: () => void;
  retry: (id: number) => void;
  show: (id: number) => void;
  minimize: () => void;
}
const DownloadsContext = createContext<DownloadsContextValue | null>(null);

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const { nativeState, dialog, openDialog, closeDialog, notify } = useLauncher();
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [focusedId, setFocusedId] = useState<number>();
  const activeId = useRef<number | undefined>(undefined);
  const cancelRequested = useRef(false);
  const sequence = useRef(0);
  const show = (id: number) => {
    setFocusedId(id);
    openDialog({
      title: '下载与安装',
      description: '最小化后可在下载任务中查看进度。',
      surface: 'download',
    });
  };
  const saveTask = (task: DownloadTask) =>
    setTasks((current) => [task, ...current.filter((entry) => entry.id !== task.id)]);
  const start = (request: DownloadRequest, retryId?: number) => {
    if (activeId.current !== undefined) {
      show(activeId.current);
      return;
    }
    if (nativeState?.busy) {
      notify('已有任务正在进行，请先完成或取消。');
      return;
    }
    const id = retryId ?? ++sequence.current;
    activeId.current = id;
    cancelRequested.current = false;
    saveTask({
      ...request,
      id,
      status: 'running',
      cancelling: false,
      progress: -1,
      message: '正在准备下载…',
    });
    show(id);
    void nativeRequest<{ modId?: string | null } | boolean>(request.method, request.params)
      .then((result) => {
        saveTask({
          ...request,
          id,
          status: 'completed',
          cancelling: false,
          progress: 100,
          message: '下载、校验与安装已完成。',
          installedModId: typeof result === 'object' ? (result?.modId ?? undefined) : undefined,
        });
        notify(`${request.name} 已下载、校验并安装。`, '任务');
      })
      .catch((failure: unknown) => {
        const error =
          failure instanceof Error && failure.message.trim()
            ? failure.message
            : '下载未完成，请重试。';
        const cancelled = cancelRequested.current;
        saveTask({
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
        activeId.current = undefined;
      });
  };
  const cancel = () => {
    const id = activeId.current;
    if (id === undefined || cancelRequested.current) return;
    const setCancelling = (cancelling: boolean) =>
      setTasks((current) => current.map((task) =>
        task.id === id && task.status === 'running' ? { ...task, cancelling } : task,
      ));
    cancelRequested.current = true;
    setCancelling(true);
    void nativeRequest('cancel').catch((failure: Error) => {
      if (activeId.current !== id) return;
      cancelRequested.current = false;
      setCancelling(false);
      notify(failure.message);
    });
  };
  const currentTasks = tasks.map((task) =>
    task.status === 'running' && nativeState?.busy && nativeState.operation === task.method
      ? { ...task, message: nativeState.message, progress: nativeState.progress }
      : task,
  );
  return (
    <DownloadsContext.Provider
      value={{
        tasks: currentTasks,
        focusedTask: currentTasks.find((task) => task.id === focusedId),
        start,
        cancel,
        retry: (id) => {
          const task = tasks.find((entry) => entry.id === id);
          if (task && (task.status === 'failed' || task.status === 'cancelled')) {
            const { method, params, name, source } = task;
            start({ method, params, name, source }, id);
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
