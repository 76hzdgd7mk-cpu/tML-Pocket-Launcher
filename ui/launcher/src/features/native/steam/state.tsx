import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { nativeRequest } from '../../../native/bridge';
import { useLauncher } from '../../../state/launcher';

export interface SteamAccount {
  phase: string;
  message: string;
  account: string;
  owned: boolean;
  canReconnect?: boolean;
  diagnostics?: string;
}
export interface SteamDownload {
  id: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  cancelling: boolean;
}
export interface SteamGameDetails {
  appId: number;
  name: string;
  description: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  releaseDate: string;
  headerImage: string;
  storeUrl: string;
  cached: boolean;
  stale: boolean;
  fetchedAt: number;
}
interface SteamContextValue {
  account: SteamAccount | null;
  connectionError: string;
  download: SteamDownload | null;
  refresh: () => Promise<void>;
  openSteam: () => void;
  startDownload: () => void;
  cancelDownload: () => void;
  details: SteamGameDetails | null;
  detailsLoading: boolean;
  detailsError: string;
  loadDetails: (force?: boolean) => Promise<void>;
}
const SteamContext = createContext<SteamContextValue | null>(null);
export const isSteamAuthenticating = (phase: string) =>
  ['connecting', 'reconnecting', 'authenticating', 'email', 'device', 'confirmation'].includes(
    phase,
  );

/** Keeps the store session and download result alive when users leave a page. */
export function SteamProvider({ children }: { children: ReactNode }) {
  const { nativeMode, nativeWorkspace, nativeState, openWorkspace, notify } = useLauncher();
  const [account, setAccount] = useState<SteamAccount | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [download, setDownload] = useState<SteamDownload | null>(null);
  const activeDownload = useRef(false);
  const sequence = useRef(0);
  const cancelRequested = useRef(false);
  const [details, setDetails] = useState<SteamGameDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const loadingDetails = useRef(false);
  const loadDetails = useCallback(async (force = false) => {
    if (loadingDetails.current) return;
    loadingDetails.current = true;
    setDetailsLoading(true);
    setDetailsError('');
    try {
      setDetails(await nativeRequest<SteamGameDetails>('store.steam.details', { refresh: force }));
    } catch (error) {
      setDetailsError((error as Error).message);
    } finally {
      setDetailsLoading(false);
      loadingDetails.current = false;
    }
  }, []);
  useEffect(() => {
    if (
      nativeMode &&
      (nativeWorkspace === 'steam-library' || nativeWorkspace === 'downloads') &&
      !details
    )
      void loadDetails();
  }, [nativeMode, nativeWorkspace, loadDetails, details]);
  const refresh = useCallback(async () => {
    try {
      const result = await nativeRequest<{ steam?: SteamAccount }>('store.status');
      if (result.steam) setAccount(result.steam);
      setConnectionError('');
    } catch (error) {
      setConnectionError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!nativeMode || !nativeWorkspace) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!disposed) timer = setTimeout(poll, 1800);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [nativeMode, nativeWorkspace, refresh]);
  useEffect(() => {
    if (nativeWorkspace === 'steam-login' && account?.phase === 'ready')
      openWorkspace('steam-library');
  }, [nativeWorkspace, account?.phase, openWorkspace]);
  const openSteam = () =>
    openWorkspace(account?.phase === 'ready' ? 'steam-library' : 'steam-login');
  const startDownload = () => {
    if (activeDownload.current) {
      openWorkspace('downloads');
      return;
    }
    if (nativeState?.busy) {
      notify('已有任务正在进行，请先完成或取消。');
      return;
    }
    activeDownload.current = true;
    cancelRequested.current = false;
    const id = ++sequence.current;
    setDownload({ id, status: 'running', cancelling: false });
    openWorkspace('downloads');
    void nativeRequest('store.steam.download')
      .then(() => {
        setDownload({ id, status: 'completed', cancelling: false });
        notify('Terraria 资源已下载、校验并安装。', '任务');
      })
      .catch((error: Error) =>
        setDownload({
          id,
          status: cancelRequested.current ? 'cancelled' : 'failed',
          error: error.message,
          cancelling: false,
        }),
      )
      .finally(() => {
        activeDownload.current = false;
      });
  };
  const cancelDownload = () => {
    if (!activeDownload.current || cancelRequested.current) return;
    cancelRequested.current = true;
    setDownload((current) => (current ? { ...current, cancelling: true } : current));
    void nativeRequest('cancel').catch((error: Error) => {
      cancelRequested.current = false;
      setDownload((current) => (current ? { ...current, cancelling: false } : current));
      notify(error.message);
    });
  };
  return (
    <SteamContext.Provider
      value={{
        account,
        connectionError,
        download,
        refresh,
        openSteam,
        startDownload,
        cancelDownload,
        details,
        detailsLoading,
        detailsError,
        loadDetails,
      }}
    >
      {children}
    </SteamContext.Provider>
  );
}
export function useSteam() {
  const context = useContext(SteamContext);
  if (!context) throw new Error('SteamProvider is required');
  return context;
}
