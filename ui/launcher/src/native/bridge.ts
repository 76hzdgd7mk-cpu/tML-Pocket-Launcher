import type { NativeSnapshot } from './models';

interface NativePort {
  postMessage(message: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}
declare global {
  interface Window {
    LauncherNative?: NativePort;
  }
}

export const nativeMode = typeof window.LauncherNative?.postMessage === 'function';
const waiting = new Map<
  string,
  {
    resolve(value: unknown): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const listeners = new Set<(snapshot: NativeSnapshot) => void>();
let sequence = 0;
const session = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
if (nativeMode) {
  window.LauncherNative!.onmessage = (event) => {
    let message: { event?: string; data?: unknown; id?: string; ok?: boolean; error?: string };
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.event === 'snapshot') {
      const snapshot = message.data as NativeSnapshot;
      if (snapshot?.protocol === 1) listeners.forEach((listener) => listener(snapshot));
      return;
    }
    if (!message.id) return;
    const pending = waiting.get(message.id);
    if (!pending) return;
    waiting.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.data);
    else pending.reject(new Error(message.error || 'Android 操作失败'));
  };
}

export function nativeRequest<T = unknown>(method: string, params: object = {}): Promise<T> {
  if (!nativeMode) return Promise.reject(new Error('此功能需要 Android 启动器'));
  const id = `${session}-${++sequence}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        waiting.delete(id);
        reject(new Error('操作等待超时，请查看任务或重试'));
      },
      method === 'store.steam.probe' || method === 'launch'
        ? 180_000
        : [
              'import',
              'files.export',
              'download',
              'workshop.download',
              'export',
              'store.steam.download',
              'store.gog.download',
              'store.gog.authorize',
            ].includes(method)
          ? 60 * 60 * 1000
          : 90_000,
    );
    waiting.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    try {
      window.LauncherNative!.postMessage(JSON.stringify({ id, method, params }));
    } catch (error) {
      clearTimeout(timer);
      waiting.delete(id);
      reject(error);
    }
  });
}

export function onNativeSnapshot(listener: (snapshot: NativeSnapshot) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
