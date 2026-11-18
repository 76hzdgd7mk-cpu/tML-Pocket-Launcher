import {
  addTransitionType,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import { MotionConfig } from 'motion/react';
import type { ActivityKind, LauncherState, Page, Preferences } from '../domain/types';
import { defaultFilters, demoMods } from '../domain/mods';
import {
  defaultPreferences,
  normalizePreferences,
  readPreferences,
  savePreferences,
} from './preferences';
import { tintGradient } from '../domain/background-tint';
import { useLauncherOrientation } from './use-launcher-orientation';
import { nativeMode, nativeRequest, onNativeSnapshot } from '../native/bridge';
import type { NativeSnapshot } from '../native/models';

export interface DialogSpec {
  title: string;
  description: string;
  body?: ReactNode;
  actions?: ReactNode;
  drawer?: boolean;
  prototype?: boolean;
  surface?: 'files';
}
export interface DialogState extends DialogSpec {
  id: number;
  open: boolean;
}
type Update = (updater: (current: LauncherState) => LauncherState) => void;
/** 原生外壳通过 URL 参数传入系统明暗，WebView 的媒体查询不总是可靠。 */
function preferredSystemDark() {
  const preset = new URLSearchParams(location.search).get('system-theme');
  return preset ? preset === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
}
export type NativeWorkspace = 'steam-login' | 'steam-library' | 'downloads';
export const workspaceNames: Record<NativeWorkspace, string> = {
  'steam-login': 'Steam',
  'steam-library': 'Steam',
  downloads: '下载',
};
export interface LauncherContextValue {
  nativeMode: boolean;
  nativeState: NativeSnapshot | null;
  state: LauncherState;
  installed: LauncherState['mods'];
  update: Update;
  navigate: (page: Page) => void;
  nativeWorkspace: NativeWorkspace | null;
  openWorkspace: (workspace: NativeWorkspace) => void;
  closeWorkspace: () => void;
  setPreferences: (patch: Partial<Preferences>) => void;
  dialog: DialogState | null;
  openDialog: (spec: DialogSpec) => void;
  closeDialog: (restore?: boolean) => void;
  returnFocus: React.RefObject<HTMLElement | null>;
  toast: string;
  notify: (text: string, kind?: ActivityKind) => void;
  record: (text: string, kind?: ActivityKind) => void;
  motionEnabled: boolean;
  navigationPending: boolean;
}
const LauncherContext = createContext<LauncherContextValue | null>(null);
export const pageNames: Record<Page, string> = {
  home: '首页',
  games: '游戏',
  mods: '模组',
  patches: '补丁',
  settings: '设置',
};
export const profileTitle = (profile: LauncherState['profile']) =>
  profile === 'preview' ? '示例预览版本' : '示例稳定版本';

function initialState(): LauncherState {
  const hash = location.hash.slice(1).split('/')[0] as Page;
  return {
    page: Object.hasOwn(pageNames, hash) ? hash : 'home',
    demo: false,
    profile: 'stable',
    gameTab: 'installed',
    modTab: new URLSearchParams(location.search).get('tab') === 'browse' ? 'browse' : 'installed',
    patchTab: 'builtin',
    settingsTab: 'appearance',
    localQuery: '',
    localFilter: 'all',
    localSort: 'name',
    filters: { ...defaultFilters },
    mods: nativeMode ? [] : demoMods.map((mod) => ({ ...mod })),
    packs: [],
    configs: {},
    preferences: readPreferences(),
    patchEnabled: true,
    task: null,
    activity: [],
  };
}
export function LauncherProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const [nativeWorkspace, setNativeWorkspace] = useState<NativeWorkspace | null>(() => {
    const route = location.hash.split('/')[1] as NativeWorkspace;
    return nativeMode && Object.hasOwn(workspaceNames, route) ? route : null;
  });
  const workspaceReturn = useRef<NativeWorkspace | null>(null);
  const [nativeState, setNativeState] = useState<NativeSnapshot | null>(null);
  const nativeHydrated = useRef(false);
  const [navigationPending, startNavigation] = useTransition();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState('');
  const [pointer, setPointer] = useState(true);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia('(prefers-reduced-motion:reduce)').matches,
  );
  const [systemDark, setSystemDark] = useState(preferredSystemDark);
  const motionEnabled = pointer && state.preferences.motion && !systemReduced;
  const returnFocus = useRef<HTMLElement | null>(null);
  const dialogOpen = useRef(false);
  const nextId = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const update = useCallback<Update>((updater) => setState(updater), []);
  const record = useCallback((text: string, kind: ActivityKind = '提示') => {
    setState((current) =>
      current.activity.at(-1)?.text === text
        ? current
        : {
            ...current,
            activity: [
              ...current.activity,
              { id: ++nextId.current, text, kind, time: Date.now() },
            ].slice(-50),
          },
    );
  }, []);
  const notify = useCallback(
    (text: string, kind: ActivityKind = '提示') => {
      setToast(text);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(''), 3000);
      record(text, kind);
    },
    [record],
  );
  const closeDialog = useCallback((restore = true) => {
    dialogOpen.current = false;
    if (!restore) returnFocus.current = null;
    setDialog((current) => (current ? { ...current, open: false } : null));
  }, []);
  const openDialog = useCallback((spec: DialogSpec) => {
    if (!dialogOpen.current)
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogOpen.current = true;
    setDialog({ ...spec, id: ++nextId.current, open: true });
  }, []);
  const navigate = useCallback(
    (page: Page) => {
      const commit = () => {
        closeDialog(false);
        setNativeWorkspace(null);
        workspaceReturn.current = null;
        history.replaceState(null, '', '#' + page);
        setState((current) => ({ ...current, page }));
      };
      if (
        !motionEnabled ||
        document.documentElement.dataset.input === 'keyboard' ||
        typeof document.startViewTransition !== 'function' ||
        page === state.page
      ) {
        commit();
        return;
      }
      const order: Page[] = ['home', 'games', 'mods', 'patches', 'settings'];
      startNavigation(() => {
        addTransitionType(
          order.indexOf(page) < order.indexOf(state.page) ? 'nav-back' : 'nav-forward',
        );
        commit();
      });
    },
    [closeDialog, motionEnabled, state.page, startNavigation],
  );
  const changeWorkspace = useCallback(
    (next: NativeWorkspace | null, back = false) => {
      const commit = () => {
        closeDialog(false);
        setNativeWorkspace(next);
        history.replaceState(null, '', '#' + state.page + (next ? '/' + next : ''));
      };
      if (
        !motionEnabled ||
        document.documentElement.dataset.input === 'keyboard' ||
        typeof document.startViewTransition !== 'function'
      )
        commit();
      else
        startNavigation(() => {
          addTransitionType(back ? 'nav-back' : 'nav-forward');
          commit();
        });
    },
    [closeDialog, motionEnabled, startNavigation, state.page],
  );
  const openWorkspace = useCallback(
    (next: NativeWorkspace) => {
      if (next === nativeWorkspace) {
        closeDialog(false);
        return;
      }
      workspaceReturn.current =
        next === 'downloads' && nativeWorkspace === 'steam-library' ? 'steam-library' : null;
      changeWorkspace(next);
    },
    [nativeWorkspace, changeWorkspace, closeDialog],
  );
  const closeWorkspace = useCallback(() => {
    const next = workspaceReturn.current;
    workspaceReturn.current = null;
    changeWorkspace(next, true);
  }, [changeWorkspace]);
  const setPreferences = useCallback(
    (patch: Partial<Preferences>) =>
      setState((current) => ({
        ...current,
        preferences: { ...current.preferences, ...patch },
      })),
    [],
  );
  useEffect(() => {
    if (!nativeMode) return;
    const receive = (snapshot: NativeSnapshot) => {
      setNativeState(snapshot);
      if (!nativeHydrated.current && snapshot.preferences) {
        nativeHydrated.current = true;
        setState((current) => ({
          ...current,
          preferences: {
            ...current.preferences,
            ...normalizePreferences(
              Object.fromEntries(
                Object.entries(snapshot.preferences).filter(([key]) =>
                  Object.hasOwn(defaultPreferences, key),
                ),
              ),
            ),
          },
        }));
      }
    };
    const unsubscribe = onNativeSnapshot(receive);
    void nativeRequest<NativeSnapshot>('state')
      .then(receive)
      .catch((error: Error) => setToast(error.message));
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!nativeMode || !nativeHydrated.current) return;
    const timer = setTimeout(() => {
      const { customImage: _image, ...preferences } = state.preferences;
      void nativeRequest('settings.save', { preferences }).catch((error: Error) =>
        setToast(error.message),
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [state.preferences]);
  useEffect(() => {
    if (!nativeMode) return;
    const back = () => {
      if (dialogOpen.current) closeDialog();
      else if (nativeWorkspace) closeWorkspace();
      else if (state.page !== 'home') navigate('home');
      else if (nativeState?.busy) {
        openDialog({
          title: '任务仍在进行',
          description: '关闭启动器会取消当前操作，请在下载与任务中先完成或取消。',
        });
      } else void nativeRequest('finish');
    };
    window.addEventListener('launcher:back', back);
    return () => window.removeEventListener('launcher:back', back);
  }, [
    closeDialog,
    navigate,
    state.page,
    nativeState?.busy,
    openDialog,
    nativeWorkspace,
    closeWorkspace,
  ]);
  useEffect(() => {
    if (!nativeWorkspace) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !dialogOpen.current) {
        event.preventDefault();
        closeWorkspace();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [nativeWorkspace, closeWorkspace]);
  useLauncherOrientation(state.preferences.orientation, setPreferences);
  useEffect(() => {
    const down = (event: PointerEvent) => {
      // Motion dispatches pointer events without a pointerType for Enter presses.
      if (!event.pointerType) return;
      setPointer(true);
      document.documentElement.dataset.input = 'pointer';
    };
    const key = () => {
      setPointer(false);
      document.documentElement.dataset.input = 'keyboard';
    };
    const media = matchMedia('(prefers-reduced-motion:reduce)');
    const reduce = () => setSystemReduced(media.matches);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', down, { capture: true, passive: true });
    document.addEventListener('keydown', key, true);
    media.addEventListener('change', reduce);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', down, true);
      document.removeEventListener('keydown', key, true);
      media.removeEventListener('change', reduce);
      clearTimeout(toastTimer.current);
    };
  }, []);
  useLayoutEffect(() => {
    const preferences = state.preferences;
    const dark = preferences.theme === 'system' ? systemDark : preferences.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#0c0f14' : '#f5f6f3');
    document.documentElement.dataset.motion = preferences.motion ? 'full' : 'reduced';
    document.documentElement.dataset.glass = preferences.glassEffects ? 'on' : 'off';
    document.documentElement.style.setProperty('--glass', preferences.glass + '%');
    document.body.classList.toggle('has-background', preferences.background !== 'none');
    if (preferences.background === 'diy')
      document.body.style.setProperty(
        '--custom-background',
        tintGradient(preferences.backgroundTint),
      );
    else if (preferences.background === 'custom' && preferences.customImage)
      document.body.style.setProperty('--custom-background', `url("${preferences.customImage}")`);
    else document.body.style.removeProperty('--custom-background');
    savePreferences(preferences);
  }, [state.preferences, systemDark]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme:dark)');
    const mediaChange = () => {
      if (!nativeMode) setSystemDark(media.matches);
    };
    const nativeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ dark?: boolean }>).detail;
      if (typeof detail?.dark === 'boolean') setSystemDark(detail.dark);
    };
    media.addEventListener('change', mediaChange);
    window.addEventListener('launcher:system-theme', nativeChange);
    return () => {
      media.removeEventListener('change', mediaChange);
      window.removeEventListener('launcher:system-theme', nativeChange);
    };
  }, []);
  useEffect(() => {
    if (!nativeMode || state.preferences.theme !== 'system') return;
    // 每次选择（或再次点击）“跟随系统”都向原生重新查询，避免缓存值过期。
    void nativeRequest<{ dark?: boolean }>('appearance.system')
      .then((result) => setSystemDark(Boolean(result?.dark)))
      .catch(() => {});
  }, [state.preferences]);
  const value = useMemo(
    () => ({
      nativeMode,
      nativeState,
      state,
      installed: state.mods.filter((mod) => state.demo || mod.installed),
      update,
      navigate,
      nativeWorkspace,
      openWorkspace,
      closeWorkspace,
      setPreferences,
      dialog,
      openDialog,
      closeDialog,
      returnFocus,
      toast,
      notify,
      record,
      motionEnabled,
      navigationPending,
    }),
    [
      nativeState,
      state,
      update,
      navigate,
      nativeWorkspace,
      openWorkspace,
      closeWorkspace,
      setPreferences,
      dialog,
      openDialog,
      closeDialog,
      toast,
      notify,
      record,
      motionEnabled,
      navigationPending,
    ],
  );
  return (
    <LauncherContext.Provider value={value}>
      <AnimateUIProvider
        tempo={motionEnabled ? 0.8 : 0}
        reducedMotion={motionEnabled ? 'never' : 'always'}
      >
        <MotionConfig reducedMotion={motionEnabled ? 'never' : 'always'}>{children}</MotionConfig>
      </AnimateUIProvider>
    </LauncherContext.Provider>
  );
}
export function useLauncher() {
  const context = useContext(LauncherContext);
  if (!context) throw new Error('LauncherProvider is required');
  return context;
}
